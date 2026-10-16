import {createHash, randomUUID} from 'node:crypto';
import {allocationWeight,ALLOCATION_NOTICE,BENEFICIARY_POLICY} from './weights.mjs';
import {SITES,normalizeInterest,emptyDirectory} from './interest.mjs';
export function contributorService(){
const TODAY=new Date().toISOString().slice(0,10);
const LEVELS=['Advisor','Part Time','Half Time','Full Time'];
const owns=(actor,app)=>actor.applicant&&app.identity===actor.id;
const privateNote=x=>x===undefined?'':typeof x==='string'&&x.length<=2000?x.trim():fail('Private note must be at most 2,000 characters.');
const canChange=(actor,app)=>actor.changeStatus?.includes(app.lane);
const canPropose=(actor,app)=>actor.proposeStatus?.includes(app.lane);
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const day=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('Enter a valid date.');return value;};
const text=(x,label)=>{if(typeof x!=='string'||!x.trim()||x.length>2000)fail(`${label} is required (maximum 2,000 characters).`);return x.trim();};
function fields(input,allowed){for(const key of Object.keys(input))if(!allowed.includes(key))fail(`Unexpected field: ${key}`);}
function log(state,actor,app,action,detail){
 const entry={id:randomUUID(),sequence:state.audit.length+1,at:new Date().toISOString(),actor:actor.id,applicationId:app.id,action,detail,policy:'contributor-policy-v1',previousHash:state.audit.at(-1)?.hash||null};entry.hash=hash(entry);state.audit.push(entry);
}
function memoTerms(input){
  if(!LEVELS.includes(input.level))fail('Select a recognized contribution level.');
  if(!['Contributor','Senior contributor','Lead contributor'].includes(input.rank))fail('Select a recognized rank.');
  const start=day(input.start),end=input.end===null?null:day(input.end);
  if((end!==null&&end<start)||start<TODAY)fail('Use today or a future effective date and an end date after it.');
  const historicalServiceStart=input.historicalServiceStart==null||input.historicalServiceStart===''?null:day(input.historicalServiceStart);
  if(historicalServiceStart&&(historicalServiceStart>TODAY||historicalServiceStart>start))fail('Historical service must begin on or before today and the memorandum effective date.');
  const weight=allocationWeight(input.level,input.allocationWeight,input.allocationReason);
  return {level:input.level,rank:input.rank,scope:text(input.scope,'Responsibilities'),start,end,historicalServiceStart,allocationWeight:weight};
}
function draftMemo(state,actor,app,input){
 const terms=memoTerms(input);
 for(const memo of app.memos)if(memo.status==='draft')memo.status='superseded';
 for(const edit of app.memoEdits||[])if(edit.state==='pending')edit.state='superseded';
 const memo={version:app.memos.length+1,...terms,allocationWeight:{...terms.allocationWeight,approvedBy:actor.id,approvedAt:new Date().toISOString()},allocationNotice:ALLOCATION_NOTICE,beneficiaryPolicy:BENEFICIARY_POLICY,policyVersion:'contributor-policy-v4-btree-beneficiary',wallet:app.wallet,issuer:actor.id,status:'draft',createdAt:new Date().toISOString()};
 memo.hash=hash({applicationId:app.id,...memo});app.memos.push(memo);return memo;
}
function view(state,actor,site='gov'){
 if(!actor)fail('Choose a review persona.',401);
 if(!SITES[site])fail('Unknown project.');
 if(!actor.review.includes(SITES[site].lane)&&!actor.applicant)fail('This account has no application or review access.',403);
 const applications=state.applications.filter(a=>a.lane===SITES[site].lane&&(actor.review.includes(a.lane)||owns(actor,a))).map(a=>{const copy=structuredClone(a);if(!actor.review.includes(a.lane)){delete copy.directory;delete copy.proposals;copy.reviews=copy.reviews.filter(r=>r.state!=='pending_authority').map(({privateNote,...r})=>r);}return copy;});
 return {mode:state.mode,site,siteName:SITES[site].name,today:TODAY,revision:state.revision,persona:{id:actor.id,name:actor.name,isApplicant:!!actor.applicant,canReview:actor.review.includes(SITES[site].lane),canDecide:actor.decide.includes(SITES[site].lane),canIssue:actor.issue&&actor.decide.includes(SITES[site].lane),canValidate:actor.validate&&actor.review.includes(SITES[site].lane),canChangeStatus:actor.changeStatus?.includes(SITES[site].lane)||false,canProposeStatus:actor.proposeStatus?.includes(SITES[site].lane)||false},applications,audit:state.audit.filter(e=>applications.some(a=>a.id===e.applicationId)&&(actor.review.includes(SITES[site].lane)||!['update_directory','propose_change','review_proposal'].includes(e.action)&&e.detail.state!=='pending_authority')).map(e=>{if(actor.review.includes(SITES[site].lane))return e;const copy=structuredClone(e);delete copy.detail.privateNote;return copy;}),policy:{version:'contributor-policy-v4-btree-beneficiary',beneficiaryPolicy:BENEFICIARY_POLICY,allocationConfigured:false,issuer:'Partner authority',authority:'Verified Roles decisions',levelMultipliers:{'Full Time':'1','Half Time':'1/2','Part Time':'1/6',Advisor:'1/10'},rate:'Payment calculation remains subject to the approved distribution policy',blockers:['Approve allocation formula, snapshot and rounding rules','Approve and fund each distribution; no automatic token transfers']}};
}
function transition(original,actor,id,input,{expiredConsentVerified=false}={}){
 if(!actor)fail('A verified session is required.',401);
 const state=structuredClone(original),app=state.applications.find(a=>a.id===id);
 if(!app||(!actor.review.includes(app.lane)&&!owns(actor,app)))fail('Application access denied.',403);
 if(!Number.isInteger(input.expectedVersion)||input.expectedVersion!==app.version)fail('This record changed. Reload it before trying again.',409);
 const action=input.action;
 if(app.chainOperation?.status==='prepared'&&['draft_memo','link_wallet','review_proposal','request_memo_edit','review_memo_edit'].includes(action))fail('Reconcile the prepared transaction before changing its terms.',409);
 const revisesMemo=action==='draft_memo'||action==='review_memo_edit'&&input.decision==='approve'||action==='review_proposal'&&input.decision==='approve'&&app.proposals.find(p=>p.id===input.proposalId)?.kind==='terms';
 if(revisesMemo&&app.memos.at(-1)?.status==='draft'&&app.memos.at(-1)?.consent&&!expiredConsentVerified)fail('The signed memorandum must expire and be verified on-chain before revising it.',409);
 if(action==='standing'&&app.credential)fail('On-chain standing and amendment execution is not configured.',503);
 if(['start_review','request_info','resume_review','approve','reject'].includes(action)){
  fields(input,['action','expectedVersion','reason','privateNote']);
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
  app.reviews.push({action,reason,privateNote:privateNote(input.privateNote),state:app.state,actor:actor.id,at:TODAY});log(state,actor,app,action,{reason,privateNote:privateNote(input.privateNote),state:app.state});
 }else if(action==='draft_memo'){
  fields(input,['action','expectedVersion','level','rank','scope','start','end','historicalServiceStart','allocationWeight','allocationReason']);
  if(!actor.issue||!actor.decide.includes(app.lane))fail('Memorandum issuer authority is required.',403);
  if(app.state!=='approved')fail('Accept the application before preparing a memo.',409);
  if(app.credential&&app.credential.standing==='suspended')fail('Resume the credential before revising its memorandum.',409);
  const memo=draftMemo(state,actor,app,input);log(state,actor,app,action,{memoVersion:memo.version,hash:memo.hash});
 }else if(action==='respond_info'){
  fields(input,['action','expectedVersion','reason']);
  if(!owns(actor,app))fail('Only the applicant can respond.',403);
  if(app.state!=='needs_info')fail('No information has been requested.',409);
  const reason=text(input.reason,'Application response');app.state='in_review';
  app.reviews.push({action,reason,state:app.state,actor:actor.id,at:new Date().toISOString()});log(state,actor,app,action,{reason,state:app.state});
 }else if(action==='request_memo_edit'){
  fields(input,['action','expectedVersion','memoVersion','memoHash','reason','level','rank','scope','start','end','historicalServiceStart','allocationWeight','allocationReason']);
  if(!owns(actor,app))fail('Only the applicant can propose edits to their memorandum.',403);
  const memo=app.memos.at(-1);
  if(app.state!=='approved'||memo?.status!=='draft'||memo.version!==input.memoVersion||memo.hash!==input.memoHash)fail('Reload the current draft before proposing edits.',409);
  if(memo.consent)fail('This memorandum is already signed. Ask a Partner to prepare a revised draft after the authorization expires.',409);
  if(app.memoEdits?.some(e=>e.state==='pending'))fail('A memorandum edit is already awaiting review.',409);
  const terms=memoTerms(input),edit={id:randomUUID(),baseVersion:memo.version,baseHash:memo.hash,terms,reason:text(input.reason,'Reason for edits'),requestedBy:actor.id,requestedAt:new Date().toISOString(),state:'pending'};
  app.memoEdits=[...(app.memoEdits||[]),edit];log(state,actor,app,action,{editId:edit.id,baseVersion:memo.version,reason:edit.reason});
 }else if(action==='review_memo_edit'){
  fields(input,['action','expectedVersion','editId','decision','reason','start']);
  if(!actor.issue||!actor.decide.includes(app.lane))fail('Partner approval is required for memorandum edits.',403);
  const edit=app.memoEdits?.find(e=>e.id===input.editId),memo=app.memos.at(-1);
  if(!edit||edit.state!=='pending'||memo?.status!=='draft'||edit.baseVersion!==memo.version||edit.baseHash!==memo.hash)fail('This edit no longer matches the current draft.',409);
  if(edit.requestedBy===actor.id)fail('A proposer cannot approve their own proposal.',403);
  if(!['approve','reject'].includes(input.decision))fail('Choose approve or reject.');
  const reason=text(input.reason,'Review explanation');
  if(input.decision==='approve'){
   const t=edit.terms,newMemo=draftMemo(state,actor,app,{...t,start:input.start||(t.start<TODAY?TODAY:t.start),allocationWeight:t.allocationWeight.label,allocationReason:t.allocationWeight.reason});
   edit.acceptedVersion=newMemo.version;
  }
  edit.state=input.decision==='approve'?'approved':'rejected';edit.reviewedBy=actor.id;edit.reviewedAt=new Date().toISOString();edit.decisionReason=reason;
  log(state,actor,app,action,{editId:edit.id,state:edit.state,memoVersion:edit.acceptedVersion||memo.version,reason});
 }else if(action==='link_wallet'){
  fields(input,['action','expectedVersion']);
  if(!owns(actor,app)||!actor.wallet)fail('Verify wallet ownership in this session before linking.',403);
  if(app.credential)fail('An issued credential requires the recovery process.',409);
  if(app.walletVerification==='verified')fail('A verified wallet is already linked.',409);
  if(state.applications.some(a=>a.identity!==actor.id&&a.wallet===actor.wallet.toLowerCase()&&a.walletVerification==='verified'))fail('This wallet is linked to another contributor account. Identity reconciliation is required.',409);
  app.wallet=actor.wallet.toLowerCase();app.walletVerification='verified';
  for(const edit of app.memoEdits||[])if(edit.state==='pending')edit.state='superseded';
  for(const memo of app.memos)if(memo.status==='draft')memo.status='superseded';
  log(state,actor,app,action,{proof:'verified signed wallet challenge'});
 }else if(action==='acknowledge'){
  fields(input,['action','expectedVersion','memoVersion','memoHash']);
  if(!owns(actor,app))fail('Only the applicant may acknowledge their own memorandum.',403);
  const memo=app.memos.at(-1);
  if(app.memoEdits?.some(e=>e.state==='pending'))fail('Resolve the proposed memorandum edits before acknowledgment.',409);
  if(app.walletVerification!=='verified'||memo?.wallet!==app.wallet)fail('Link a verified wallet and prepare the matching memo before acknowledgment.',409);
  if(!memo||memo.status!=='draft'||memo.version!==input.memoVersion||memo.hash!==input.memoHash)fail('Review the current memorandum version before acknowledging.',409);
  if(memo.acknowledgedAt)fail('This version is already acknowledged.',409);
  memo.acknowledgedBy=actor.id;memo.acknowledgedAt=TODAY;log(state,actor,app,action,{memoVersion:memo.version,hash:memo.hash,proof:'authenticated account acknowledgment; on-chain consent still required'});
 }else if(action==='issue'){
  fail('On-chain issuance is not configured. No credential has been issued.',503);
 }else if(action==='standing'){
  fields(input,['action','expectedVersion','standing','reason','privateNote']);
  if(!canChange(actor,app))fail('Partner status authority is required.',403);
  const c=app.credential;if(!c)fail('No credential has been issued.',409);
  if(['ended','revoked'].includes(c.standing))fail('Ended or revoked credentials cannot be reactivated.',409);
  if(!['active','suspended','ended','revoked'].includes(input.standing)||input.standing===c.standing)fail('Choose a different standing.');
  const reason=text(input.reason,'Status reason');c.standing=input.standing;c.revision=(c.revision||1)+1;c.history.push({action:'standing',standing:c.standing,reason,at:TODAY});log(state,actor,app,action,{standing:c.standing,reason,privateNote:privateNote(input.privateNote)});
 }else if(action==='validate_month'){
  fields(input,['action','expectedVersion','month','from','through','evidence']);
  if(!actor.validate||!actor.review.includes(app.lane))fail('Monthly validation authority is required.',403);
  const c=app.credential;if(!c||c.standing!=='active'||c.monthlyBtreeBeneficiary!==true||!Number.isFinite(Date.parse(c.chainCheckedAt))||Date.now()-Date.parse(c.chainCheckedAt)>90000)fail('A current, Active, in-term credential verified on-chain is required for monthly BTREE beneficiary eligibility.',409);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month||''))fail('Select a valid month.');
  const from=day(input.from),through=day(input.through),memo=app.memos.find(m=>m.version===c.memoVersion);
  if(!from.startsWith(input.month)||!through.startsWith(input.month)||through<from||from<memo.start||(memo.end!==null&&through>memo.end)||through>TODAY)fail('Dates must be in this month, within the memo term, and no later than the review date.');
  if(app.validations.some(v=>v.month===input.month))fail('This month already has a validation. Adjustments require a separate reviewed record.',409);
  const validation={id:randomUUID(),month:input.month,from,through,eligibleDays:Math.round((Date.parse(through)-Date.parse(from))/86400000)+1,level:c.level,allocationWeight:structuredClone(memo.allocationWeight||null),memoVersion:c.memoVersion,evidence:text(input.evidence,'Validation evidence'),validatedBy:actor.id,selfConfirmed:actor.id===app.identity,validatedAt:TODAY,status:'validated',beneficiaryEligibility:{eligible:true,policy:BENEFICIARY_POLICY,contract:c.contract,tokenId:String(c.tokenId),checkedAt:c.chainCheckedAt,blockNumber:c.chainCheckedBlock},allocationStatus:'blocked_policy',amount:null};
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
  fields(input,['action','expectedVersion','proposalId','decision','reason','privateNote']);
  if(!canChange(actor,app))fail('Partner approval is required.',403);
  const p=app.proposals.find(p=>p.id===input.proposalId);if(!p||p.state!=='pending')fail('This proposal is not pending.',409);
  if(p.proposedBy===actor.id)fail('A proposer cannot approve their own proposal.',403);
  if(!['approve','reject'].includes(input.decision))fail('Choose approve or reject.');
  const reason=text(input.reason,'Partner decision reason');const c=app.credential;
  if(input.decision==='approve'){
   if(!c||(c.revision||1)!==p.baseCredentialRevision||['ended','revoked'].includes(c.standing))fail('The credential changed after this proposal. Reject it and request a fresh proposal.',409);
   if(p.kind==='standing'){
    p.execution='awaiting_chain';
   }else{
    if(c.standing!=='active')fail('Only active credentials can receive revised terms.',409);
    const old=app.memos.find(m=>m.version===c.memoVersion);
    if(old.end!==null&&old.end<TODAY)fail('Renew the expired term before changing its level.',409);
    const memo=draftMemo(state,actor,app,{...old,...p.change,start:TODAY,allocationWeight:old.allocationWeight?.custom?old.allocationWeight.label:undefined,allocationReason:old.allocationWeight?.custom?old.allocationWeight.reason:undefined});p.memoVersion=memo.version;
   }
  }
  p.state=input.decision==='approve'?'approved':'rejected';p.reviewedBy=actor.id;p.reviewedAt=TODAY;p.decisionReason=reason;p.privateNote=privateNote(input.privateNote);
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

