import {Hono} from 'hono';
import {HTTPException} from 'hono/http-exception';
import {secureHeaders} from 'hono/secure-headers';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';
import {drizzle} from 'drizzle-orm/d1';
import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
import {eq,and} from 'drizzle-orm';
import {validateSubmission,type User,type Media,type Job,type Post,type Channel} from '../../packages/shared/model.ts';
import {rows,type ContextEnv,type Env,type Identity} from './types.ts';
import {readGraphic} from './media.ts';
import {ProviderError,type Provider} from './publishing.ts';
type StoredPost=Omit<Post,'variants'|'jobs'> & {variants:string};
const members=sqliteTable('members',{email:text().primaryKey(),role:text().$type<User['role']>().notNull(),active:integer().notNull()});
const revision=z.number().int().positive();
const draft=z.object({id:z.uuid(),revision:revision.optional(),caption:z.string().max(8000),variants:z.strictObject({linkedin:z.string().max(8000).optional(),instagram:z.string().max(8000).optional(),facebook:z.string().max(8000).optional()}),media_id:z.uuid().nullable()});
function fail(status:400|403|404|409|503,message:string):never{throw new HTTPException(status,{message})}
function admin(user:User){if(user.role!=='administrator')fail(403,'Administrator access required.')}
async function getPost(env:Env,id:string,user:User){
 const p=await env.DB.prepare('SELECT * FROM posts WHERE id=? AND (owner=? OR ?=1)').bind(id,user.email,Number(user.role==='administrator')).first<StoredPost>();
 if(!p)fail(404,'Post unavailable.');return p;
}
async function bytesResponse(env:Env,id:string,mime:string) {
 const file=await env.MEDIA.get(id);
 return file?new Response(file.body,{headers:{'Content-Type':mime,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});
}
export function createApp(identity:Identity,providerFor:(env:Env)=>Provider|null,local=false){
 const app=new Hono<ContextEnv>();
 app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'blob:','data:'],connectSrc:["'self'"],frameAncestors:["'none'"],baseUri:["'none'"],formAction:["'self'"]},referrerPolicy:'no-referrer'}));
 app.onError((err,c)=>{
  if(err instanceof HTTPException)return c.json({error:err.message},err.status);
  if(err instanceof z.ZodError || err instanceof SyntaxError)return c.json({error:'One or more fields are invalid. Check the form and try again.'},400);
  if(err instanceof ProviderError)return c.json({error:err.message},503);
  return c.json({error:'The operation could not be completed. Refresh to check its status.'},500);
 });
 app.get('/delivery/:token',async c=>{
  if(!/^[a-f0-9]{64}$/.test(c.req.param('token')))return c.notFound();
  const m=await c.env.DB.prepare("SELECT m.id,m.mime FROM media m JOIN jobs j ON m.id=j.media_id WHERE j.token=? AND (j.state IN ('sending','scheduled','unknown') OR (j.state='published' AND j.updated>?))").bind(c.req.param('token'),Date.now()-7*86400000).first<Media>();
  return m?bytesResponse(c.env,m.id,m.mime):c.notFound();
 });
 app.use('/api/*',async(c,next)=>{
  c.header('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(c.req.method)&&c.req.header('origin')!==new URL(c.req.url).origin)fail(403,'Same-origin requests required.');
  return next();
 });
 app.use('/api/*',bodyLimit({maxSize:5*1024*1024,onError:c=>c.json({error:'The maximum upload size is 5 MB.'},413)}));
 app.get('/api/entry',c=>c.json({local}));
 app.use('/api/*',async(c,next)=>{
  const email=await identity(c.req.raw,c.env);
  if(!email)return c.json({error:'Sign in to continue.'},401);
  const user=await drizzle(c.env.DB).select({email:members.email,role:members.role}).from(members).where(and(eq(members.email,email),eq(members.active,1))).get();
  if(!user)fail(403,'Ask your administrator for a workspace invitation.');
  c.set('user',user);await next();
 });
 app.get('/api/login',c=>c.redirect('/'));
 app.get('/api/workspace',async c=>{
  const user=c.get('user'),db=c.env.DB,scope=[user.email,Number(user.role==='administrator')];
  const [org,posts,media,channels,jobs,team]=await Promise.all([
   db.prepare('SELECT name,timezone FROM organization').first(),rows<StoredPost>(db,'SELECT * FROM posts WHERE owner=? OR ?=1 ORDER BY updated DESC',...scope),
   rows<Media>(db,'SELECT * FROM media WHERE owner=? OR ?=1 ORDER BY created DESC',...scope),rows<Channel>(db,'SELECT * FROM channels'),
   rows<Job>(db,'SELECT j.id,j.post_id,j.platform,j.state,j.external_id,j.error,j.safe_retry,j.due FROM jobs j JOIN posts p ON p.id=j.post_id WHERE p.owner=? OR ?=1',...scope),
   user.role==='administrator'?rows<User>(db,'SELECT email,role FROM members WHERE active=1 ORDER BY email'):[]]);
  return c.json({user,org,media,channels,configured:!!providerFor(c.env),local,members:team,posts:posts.map(p=>({...p,variants:JSON.parse(p.variants),jobs:jobs.filter(j=>j.post_id===p.id)}))});
 });
 app.post('/api/media',async c=>{
  const image=await readGraphic(c.req.raw),id=crypto.randomUUID(),name=decodeURIComponent(c.req.header('X-Filename')||'Graphic').slice(0,180);
  await c.env.MEDIA.put(id,image.bytes,{httpMetadata:{contentType:image.mime}});
  try{await c.env.DB.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?,?)').bind(id,c.get('user').email,name,image.mime,image.width,image.height,image.bytes.length,Date.now()).run()}catch(err){await c.env.MEDIA.delete(id);throw err}
  return c.json({id},201);
 });
 app.get('/api/media/:id',async c=>{
  const user=c.get('user');
  const m=await c.env.DB.prepare('SELECT * FROM media WHERE id=? AND (owner=? OR ?=1)').bind(c.req.param('id'),user.email,Number(user.role==='administrator')).first<Media>();
  return m?bytesResponse(c.env,m.id,m.mime):c.notFound();
 });
 app.post('/api/posts',async c=>{
  const input=draft.parse(await c.req.json()),db=c.env.DB,user=c.get('user'),now=Date.now();
  if(input.media_id && !await db.prepare('SELECT id FROM media WHERE id=? AND (owner=? OR ?=1)').bind(input.media_id,user.email,Number(user.role==='administrator')).first())fail(403,'Graphic unavailable.');
  if(!input.revision){
   const result=await db.prepare("INSERT INTO posts(id,owner,caption,variants,media_id,state,actor,created,updated) VALUES(?,?,?,?,?,'draft',?,?,?) ON CONFLICT(id) DO NOTHING").bind(input.id,user.email,input.caption,JSON.stringify(input.variants),input.media_id,user.email,now,now).run();
   if(!result.meta.changes)fail(409,'Draft already exists. Refresh before editing.');
  }else{
   const result=await db.prepare("UPDATE posts SET caption=?,variants=?,media_id=?,state='draft',note='',actor=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND (owner=? OR ?=1) AND state IN ('draft','changes_requested','rejected','approved','cancelled')").bind(input.caption,JSON.stringify(input.variants),input.media_id,user.email,now,input.id,input.revision,user.email,Number(user.role==='administrator')).run();
   if(!result.meta.changes)fail(409,'This version cannot be edited. Refresh to see the latest review.');
  }
  return c.json({id:input.id,revision:(input.revision||0)+1});
 });
 app.get('/api/posts/:id/events',async c=>{
  const post=await getPost(c.env,c.req.param('id'),c.get('user'));return c.json(await rows(c.env.DB,'SELECT * FROM events WHERE post_id=? ORDER BY id DESC',post.id));
 });
 app.post('/api/posts/:id/action',async c=>{
  const input=z.object({action:z.enum(['submit','approve','request_changes','reject','schedule','publish','cancel']),revision,note:z.string().max(1000).default(''),due:z.number().int().optional()}).parse(await c.req.json());
  const user=c.get('user');if(input.action!=='submit')admin(user);
  const db=c.env.DB,p=await getPost(c.env,c.req.param('id'),user),now=Date.now();
  const routes={submit:['draft','submitted'],approve:['submitted','approved'],request_changes:['submitted','changes_requested'],reject:['submitted','rejected'],schedule:['approved','dispatch'],publish:['approved','dispatch'],cancel:['dispatch','cancelled']};
  const [from,to]=routes[input.action];if(p.revision!==input.revision||p.state!==from)fail(409,'Post has changed. Refresh before continuing.');
  if(input.action==='submit'){
   const media=await db.prepare('SELECT * FROM media WHERE id=?').bind(p.media_id).first<Media>();
   const error=validateSubmission(p.caption,JSON.parse(p.variants),media);if(error)fail(400,error);
  }
  if(['request_changes','reject'].includes(input.action)&&!input.note.trim())fail(400,'Add a review comment for the designer.');
  if(to==='dispatch'){
   if(!providerFor(c.env))fail(503,'Publishing is unavailable. Configure Buffer in Settings.');
   const channels=await rows<Channel>(db,'SELECT * FROM channels');
   if(Object.keys(JSON.parse(p.variants)).some(key=>!channels.some(c=>c.platform===key)))fail(409,'Connect each selected platform in Settings first.');
   if(input.action==='schedule'&&(!input.due||input.due<now+600000))fail(400,'Choose a time at least ten minutes ahead.');
  }
  const guard=input.action==='cancel'?" AND NOT EXISTS (SELECT 1 FROM jobs WHERE post_id=posts.id AND revision=posts.revision AND state<>'queued')":'';
  const result=await db.prepare('UPDATE posts SET state=?,actor=?,note=?,due=?,revision=revision+1,updated=? WHERE id=? AND revision=? AND state=?'+guard).bind(to,user.email,input.note,input.action==='schedule'?input.due!:null,now,p.id,p.revision,from).run();
  if(!result.meta.changes)fail(409,'Handoff has started or the post changed. Refresh to check.');
  return c.json({ok:true});
 });
 app.post('/api/jobs/:id/retry',async c=>{
  admin(c.get('user'));if(!providerFor(c.env))fail(503,'Configure Buffer first.');
  const db=c.env.DB,now=Date.now(),id=c.req.param('id');
  const result=await db.prepare("UPDATE jobs SET state='queued',error=?,safe_retry=0,next_check=?,updated=? WHERE id=? AND state='failed' AND external_id IS NULL AND safe_retry=1 AND (due IS NULL OR due>?) AND (SELECT provider_pause FROM organization)<=?").bind('Retry requested by '+c.get('user').email,now,now,id,now+60000,now).run();
  if(!result.meta.changes)fail(409,'This delivery cannot be retried safely or a cooldown is active.');return c.json({ok:true});
 });
 app.post('/api/channels/sync',async c=>{
  admin(c.get('user'));const provider=providerFor(c.env);if(!provider)fail(503,'Set the Buffer key, organization ID and media origin first.');
  const channels=await provider.channels();const db=c.env.DB;
  await db.batch([db.prepare('DELETE FROM channels'),...channels.map(x=>db.prepare('INSERT INTO channels VALUES(?,?,?)').bind(x.platform,x.external_id,x.name))]);return c.json({count:channels.length});
 });
 app.post('/api/settings',async c=>{
  admin(c.get('user'));const {name,timezone}=z.object({name:z.string().trim().min(1).max(80),timezone:z.string().max(80)}).parse(await c.req.json());try{Intl.DateTimeFormat('en',{timeZone:timezone})}catch{fail(400,'Enter a valid IANA timezone.')}
  await c.env.DB.prepare('UPDATE organization SET name=?,timezone=?').bind(name,timezone).run();return c.json({ok:true});
 });
 app.post('/api/members',async c=>{
  const user=c.get('user');admin(user);const {email,role,active}=z.object({email:z.email().toLowerCase(),role:z.enum(['designer','administrator']),active:z.boolean().default(true)}).parse(await c.req.json());
  if(email===user.email)fail(400,'Another administrator must change your access.');
  await c.env.DB.prepare('INSERT INTO members VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,active=excluded.active').bind(email,role,Number(active)).run();return c.json({ok:true});
 });
 app.all('/api/*',c=>c.json({error:'Endpoint unavailable.'},404));
 app.get('*',c=>c.env.ASSETS.fetch(c.req.raw));return app;
}
