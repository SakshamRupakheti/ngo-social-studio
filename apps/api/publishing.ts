import { z } from 'zod';
import type { Channel, Job } from '../../packages/shared/model.ts';
import {rows,type Env} from './types.ts';
export type WorkJob=Job & {channel_id:string;caption:string;token:string;updated:number};
export type Receipt={id:string;status:string};
export interface Provider {channels():Promise<Channel[]>;create(job:WorkJob):Promise<Receipt>;lookup(id:string):Promise<Receipt>}
export class ProviderError extends Error {
 safe:boolean;pause:number;
 constructor(message:string,safe=false,pause=0){super(message);this.safe=safe;this.pause=pause}
}
const receipt=z.object({id:z.string().min(1),status:z.string()});
export function providerState(status:string) {
 return ({sent:'published',scheduled:'scheduled',sending:'scheduled',error:'failed'} as Record<string,string>)[status] || 'unknown';
}
export function bufferProvider(env:Env):Provider|null {
 if(!env.BUFFER_API_KEY||!env.BUFFER_ORG_ID||!env.MEDIA_ORIGIN?.startsWith('https://')) return null;
 const mediaOrigin=new URL(env.MEDIA_ORIGIN).origin;
 async function query(query:string,variables:Record<string,unknown>) {
  const res=await fetch('https://api.buffer.com',{method:'POST',headers:{Authorization:'Bearer '+env.BUFFER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(18000)});
  if(res.status===429){
   const waits=Array.from((res.headers.get('RateLimit')||'').matchAll(/r=0;\s*t=(\d+)/g),m=>Number(m[1]));
   throw new ProviderError('Buffer rate limit reached. Try again after the cooldown.',true,Math.max(Number(res.headers.get('Retry-After'))||900,...waits)*1000);
  }
  if(res.status===401||res.status===403) throw new ProviderError('Buffer denied access. Check the server key and channel permissions.',true);
  if(!res.ok) throw new ProviderError('Buffer response was inconclusive. Inspect the Buffer queue.');
  const result=z.object({data:z.unknown(),errors:z.array(z.unknown()).optional()}).parse(await res.json());
  if(result.errors?.length) throw new ProviderError('Buffer returned a GraphQL error. Verify the outcome in Buffer.');
  return result.data;
 }
 return {
  async channels(){
   const data=z.object({channels:z.array(z.object({id:z.string(),name:z.string(),service:z.string(),type:z.string(),isLocked:z.boolean(),isDisconnected:z.boolean(),isQueuePaused:z.boolean()}))}).parse(await query('query Channels($input: ChannelsInput!) { channels(input:$input) { id name service type isLocked isDisconnected isQueuePaused } }',{input:{organizationId:env.BUFFER_ORG_ID}}));
   const channels:Channel[]=[];
   for(const c of data.channels){
    if(c.isLocked||c.isDisconnected||c.isQueuePaused)continue;
    if(!((c.service==='linkedin'&&['page','organization','company'].includes(c.type))||(c.service==='facebook'&&c.type==='page')||(c.service==='instagram'&&['business','creator'].includes(c.type))))continue;
    if(channels.some(x=>x.platform===c.service))throw new ProviderError('Multiple eligible channels for one platform. Connect one per platform in the selected Buffer organization.');
    channels.push({platform:c.service as Channel['platform'],name:c.name,external_id:c.id});
   }
   return channels;
  },
  async create(job){
   if(job.due && job.due<=Date.now())throw new ProviderError('The scheduled time passed before handoff. Review the schedule in the studio.',false);
   const input={channelId:job.channel_id,text:job.caption,schedulingType:'automatic',mode:job.due?'customScheduled':'shareNow',...(job.due?{dueAt:new Date(job.due).toISOString()}:{}),assets:[{image:{url:mediaOrigin+'/delivery/'+job.token}}],...(job.platform==='instagram'?{metadata:{instagram:{type:'post'}}}:{})};
   const result=z.object({createPost:z.object({__typename:z.string(),post:receipt.optional()})}).parse(await query('mutation Create($input:CreatePostInput!) { createPost(input:$input) { __typename ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }',{input}));
   const payload=result.createPost;
   if(payload.__typename==='PostActionSuccess' && payload.post)return payload.post;
   if(['PostLimitReachedError','LimitReachedError'].includes(payload.__typename))throw new ProviderError('Buffer queue or plan limit reached. Free a queue slot before retrying.',true);
   if(['InvalidInputError','PostInvalidInputError','UnauthorizedError','NotFoundError'].includes(payload.__typename))throw new ProviderError('Buffer rejected this request ('+payload.__typename+'). Check the content and connection.',true);
   throw new ProviderError('Unconfirmed Buffer result ('+payload.__typename+'). Check the channel before taking action.');
  },
  async lookup(id){return z.object({post:receipt}).parse(await query('query Status($input:PostInput!) { post(input:$input) { id status } }',{input:{id}})).post}
 };
}
export async function runJobs(env:Env,provider:Provider|null) {
 if(!provider)return;
 const db=env.DB, now=Date.now();
 await db.prepare("UPDATE jobs SET state='unknown',error='Handoff interrupted. Inspect Buffer before any manual action.',updated=? WHERE state='sending' AND updated<?").bind(now,now-300000).run();
 const pause=await db.prepare('SELECT provider_pause FROM organization').first<number>('provider_pause');
 if(pause && pause>now)return;
 const jobs=await rows<WorkJob>(db,"SELECT * FROM jobs WHERE (state='queued' OR (external_id IS NOT NULL AND state IN ('scheduled','unknown'))) AND next_check<=? ORDER BY next_check LIMIT 6",now);
 for(const job of jobs){
  const checking=!!job.external_id;
  const claimed=await db.prepare("UPDATE jobs SET state=?,updated=?,next_check=? WHERE id=? AND state=? AND next_check<=?").bind(checking?job.state:'sending',now,now+300000,job.id,job.state,now).run();
  if(!claimed.meta.changes)continue;
  try {
   const result=checking?await provider.lookup(job.external_id as string):await provider.create(job);
   const state=providerState(result.status);
   await db.prepare('UPDATE jobs SET state=?,external_id=?,error=?,safe_retry=0,updated=?,next_check=? WHERE id=?').bind(state,result.id,state==='failed'?'Buffer reports a delivery error. Inspect this post in Buffer.':state==='unknown'?'Unexpected provider status: '+result.status:'',Date.now(),Math.max(now+1800000,job.due||0),job.id).run();
  }catch(error){
   const fault=error instanceof ProviderError?error:new ProviderError('No conclusive response. Inspect the Buffer queue.');
   const safe=!checking && fault.safe;
   await db.prepare('UPDATE jobs SET state=?,error=?,safe_retry=?,next_check=?,updated=? WHERE id=?').bind(safe?'failed':'unknown',fault.message,Number(safe),now+Math.max(fault.pause,1800000),Date.now(),job.id).run();
   if(fault.pause){await db.prepare('UPDATE organization SET provider_pause=MAX(provider_pause,?)').bind(now+fault.pause).run();break}
  }
 }
}
