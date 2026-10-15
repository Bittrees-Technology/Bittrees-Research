import {chainContext,refreshCredential} from './chain.mjs';
import {sign,verify} from 'node:crypto';
import {redisCommand} from '../signed-registry.mjs';
import {privateCodec,contributorStore} from './storage.mjs';
import {PROFILE_SITES,profileRequestMessage,profileResponseMessage,validProfileRequest} from '../../shared/contributor-profile.mjs';
// Read-only projection. Typed/unverified application wallets are never identity proofs.
export function projectContributors(state,identities,project){
 const owned=new Set(identities);
 return state.applications.filter(a=>owned.has(a.email.toLowerCase())||(a.walletVerification==='verified'&&owned.has(a.wallet))).map(a=>{
  const memo=a.memos.find(m=>m.version===a.credential?.memoVersion)||a.memos.at(-1);
  return {id:a.id,project,applicationStatus:a.state,level:memo?.level||null,rank:memo?.rank||null,term:memo?{start:memo.start,end:memo.end}:null,memoStatus:memo?.status||null,credential:a.credential?{tokenId:String(a.credential.tokenId),standing:a.credential.standing,chainId:a.credential.chainId||null,contract:a.credential.contract||null,transactionHash:a.credential.transactionHash||null}:null,url:PROFILE_SITES[project]+'/admin/contributors'};
 });
}
export function createProfileHandler(project,{env=process.env,command=redisCommand,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  try{
   if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
   if(env.CONTRIBUTORS_ENABLED!=='1'||!env.ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY||!env.ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY)return res.status(503).json({error:'Contributor profile unavailable'});
   const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>12000)return res.status(413).json({error:'Request too large'});
   const {request,signature}=JSON.parse(raw);
   if(!validProfileRequest(request,project,now())||typeof signature!=='string'||!verify(null,Buffer.from(profileRequestMessage(request)),env.ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY,Buffer.from(signature,'base64')))return res.status(401).json({error:'Roles identity proof rejected'});
   const consumed=await command(['SET',`bittrees:contributors:v1:${project}:profile-request:${request.requestId}`,'1','NX','EX',60]);if(consumed.result!=='OK')return res.status(409).json({error:'Profile request already used'});
   const state=await contributorStore(command,privateCodec(env.CONTRIBUTOR_STORAGE_SECRET),project).read();
   const owned=state.applications.filter(a=>request.identities.includes(a.email.toLowerCase())||(a.walletVerification==='verified'&&request.identities.includes(a.wallet)));
   if(owned.some(a=>a.credential)){const ctx=await chainContext(env);await Promise.all(owned.filter(a=>a.credential).map(a=>refreshCredential(a,ctx)));}
   const response={version:1,requestId:request.requestId,project,checkedAt:now(),records:projectContributors(state,request.identities,project)};
   return res.status(200).json({response,signature:sign(null,Buffer.from(profileResponseMessage(response)),env.ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY).toString('base64')});
  }catch{return res.status(503).json({error:'Contributor profile unavailable'});}
 };
}
