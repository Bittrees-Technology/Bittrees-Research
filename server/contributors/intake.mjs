import {normalizeInterest} from './interest.mjs';
// Per-application keys are retained only inside the existing encrypted private
// store with an enforced Redis TTL until finalized import. Wallet-derived keys/signatures never enter it.
const ttl=24*60*60*1000;
export function intakeVault(command,codec,project){
 const key=uid=>`bittrees:contributors:v1:${project}:intake-key:${uid}`;
 return {
  async save(uid,wallet,contentKey){await command(['SET',key(uid),codec.seal({wallet,contentKey}),'EX',86400]);},
  async read(uid,wallet){const raw=(await command(['GET',key(uid)])).result;if(!raw)return null;const v=codec.open(raw);return v.wallet===wallet?v.contentKey:null;},
  async remove(uid){await command(['DEL',key(uid)]);}
 };
}
const lane=project=>project==='gov'?'inc-ops-governance':'research';
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export async function stageIntake(state,session,project,input,{read,vault,now=Date.now()}={}){
 const wallet=session.wallet?.toLowerCase();
 if(!wallet||!session.walletVerifiedAt)throw fail('Verify the submitting wallet.',403);
 const verified=await read(project,session,input,undefined,{finality:'latest'});
 if(verified.source.attester.toLowerCase()!==wallet)throw fail('Use the submitting wallet.',403);
 normalizeInterest(verified.application,project,{wallet});
 if(state.applications.some(a=>a.sourceAttestation?.uid===verified.source.uid))return state;
 const pending=state.pendingIntakes||[];
 const existing=pending.find(p=>p.uid===verified.source.uid);
 if(existing){if(existing.identity!==session.identity)throw fail('Application identity needs reconciliation.');return state;}
 if(pending.some(p=>p.wallet===wallet&&p.project===project&&p.status==='waiting_finality'))throw fail('Your previous submission is awaiting finality. Continue that application.');
 if(pending.length>=200)throw fail('The intake queue is full. An administrator must review it.',503);
 await vault.save(verified.source.uid,wallet,input.contentKey);
 state.pendingIntakes=[...pending,{uid:verified.source.uid,wallet,identity:session.identity,project,dataHash:verified.source.dataHash,createdAt:now,expiresAt:now+ttl,status:'waiting_finality',nextCheckAt:now}];
 state.revision++;return state;
}
export function intakeView(state,actor,project){
 return (state.pendingIntakes||[]).filter(p=>p.project===project&&(p.identity===actor.id||actor.review.includes(lane(project)))).map(({uid,wallet,status,createdAt})=>({uid,wallet,status,createdAt}));
}
export async function settleIntakes(state,actor,project,{read,service,vault,now=Date.now()}={}){
 let next=structuredClone(state),checked=0;
 const candidates=[...(next.pendingIntakes||[])].sort((a,b)=>a.nextCheckAt-b.nextCheckAt);
 for(const candidate of candidates){
  const p=next.pendingIntakes.find(i=>i.uid===candidate.uid);if(!p)continue;
  if(p.project!==project)continue;
  if(p.expiresAt<=now){p.status='unlock_needed';continue;}
  if(p.status!=='waiting_finality'||p.nextCheckAt>now||checked>=3||!(p.identity===actor.id||actor.review.includes(lane(project))))continue;
  checked++;p.nextCheckAt=now+60000;
  try{
   const contentKey=await vault.read(p.uid,p.wallet);
   if(!contentKey){p.status='unlock_needed';continue;}
   const verified=await read(project,{identity:p.identity,wallet:p.wallet,walletVerifiedAt:p.createdAt},{uid:p.uid,contentKey});
   if(verified.source.dataHash!==p.dataHash)throw fail('Application data changed.');
   next=service.importBase(next,{id:p.identity,wallet:p.wallet,applicant:true},project,verified);
   next.pendingIntakes=next.pendingIntakes.filter(i=>i.uid!==p.uid);
  }catch{/* No finality, source conflict or unavailable provider: no reviewable record is created. */}
 }
 return next;
}
