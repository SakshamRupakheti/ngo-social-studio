import {createRemoteJWKSet,jwtVerify} from 'jose';
import type {Identity} from './types.ts';
const issuers=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export const identity:Identity=async(request,env)=>{
 const issuer=env.ACCESS_TEAM_DOMAIN?.replace(/\/$/,'');
 const token=request.headers.get('cf-access-jwt-assertion');
 if(!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) || !env.ACCESS_AUD || !token) return null;
 const keys=issuers.get(issuer)??createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));
 issuers.set(issuer,keys);
 try {const {payload}=await jwtVerify(token,keys,{issuer,audience:env.ACCESS_AUD,algorithms:['RS256'],requiredClaims:['exp','email','sub']});return typeof payload.email==='string'?payload.email.toLowerCase():null} catch{return null}
};
