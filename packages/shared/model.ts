export const platforms = ['linkedin','instagram','facebook'] as const;
export type Platform = (typeof platforms)[number];
export const names = {linkedin:'LinkedIn',instagram:'Instagram',facebook:'Facebook'};
export type Role = 'administrator'|'designer';
export type User = {email:string;role:Role};
export type Variants = Partial<Record<Platform,string>>;
export type Media = {id:string;name:string;mime:string;width:number;height:number;bytes:number;created:number;owner:string};
export type Job = {id:string;post_id:string;platform:Platform;state:string;external_id:string|null;error:string;safe_retry:number;due:number|null};
export type Channel = {platform:Platform;name:string;external_id:string};
export type Post = {id:string;owner:string;revision:number;caption:string;media_id:string|null;variants:Variants;state:string;updated:number;created:number;due:number|null;note:string;jobs:Job[]};
export type EventRow = {actor:string;action:string;note:string;at:number;revision:number};
export type Workspace = {user:User;org:{name:string;timezone:string};posts:Post[];media:Media[];channels:Channel[];configured:boolean;local:boolean;members:User[]};
export const labels:Record<string,string> = {draft:'Draft',submitted:'Awaiting approval',changes_requested:'Changes requested',approved:'Approved',dispatch:'In delivery',queued:'Queued',sending:'Sending',scheduled:'Scheduled',published:'Published',unknown:'Unknown',failed:'Failed',partial:'Partial failure',rejected:'Rejected',cancelled:'Cancelled'};
export function status(p:Pick<Post,'state'|'jobs'>) {
 if(p.state!=='dispatch') return p.state;
 const states=p.jobs.map(j=>j.state);
 if(states.includes('unknown')) return 'unknown';
 if(states.includes('failed')) return states.every(s=>s==='failed')?'failed':'partial';
 if(states.length && states.every(s=>s==='published')) return 'published';
 if(states.includes('sending')) return 'sending';
 return states.includes('scheduled')?'scheduled':'queued';
}
export function validateSubmission(caption:string,variants:Variants,media:Media|null) {
 if(!media) return 'Add a graphic before submitting.';
 if(!Object.keys(variants).length) return 'Choose at least one platform.';
 for(const platform of platforms) {
  if(!(platform in variants)) continue;
  const text=variants[platform]?.trim() || caption.trim();
  if(!text) return 'Write a caption for '+names[platform]+'.';
  const length=platform==='linkedin'?text.replace(/https?:\/\/\S+/g,'x'.repeat(24)).length:platform==='instagram'?text.replace(/\r?\n/g,'  ').length:text.length;
  if(length>{linkedin:3000,instagram:2196,facebook:5000}[platform]) return names[platform]+' caption exceeds its character limit.';
  if(platform==='instagram' && (media.width/media.height<0.8 || media.width/media.height>1.91)) return 'Use an Instagram image between 4:5 and 1.91:1.';
 }
 return '';
}
