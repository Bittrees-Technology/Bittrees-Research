import {ecosystemAccess} from './ecosystem-client.mjs';
export async function applicationReviewers(enckeys,{access=ecosystemAccess}={}){
 const candidates=Object.entries(enckeys||{}).filter(([w,key])=>/^0x[a-f0-9]{40}$/.test(w)&&/^[a-f0-9]{64}$/.test(key)).map(([w])=>w);
 if(candidates.length>200)throw Error('Reviewer public key capacity exceeded');
 const decision=await access('research',['0x'+'0'.repeat(40)],{reviewerCandidates:candidates});
 return decision.enrolled?{mode:'roles',ready:decision.authoritative,reviewers:decision.reviewers||[],expiresAt:decision.expiresAt}:{mode:'legacy',ready:true};
}
