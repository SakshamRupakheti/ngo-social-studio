import {Layers,Instagram,Globe,FileText} from 'lucide-react';
import {names,labels,type Platform} from '../../packages/shared/model.ts';
export function Brand(){return <span className="brand"><img src="/folio.svg" alt=""/>Folio<span className="brand-divider"/> <span className="brand-sub">Social Studio</span></span>}
export function Badge({state}:{state:string}){return <span className={'badge '+state}>{labels[state]||state}</span>}
export function Network({p}:{p:Platform}){return <span className={'network '+p} aria-label={names[p]}>{p==='instagram'?<Instagram size={15}/>:p==='linkedin'?'in':'f'}</span>}
export function Empty({title,children}:{title:string;children?:React.ReactNode}){return <div className="empty"><FileText size={25} strokeWidth={1.3}/><strong>{title}</strong>{children&&<p>{children}</p>}</div>}
export function OrgMark(){return <span className="orgmark"><Layers size={19}/></span>}
export function Avatar(){return <span className="avatar"><Globe size={19}/></span>}
