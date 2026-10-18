import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export const emptyState=()=>({revision:0,requests:[]});
const text=(v,name,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||required&&!v.trim())throw fail(`Check ${name}.`);return v.trim();};
export function transition(state,actor,input,now=Date.now()){
 if(!actor.member)throw fail('An active Research membership is required.',403);
 const next=structuredClone(state),wallet=actor.wallet.toLowerCase();
 if(!/^[a-f0-9-]{36}$/.test(input.commandId||''))throw fail('Refresh before saving.');
 const previous=next.requests.flatMap(r=>r.history).find(e=>e.commandId===input.commandId);
 if(previous)throw fail('This action was already saved. Refresh the board.',409);
 let request;
 if(input.action==='create'){
  if(next.requests.length>=1000)throw fail('The request board is at capacity. Contact Research administration.',503);
  if(next.requests.filter(r=>r.requester===wallet&&!['completed','cancelled'].includes(r.status)).length>=10)throw fail('Finish or cancel an existing request before opening another.',409);
  const title=text(input.title,'the question',120),brief=text(input.brief,'the brief',5000),deliverable=text(input.deliverable,'the expected deliverable',2000);
  const targetDate=input.targetDate||null;if(targetDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||!Number.isFinite(Date.parse(targetDate+'T00:00:00Z'))||new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)!==targetDate))throw fail('Check the target date.');
  request={id:randomUUID(),version:0,title,brief,deliverable,targetDate,requester:wallet,assignee:null,status:'open',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),submission:null,history:[]};next.requests.unshift(request);
 }else{
  request=next.requests.find(r=>r.id===input.id);if(!request)throw fail('Request not found.',404);
  if(input.expectedVersion!==request.version)throw fail('This request changed. Refresh before trying again.',409);
  if(request.history.length>=100&&!['cancel','complete','release'].includes(input.action))throw fail('This request has reached its activity limit. Contact Research administration.',409);
  const owner=request.requester===wallet,assigned=request.assignee===wallet;
  if(input.action==='accept'){
   if(!actor.researcher)throw fail('An active Researcher credential is required to accept work.',403);
   if(owner)throw fail('Another researcher must accept your request.',403);
   if(request.status!=='open'||request.assignee)throw fail('This request is no longer open.',409);
   request.assignee=wallet;request.status='in_progress';
  }else if(input.action==='submit'){
   if(!assigned||!actor.researcher)throw fail('The assigned researcher needs an active Researcher credential.',403);
   if(request.status!=='in_progress')throw fail('This request is not in progress.',409);
   const summary=text(input.summary,'the findings',5000),url=text(input.url??'','the deliverable link',2000,false);
   if(url){let parsed;try{parsed=new URL(url);}catch{throw fail('Use a complete HTTPS or HTTP link.');}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw fail('Use a public HTTPS or HTTP link without credentials.');}
   request.submission={summary,url,submittedAt:new Date(now).toISOString(),by:wallet};request.status='submitted';
  }else if(input.action==='complete'){
   if(!owner)throw fail('Only the requester can complete this request.',403);
   if(request.status!=='submitted')throw fail('Review the submitted findings before completing.',409);
   request.status='completed';
  }else if(input.action==='revise'){
   if(!owner)throw fail('Only the requester can request revisions.',403);
   if(request.status!=='submitted')throw fail('No submission is awaiting review.',409);
   text(input.note,'the requested revisions',2000);request.status='in_progress';
  }else if(input.action==='release'){
   if(!assigned)throw fail('Only the assigned researcher can release this work.',403);
   if(request.status!=='in_progress')throw fail('Only work in progress can be released.',409);
   text(input.note,'the release reason',2000);request.assignee=null;request.status='open';
  }else if(input.action==='cancel'){
   if(!owner)throw fail('Only the requester can cancel this request.',403);
   if(['completed','cancelled'].includes(request.status))throw fail('This request is already closed.',409);
   text(input.note,'the cancellation reason',2000);request.status='cancelled';
  }else throw fail('Unknown research action.');
 }
 request.version++;request.updatedAt=new Date(now).toISOString();
 request.history.push({commandId:input.commandId,action:input.action,by:wallet,at:request.updatedAt,note:input.note?text(input.note,'the note',2000):'',...(input.action==='submit'?{submission:request.submission}:{})});next.revision++;return next;
}
