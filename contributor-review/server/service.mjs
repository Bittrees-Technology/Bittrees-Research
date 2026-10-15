import {createHash, randomUUID} from 'node:crypto';
import {SITES,normalizeInterest,emptyDirectory} from './interest.mjs';
export const TODAY='2026-10-15'; // Explicit fixture date; never production time.
export const LEVELS=['Advisor','Part Time','Half Time','Full Time'];
const BOTH=['inc-ops-governance','research'];
export const PERSONAS={
 operations:{id:'fixture:operations',name:'Partner · both projects',review:BOTH,decide:BOTH,issue:true,validate:true,changeStatus:BOTH,proposeStatus:[]},
 junior:{id:'fixture:junior',name:'Junior Partner · proposer',review:BOTH,decide:[],issue:false,validate:false,changeStatus:[],proposeStatus:BOTH},
 associate:{id:'fixture:associate',name:'Associate · proposer',review:BOTH,decide:[],issue:false,validate:false,changeStatus:[],proposeStatus:BOTH},
 reviewer:{id:'fixture:reviewer',name:'Operations · review only',review:BOTH,decide:[],issue:false,validate:false,changeStatus:[],proposeStatus:[]},
 govPartner:{id:'fixture:gov-partner',name:'Partner · Governance only',review:['inc-ops-governance'],decide:['inc-ops-governance'],issue:true,validate:true,changeStatus:['inc-ops-governance'],proposeStatus:[]},
 alex:{id:'fixture:alex',name:'Alex · applicant',application:'app-alex',applicant:true,wallet:'0x1111111111111111111111111111111111111111',review:[],decide:[],issue:false,validate:false},
 rhea:{id:'fixture:rhea',name:'Rhea · Research applicant',application:'app-rhea',applicant:true,wallet:'0x4444444444444444444444444444444444444444',review:[],decide:[],issue:false,validate:false},
 visitor:{id:'fixture:visitor',name:'New interest form applicant',applicant:true,wallet:'0x5555555555555555555555555555555555555555',review:[],decide:[],issue:false,validate:false},
 outsider:{id:'fixture:outsider',name:'Unassigned account',review:[],decide:[],issue:false,validate:false},
};
const owns=(actor,app)=>actor.applicant&&app.identity===actor.id;
const canChange=(actor,app)=>actor.changeStatus?.includes(app.lane);
const canPropose=(actor,app)=>actor.proposeStatus?.includes(app.lane);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const day=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('Enter a valid date.');return value;};
const text=(x,label)=>{if(typeof x!=='string'||!x.trim()||x.length>2000)fail(`${label} is required (maximum 2,000 characters).`);return x.trim();};
function fields(input,allowed){for(const key of Object.keys(input))if(!allowed.includes(key))fail(`Unexpected field: ${key}`);}
export function seed(){
 const app=(id,name,specialty,wallet)=>({id,name,specialty,wallet,identity:`fixture:${id.slice(4)}`,lane:'inc-ops-governance',roleId:'contributor',project:'Bittrees Governance',state:'submitted',version:1,createdAt:TODAY,capabilityGrant:null,provisioning:'not_requested',reviews:[],memos:[],credential:null,validations:[],proposals:[],directory:emptyDirectory('SAMPLE-'+id),expertise:['Community'],requestedRoles:[],region:['EMEA'],languages:['English'],email:id.slice(4)+'@example.invalid',twitter:'',telegram:'',expertField:'',heardFrom:'Bittrees website',referrer:'',walletVerification:'fixture-connected',source:'sample-record',schemaVersion:2});
 const alex=app('app-alex','Alex Morgan','Community onboarding, documentation, and contributor support.','0x1111111111111111111111111111111111111111');
 const maya=app('app-maya','Maya Chen','Research tooling and reproducible data analysis.','0x2222222222222222222222222222222222222222');
 maya.state='approved';maya.memos=[{version:1,level:'Half Time',rank:'Contributor',scope:maya.specialty,start:'2026-09-01',end:'2027-08-31',policyVersion:'review-policy-v1',wallet:maya.wallet,issuer:'fixture:operations',status:'issued',acknowledgedBy:maya.identity,acknowledgedAt:'2026-09-01',hash:hash({fixture:'maya-memo-1'}),createdAt:'2026-09-01'}];
 maya.credential={tokenId:'1',standing:'active',memoVersion:1,level:'Half Time',rank:'Contributor',owner:maya.wallet,locked:true,issuedAt:'2026-09-01',validationDue:'2026-10',history:[],revision:1};
 const noor=app('app-noor','Noor Williams','Technical writing and developer workshops.','0x3333333333333333333333333333333333333333');noor.state='needs_info';noor.reviews=[{action:'request_info',reason:'Please share an example of your technical writing.',actor:'fixture:operations',at:TODAY}];
 maya.directory={...maya.directory,contributorId:'SAMPLE-BC-002',sector:'Technology',groups:['Documentation'],title:'Contributor',specialty1:'Data analysis',specialty2:'Documentation',startDate:'2026-09-01'};
 const rhea=app('app-rhea','Rhea Patel','Research methods, reproducible experiments and peer review.','0x4444444444444444444444444444444444444444');rhea.lane='research';rhea.project=SITES.research.name;rhea.requestedRoles=['Researcher','Contributor'];rhea.expertise=['Research','Technology'];
 const kai=structuredClone(maya);kai.id='app-kai';kai.name='Kai Rivera';kai.identity='fixture:kai';kai.wallet='0x6666666666666666666666666666666666666666';kai.email='kai@example.invalid';kai.lane='research';kai.project=SITES.research.name;kai.expertise=['Research'];kai.requestedRoles=['Researcher'];kai.credential={...kai.credential,tokenId:'2',owner:kai.wallet};kai.memos[0]={...kai.memos[0],wallet:kai.wallet,acknowledgedBy:kai.identity,hash:hash({fixture:'kai-memo-1'})};kai.directory={...kai.directory,contributorId:'SAMPLE-BR-001',sector:'Research',groups:['Methods'],specialty1:'Experimental methods'};
 return {schemaVersion:2,revision:1,mode:'local-fixture',applications:[alex,maya,noor,rhea,kai],audit:[],nextTokenId:3};
}
function log(state,actor,app,action,detail){
 const entry={id:randomUUID(),sequence:state.audit.length+1,at:new Date().toISOString(),actor:actor.id,applicationId:app.id,action,detail,policy:'review-policy-v1',previousHash:state.audit.at(-1)?.hash||null};entry.hash=hash(entry);state.audit.push(entry);
}
export function view(state,actor,site='gov'){
 if(!actor)fail('Choose a review persona.',401);
 if(!SITES[site])fail('Unknown project.');
 if(!actor.review.includes(SITES[site].lane)&&!actor.applicant)fail('This account has no application or review access.',403);
 const applications=state.applications.filter(a=>a.lane===SITES[site].lane&&(actor.review.includes(a.lane)||owns(actor,a))).map(a=>{const copy=structuredClone(a);if(!actor.review.includes(a.lane)){delete copy.directory;delete copy.proposals;}return copy;});
 return {mode:state.mode,site,siteName:SITES[site].name,today:TODAY,revision:state.revision,persona:{id:actor.id,name:actor.name,isApplicant:!!actor.applicant,canReview:actor.review.includes(SITES[site].lane),canDecide:actor.decide.includes(SITES[site].lane),canIssue:actor.issue&&actor.decide.includes(SITES[site].lane),canValidate:actor.validate&&actor.decide.includes(SITES[site].lane),canChangeStatus:actor.changeStatus?.includes(SITES[site].lane)||false,canProposeStatus:actor.proposeStatus?.includes(SITES[site].lane)||false},applications,audit:state.audit.filter(e=>applications.some(a=>a.id===e.applicationId)&&(actor.review.includes(SITES[site].lane)||!['update_directory','propose_change','review_proposal'].includes(e.action))),policy:{version:'review-policy-v1',allocationConfigured:false,issuer:'Sample Operations policy',authority:'Fixture only · no live Roles grant',levelMultipliers:{'Full Time':'1','Half Time':'1/2','Part Time':'1/6',Advisor:'1/10 (proposed)'},rate:'1.25% historical calendar reference; not activated',blockers:['Confirm authority delegates and signing policy','Approve allocation formula, snapshot and rounding rules','Connect verified wallet sessions and private document storage','Review contract security before deployment']}};
}
export function transition(original,actor,id,input){
 if(!actor)fail('A verified session is required.',401);
 const state=structuredClone(original),app=state.applications.find(a=>a.id===id);
 if(!app||(!actor.review.includes(app.lane)&&!owns(actor,app)))fail('Application access denied.',403);
 if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==app.version)fail('This record changed. Reload it before trying again.',409);
 const action=input.action;
 if(['start_review','request_info','resume_review','approve','reject'].includes(action)){
  fields(input,['action','expectedVersion','reason']);
  if(!actor.review.includes(app.lane))fail('Reviewer permission is required.',403);
  if(['approved','rejected'].includes(app.state))fail('This application has a final decision. Use a new application or amend its memorandum.',409);
  const reason=text(input.reason,'Decision note');
  if(action==='start_review'){if(app.state!=='submitted')fail('Only new applications can start review.',409);app.state='in_review';}
  if(action==='request_info'){if(!['submitted','in_review','pending_authority'].includes(app.state))fail('This application is already waiting for information.',409);app.state='needs_info';}
  if(action==='resume_review'){if(!['needs_info','pending_authority'].includes(app.state))fail('There is no review to resume.',409);app.state='in_review';}
  if(['approve','reject'].includes(action)){
   if(!['in_review','pending_authority'].includes(app.state))fail('Start or resume the review before deciding.',409);
   app.state=actor.decide.includes(app.lane)?(action==='approve'?'approved':'rejected'):'pending_authority';
  }
  app.reviews.push({action,reason,state:app.state,actor:actor.id,at:TODAY});log(state,actor,app,action,{reason,state:app.state});
 }else if(action==='draft_memo'){
  fields(input,['action','expectedVersion','level','rank','scope','start','end']);
  if(!actor.issue||!actor.decide.includes(app.lane))fail('Memorandum issuer authority is required.',403);
  if(app.state!=='approved')fail('Accept the application before preparing a memo.',409);
  if(app.walletVerification!=='fixture-connected')fail('Verify the preferred payout wallet before preparing a memorandum.',409);
  if(app.credential&&app.credential.standing!=='active')fail('Only an active credential can be amended in this review.',409);
  if(!LEVELS.includes(input.level))fail('Select a recognized contribution level.');
  if(!['Contributor','Senior contributor','Lead contributor'].includes(input.rank))fail('Select a recognized rank.');
  const start=day(input.start),end=day(input.end);
  if(end<start||start<TODAY)fail('Use today or a future effective date and an end date after it.');
  // Accepted terms are immutable. An unissued draft is superseded, not overwritten.
  for(const memo of app.memos)if(memo.status==='draft')memo.status='superseded';
  const memo={version:app.memos.length+1,level:input.level,rank:input.rank,scope:text(input.scope,'Responsibilities'),start,end,policyVersion:'review-policy-v1',wallet:app.wallet,issuer:actor.id,status:'draft',createdAt:TODAY};
  memo.hash=hash({applicationId:app.id,...memo});app.memos.push(memo);log(state,actor,app,action,{memoVersion:memo.version,hash:memo.hash});
 }else if(action==='acknowledge'){
  fields(input,['action','expectedVersion','memoVersion','memoHash']);
  if(!owns(actor,app))fail('Only the applicant may acknowledge their own memorandum.',403);
  const memo=app.memos.at(-1);
  if(!memo||memo.status!=='draft'||memo.version!==input.memoVersion||memo.hash!==input.memoHash)fail('Review the current memorandum version before acknowledging.',409);
  if(memo.acknowledgedAt)fail('This version is already acknowledged.',409);
  memo.acknowledgedBy=actor.id;memo.acknowledgedAt=TODAY;log(state,actor,app,action,{memoVersion:memo.version,hash:memo.hash,proof:'simulated acknowledgment; not a wallet signature'});
 }else if(action==='issue'){
  fields(input,['action','expectedVersion']);
  if(!actor.issue||!actor.decide.includes(app.lane))fail('Credential issuer authority is required.',403);
  const memo=app.memos.at(-1);
  if(app.state!=='approved'||!memo||memo.status!=='draft'||!memo.acknowledgedAt)fail('An accepted application and acknowledged draft are required.',409);
  if(memo.start>TODAY||memo.end<TODAY)fail('Issue during the memorandum effective period.',409);
  if(app.credential&&app.credential.standing!=='active')fail('This credential cannot be amended.',409);
  for(const old of app.memos)if(old.status==='issued')old.status='superseded';memo.status='issued';
  const prior=app.credential;
  app.credential={revision:(prior?.revision||0)+1,tokenId:prior?.tokenId||String(state.nextTokenId++),standing:'active',memoVersion:memo.version,level:memo.level,rank:memo.rank,owner:app.wallet,locked:true,issuedAt:prior?.issuedAt||TODAY,validationDue:TODAY.slice(0,7),history:[...(prior?.history||[]),{action:'issued',memoVersion:memo.version,at:TODAY}]};
  if(!app.directory.startDate)app.directory.startDate=memo.start;
  log(state,actor,app,action,{tokenId:app.credential.tokenId,memoVersion:memo.version,execution:'simulated only'});
 }else if(action==='standing'){
  fields(input,['action','expectedVersion','standing','reason']);
  if(!canChange(actor,app))fail('Partner status authority is required.',403);
  const c=app.credential;if(!c)fail('No credential has been issued.',409);
  if(['ended','revoked'].includes(c.standing))fail('Ended or revoked credentials cannot be reactivated.',409);
  if(!['active','suspended','ended','revoked'].includes(input.standing)||input.standing===c.standing)fail('Choose a different standing.');
  const reason=text(input.reason,'Status reason');c.standing=input.standing;c.revision=(c.revision||1)+1;c.history.push({action:'standing',standing:c.standing,reason,at:TODAY});log(state,actor,app,action,{standing:c.standing,reason});
 }else if(action==='validate_month'){
  fields(input,['action','expectedVersion','month','from','through','evidence']);
  if(!actor.validate||!actor.decide.includes(app.lane))fail('Monthly validation authority is required.',403);
  const c=app.credential;if(!c||c.standing!=='active')fail('An active credential is required for a new validation.',409);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month||''))fail('Select a valid month.');
  const from=day(input.from),through=day(input.through),memo=app.memos.find(m=>m.version===c.memoVersion);
  if(!from.startsWith(input.month)||!through.startsWith(input.month)||through<from||from<memo.start||through>memo.end||through>TODAY)fail('Dates must be in this month, within the memo term, and no later than the review date.');
  if(app.validations.some(v=>v.month===input.month))fail('This month already has a validation. Adjustments require a separate reviewed record.',409);
  const validation={id:randomUUID(),month:input.month,from,through,eligibleDays:Math.round((Date.parse(through)-Date.parse(from))/86400000)+1,level:c.level,memoVersion:c.memoVersion,evidence:text(input.evidence,'Validation evidence'),validatedBy:actor.id,validatedAt:TODAY,status:'validated',allocationStatus:'blocked_policy',amount:null};
  app.validations.push(validation);log(state,actor,app,action,validation);
 }else if(action==='propose_change'){
  fields(input,['action','expectedVersion','kind','standing','level','rank','reason']);
  if(!canPropose(actor,app))fail('Junior Partner or Associate proposal permission is required.',403);
  const c=app.credential;if(!c||['ended','revoked'].includes(c.standing))fail('Only an active or suspended credential may receive a proposal.',409);
  if(!['standing','terms'].includes(input.kind))fail('Unknown proposal type.');
  if(input.kind==='standing'&&(!['active','suspended','ended','revoked'].includes(input.standing)||input.standing===c.standing))fail('Choose a different standing.');
  if(input.kind==='terms'&&(!LEVELS.includes(input.level)||!['Contributor','Senior contributor','Lead contributor'].includes(input.rank)||c.standing!=='active'))fail('Choose valid memo terms for an active credential.');
  const proposal={id:randomUUID(),kind:input.kind,change:input.kind==='standing'?{standing:input.standing}:{level:input.level,rank:input.rank},reason:text(input.reason,'Proposal reason'),proposedBy:actor.id,proposedAt:TODAY,baseCredentialRevision:c.revision||1,state:'pending'};
  if(app.proposals.some(p=>p.state==='pending'&&p.kind===proposal.kind&&hash(p.change)===hash(proposal.change)))fail('An equivalent proposal is already pending.',409);
  app.proposals.push(proposal);log(state,actor,app,action,proposal);
 }else if(action==='review_proposal'){
  fields(input,['action','expectedVersion','proposalId','decision','reason']);
  if(!canChange(actor,app))fail('Partner approval is required.',403);
  const p=app.proposals.find(p=>p.id===input.proposalId);if(!p||p.state!=='pending')fail('This proposal is not pending.',409);
  if(p.proposedBy===actor.id)fail('A proposer cannot approve their own proposal.',403);
  if(!['approve','reject'].includes(input.decision))fail('Choose approve or reject.');
  const reason=text(input.reason,'Partner decision reason');const c=app.credential;
  if(input.decision==='approve'){
   if(!c||(c.revision||1)!==p.baseCredentialRevision||['ended','revoked'].includes(c.standing))fail('The credential changed after this proposal. Reject it and request a fresh proposal.',409);
   if(p.kind==='standing'){
    c.standing=p.change.standing;c.revision=(c.revision||1)+1;c.history.push({action:'approved_proposal',proposalId:p.id,standing:c.standing,reason,at:TODAY});
   }else{
    if(c.standing!=='active')fail('Only active credentials can receive revised terms.',409);
    const old=app.memos.find(m=>m.version===c.memoVersion);
    if(old.end<TODAY)fail('Renew the expired term before changing its level.',409);
    for(const m of app.memos)if(m.status==='draft')m.status='superseded';
    const memo={version:app.memos.length+1,level:p.change.level,rank:p.change.rank,scope:old.scope,start:TODAY,end:old.end,policyVersion:'review-policy-v1',wallet:app.wallet,issuer:actor.id,status:'draft',createdAt:TODAY};memo.hash=hash({applicationId:app.id,...memo});app.memos.push(memo);p.memoVersion=memo.version;
   }
  }
  p.state=input.decision==='approve'?'approved':'rejected';p.reviewedBy=actor.id;p.reviewedAt=TODAY;p.decisionReason=reason;
  log(state,actor,app,action,{proposalId:p.id,state:p.state,reason,memoVersion:p.memoVersion||null});
 }else if(action==='update_directory'){
  fields(input,['action','expectedVersion','ens','sector','groupLeader','groups','title','specialty1','specialty2','otherPositions','notes','followUp']);
  if(!actor.decide.includes(app.lane))fail('Partner directory-edit permission is required.',403);
  if(app.state!=='approved')fail('The directory is for accepted contributors.',409);
  for(const k of ['ens','sector','title','specialty1','specialty2','otherPositions','notes','followUp']){if(typeof input[k]!=='string'||input[k].length>2000)fail('Invalid directory field.');app.directory[k]=input[k].trim();}
  if(typeof input.groupLeader!=='boolean'||!Array.isArray(input.groups)||input.groups.length>20||input.groups.some(g=>typeof g!=='string'||g.length>100))fail('Invalid group assignments.');
  app.directory.groupLeader=input.groupLeader;app.directory.groups=input.groups.map(g=>g.trim()).filter(Boolean);log(state,actor,app,action,{fields:['ens','sector','groups','groupLeader','title','specialties','notes','followUp']});
 }else fail('Unsupported action.');
 app.version++;state.revision++;return state;
}

export function submitInterest(original,actor,site,input){
 if(!actor?.applicant)fail('Use the applicant session to submit an interest form.',403);
 const state=structuredClone(original),details=normalizeInterest(input,site,actor);
 if(state.applications.some(a=>a.lane===SITES[site].lane&&owns(actor,a)&&!['rejected'].includes(a.state)))fail('You already have an application for this project. Review it instead of submitting a duplicate.',409);
 const id='app-'+randomUUID();const app={...details,id,identity:actor.id,lane:SITES[site].lane,roleId:site==='research'?'research-contributor':'contributor',project:SITES[site].name,state:'submitted',version:1,createdAt:TODAY,capabilityGrant:null,provisioning:'not_requested',reviews:[],memos:[],credential:null,validations:[],proposals:[],directory:emptyDirectory('SAMPLE-'+id.slice(-8))};
 state.applications.push(app);state.revision++;log(state,actor,app,'submit_interest',{source:app.source,lane:app.lane});return state;
}
