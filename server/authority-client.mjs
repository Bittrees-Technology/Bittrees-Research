import {researchPermissions,researchReviewer} from '../shared/research-permissions.mjs';
import {ecosystemAccess} from './ecosystem-client.mjs';
import {readResearchCredentials} from './research-native-authority.mjs';
export async function researchAccess(actor,{access=ecosystemAccess,native=readResearchCredentials}={}){
 const wallet=actor.toLowerCase();
 const [shared,evidence]=await Promise.all([access('research',[wallet],{authenticatedWallet:wallet}),native(wallet)]);
 if(!shared.enrolled||!shared.authoritative||!Number.isFinite(shared.expiresAt)||shared.expiresAt<=Date.now()||evidence.status==='unavailable')throw Error('Research authority unavailable');
 const now=Date.now(),permissions=researchPermissions(shared,now,evidence,wallet);
 return {configured:true,permissions,reviewer:researchReviewer(shared,evidence,wallet,now),roles:(shared.actions||[]).filter(a=>a.startsWith('tier.')||a.startsWith('role.')).map(a=>({label:a.slice(5)})),expiresAt:Math.min(shared.expiresAt,evidence.validUntil||now),checkedAt:new Date(now).toISOString()};
}
export async function authorityDecision(actor,action,options){
 const result=await researchAccess(actor,options),allowed=result.permissions.includes(action);
 return {allowed,configured:true,centralized:true,expiresAt:new Date(result.expiresAt).toISOString(),reason:allowed?'Approved by Roles and native Research credentials':'Current Research credential and Roles permission required'};
}
