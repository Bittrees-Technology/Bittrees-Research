import {verifyFeedRequest,makeFeedResponse} from '../../shared/workflow-feed.mjs';
import {redisCommand} from '../signed-registry.mjs';
import {privateCodec,contributorStore} from './storage.mjs';
import {workflowPlan} from './workflow-plan.mjs';
export function contributorWorkflows(state,subjects,project){
 return state.applications.filter(a=>a.walletVerification==='verified'&&subjects.includes(a.wallet)).flatMap(a=>{
  const plan=workflowPlan(a);if(!plan)return [];
  return plan.suggestions.map(s=>({sourceId:`${a.id}.${s.id}`,definition:{name:s.name,description:`${a.name}: ${plan.title||plan.rank}. ${plan.status==='approved'?'Partner-approved planning suggestion':plan.status==='rejected'?'Rejected suggestion; not assigned':'Awaiting Partner approval; not assigned'}. ${s.description}`.slice(0,1200),site:project,kind:'human',roles:['Contributor','Partner'],control:'source',steps:[{title:'Review agreed work',role:'Contributor',description:s.description||'Review the signed contribution responsibilities.',mode:'human'},{title:'Partner review',role:'Partner',description:'Confirm scope, ownership and required access in the contributor workspace. Approval here does not grant execution permissions.',mode:'human'}]},status:'paused',revision:a.version,updatedAt:plan.reviewedAt||null,visibility:'owner',owners:[a.wallet]}));
 });
}
export function createWorkflowHandler(project,{env=process.env,command=redisCommand,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(env.CONTRIBUTORS_ENABLED!=='1'||!env.WORKFLOW_SOURCE_REQUEST_PUBLIC_KEY||!env.ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY)return res.status(503).json({error:'Contributor workflows unavailable'});
  try{
   const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});if(Buffer.byteLength(raw)>40000)return res.status(413).json({error:'Request too large'});
   let request;try{request=verifyFeedRequest(JSON.parse(raw),project,env.WORKFLOW_SOURCE_REQUEST_PUBLIC_KEY,now());}catch{return res.status(401).json({error:'Workflow identity proof rejected'});}
   const used=await command(['SET',`bittrees:contributors:v1:${project}:workflow-request:${request.requestId}`,'1','NX','EX',90]);if(used.result!=='OK')return res.status(409).json({error:'Request already used'});
   const state=await contributorStore(command,privateCodec(env.CONTRIBUTOR_STORAGE_SECRET),project).read();
   const records=contributorWorkflows(state,request.subjects,project);if(records.length>1000)return res.status(503).json({error:'Catalogue capacity requires review'});
   return res.status(200).json(makeFeedResponse(request,records,env.ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY,now()));
  }catch{return res.status(503).json({error:'Contributor workflows unavailable'});}
 };
}