function submitInterest(original,actor,site,input,auditActor=actor){
 if(!actor?.applicant)fail('Use the applicant session to submit an interest form.',403);
 const state=structuredClone(original),details=normalizeInterest(input,site,actor);
 if(details.walletVerification==='verified'&&state.applications.some(a=>a.identity!==actor.id&&a.wallet===details.wallet&&a.walletVerification==='verified'))fail('This wallet belongs to another contributor account. Identity reconciliation is required.',409);
 if(state.applications.some(a=>a.lane===SITES[site].lane&&owns(actor,a)&&!['rejected'].includes(a.state)))fail('You already have an application for this project. Review it instead of submitting a duplicate.',409);
 const id='app-'+randomUUID();const app={...details,id,identity:actor.id,lane:SITES[site].lane,roleId:site==='research'?'research-contributor':'contributor',project:SITES[site].name,state:'submitted',version:1,createdAt:TODAY,capabilityGrant:null,provisioning:'not_requested',reviews:[],memos:[],credential:null,validations:[],proposals:[],directory:emptyDirectory('BC-'+id.slice(-8))};
 state.applications.push(app);state.revision++;log(state,auditActor,app,'submit_interest',{source:app.source,lane:app.lane});return state;
}

function importBase(original,actor,site,{application,source}){
 const existing=original.applications.find(a=>a.sourceAttestation?.uid===source.uid);
 if(existing){if(!owns(actor,existing))fail('This application is already linked to another account. Identity reconciliation is required.',409);return original;}
 const next=submitInterest(original,actor,site,application),app=next.applications.at(-1);
 app.source='base-eas';app.sourceAttestation=source;app.emailVerified=false;
 log(next,actor,app,'import_base_application',{sourceAttestation:source});return next;
}
function importBaseForReview(original,reviewer,owner,site,{application,source}){
 if(!reviewer.review.includes(SITES[site]?.lane))fail('Contributor reviewer permission is required.',403);
 const existing=original.applications.find(a=>a.sourceAttestation?.uid===source.uid);
 if(existing){if(existing.lane!==SITES[site].lane)fail('Application belongs to another project.',403);return original;}
 const next=submitInterest(original,owner,site,application,reviewer),app=next.applications.at(-1);
 app.source='base-eas';app.sourceAttestation=source;app.emailVerified=false;
 log(next,reviewer,app,'import_base_for_review',{sourceAttestation:source});return next;
}
return {view,transition,submitInterest,importBase,importBaseForReview};
}
export const emptyState=()=>({schemaVersion:2,revision:1,mode:"production",applications:[],audit:[],nextTokenId:1});
