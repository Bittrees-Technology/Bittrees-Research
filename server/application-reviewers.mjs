import {readResearchCredentials} from './research-native-authority.mjs';
import {nativeRoles} from '../shared/research-permissions.mjs';
import {ecosystemAccess} from './ecosystem-client.mjs';
export async function applicationReviewers(enckeys,{access=ecosystemAccess,native=readResearchCredentials}={}){
 const candidates=Object.entries(enckeys||{}).filter(([w,key])=>/^0x[a-f0-9]{40}$/.test(w)&&/^[a-f0-9]{64}$/.test(key)).map(([w])=>w);
 if(candidates.length>200)throw Error('Reviewer public key capacity exceeded');
 const decision=await access('research',['0x'+'0'.repeat(40)],{reviewerCandidates:candidates});
 if(!decision.enrolled||!decision.authoritative||decision.expiresAt<=Date.now())return {mode:'roles',ready:false,reviewers:[]};
 const reviewers=[];let expiresAt=decision.expiresAt;
 const eligible=(decision.reviewers||[]).filter(w=>candidates.includes(w));
 for(let offset=0;offset<eligible.length;offset+=4)await Promise.all(eligible.slice(offset,offset+4).map(async w=>{
  const evidence=await native(w);
  if(evidence.status==='unavailable')throw Error('Reviewer credential verification unavailable');
  if(nativeRoles(evidence,w).includes('executive')){reviewers.push(w);expiresAt=Math.min(expiresAt,evidence.validUntil);}
 }));
 return {mode:'roles',ready:expiresAt>Date.now(),reviewers:reviewers.sort(),expiresAt};
}
