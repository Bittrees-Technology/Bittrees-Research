import test from 'node:test';import assert from 'node:assert/strict';
import {privateCodec,contributorStore,compareAndSet} from './storage.mjs';
import {contributorAuth,consume} from './auth.mjs';
import {contributorActor} from './authority.mjs';
import {contributorService,emptyState} from './core.mjs';
import {createContributorHandler} from './handler.mjs';
const secret='test-only-secret-'.repeat(5),codec=privateCodec(secret);
function memory(){const values=new Map();return {values,async command([op,...args]){if(op==='GET')return {result:values.get(args[0])||null};if(op==='SET'){values.set(args[0],args[1]);return {result:'OK'};}if(op==='DEL'){values.delete(args[0]);return {result:1};}if(op==='EVAL'){const [script,,key,...a]=args;if(script===consume){if(values.get(key)!==a[0])return {result:0};values.delete(key);return {result:1};}if(script===compareAndSet){if((values.get(key)||'')!==a[0])return {result:0};values.set(key,a[1]);return {result:1};}const n=Number(values.get(key)||0)+1;values.set(key,n);return {result:n};}throw Error(op);}};}
const applicant={id:'email:person',name:'Contributor',applicant:true,wallet:null,review:[],decide:[],issue:false,validate:false,changeStatus:[],proposeStatus:[]};
const partner={...applicant,id:'email:partner',review:['research','inc-ops-governance'],decide:['research','inc-ops-governance'],issue:true,validate:true,changeStatus:['research','inc-ops-governance']};
const interest={name:'Test person',email:'test@example.invalid',expertise:['Research'],requestedRoles:['Researcher'],specialty:'Methods',region:['EMEA'],heardFrom:'Website'};
const req=(body={},headers={})=>({method:'POST',body,headers:{origin:'https://gov.bittrees.org','content-type':'application/json',...headers}});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
test('private storage is authenticated ciphertext and rejects concurrent updates',async()=>{const raw=codec.seal({email:'private@example.invalid'});assert.ok(!raw.includes('private@'));assert.equal(codec.open(raw).email,'private@example.invalid');assert.throws(()=>privateCodec('different-secret'.repeat(5)).open(raw));const mem=memory(),store=contributorStore(mem.command,codec,'gov');const results=await Promise.allSettled([store.mutate(s=>({...s,revision:2})),store.mutate(s=>({...s,revision:2}))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok([...mem.values.keys()].every(k=>k.includes(':gov:')));});
test('email codes are single use and wallet links require a signed challenge',async()=>{const mem=memory();let sent,now=1000;const auth=contributorAuth({command:mem.command,codec,project:'gov',origin:'https://gov.bittrees.org',env:{RESEND_API_KEY:'test',CONTRIBUTOR_EMAIL_FROM:'test@example.invalid',CONTRIBUTOR_IDENTITY_SECRET:secret},now:()=>now,send:async(_,o)=>{sent=JSON.parse(o.body);return {ok:true};},verifyWallet:async({signature})=>signature==='valid'});const r=req();const {challenge}=await auth.start(r,'test@example.invalid');const code=sent.text.match(/\b\d{6}\b/)[0];assert.ok(!JSON.stringify([...mem.values.values()]).includes(code));await assert.rejects(()=>auth.finish(r,response(),challenge,'000000'),/Incorrect/);const res=response();await auth.finish(r,res,challenge,code);await assert.rejects(()=>auth.finish(r,response(),challenge,code),/expired/);assert.match(res.headers['Set-Cookie'],/Secure; HttpOnly; SameSite=Strict/);const signed=req({}, {cookie:res.headers['Set-Cookie'].split(';')[0]});const session=await auth.read(signed);assert.equal(session.email,'test@example.invalid');await auth.walletChallenge(signed,session,'0x'+'1'.repeat(40));await assert.rejects(()=>auth.walletVerify(signed,session,'invalid'),/ownership/);await auth.walletVerify(signed,session,'valid');assert.equal((await auth.read(signed)).wallet,'0x'+'1'.repeat(40));await assert.rejects(()=>auth.walletVerify(signed,session,'valid'),/expired/);now+=86400001;assert.equal(await auth.read(signed),null);});
test('role names or legacy admin permissions do not imply contributor authority',async()=>{for(const actions of [[],['project.admin'],['role.operations']]){const actor=await contributorActor({identity:'id',email:'test@example.invalid'},'gov',{secret,access:async()=>({enrolled:true,authoritative:true,actions})});assert.equal(actor.issue,false);assert.equal(actor.validate,false);}for(const tier of ['tier.partner','tier.junior-partner','tier.associate']){const actor=await contributorActor({identity:'id',email:'test@example.invalid'},'gov',{secret,access:async()=>({enrolled:true,authoritative:true,actions:[tier]})});assert.equal(actor.validate,true);assert.equal(actor.issue,tier==='tier.partner');}await assert.rejects(()=>contributorActor({email:'test@example.invalid'},'gov',{secret,access:async()=>({enrolled:false})}),/unavailable/);});
test('production core has no seed users or simulated issuance and redacts private notes',()=>{const core=contributorService();let state=core.submitInterest(emptyState(),applicant,'research',interest);const id=state.applications[0].id;assert.equal(state.applications.length,1);assert.equal(state.applications[0].wallet,null);const change=(actor,action,fields={})=>{state=core.transition(state,actor,id,{action,expectedVersion:state.applications[0].version,...fields});};change(partner,'start_review',{reason:'Review',privateNote:'PRIVATE'});change(partner,'approve',{reason:'Accepted',privateNote:'PRIVATE'});change(partner,'draft_memo',{level:'Part Time',rank:'Contributor',scope:'Methods',start:new Date().toISOString().slice(0,10),end:null});assert.equal(state.applications[0].memos[0].end,null);assert.throws(()=>change(partner,'issue'),/not configured/);assert.equal(state.applications[0].credential,null);assert.ok(!JSON.stringify(core.view(state,applicant,'research')).includes('PRIVATE'));assert.throws(()=>change(applicant,'link_sample_wallet'),/Unsupported/);});
test('HTTP feature gate, origin, session and CSRF checks fail closed',async()=>{let res=response();await createContributorHandler('gov',{env:{}})(req(),res);assert.equal(res.code,503);const mem=memory(),env={CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret};const handler=createContributorHandler('gov',{env,command:mem.command});res=response();await handler(req({action:'list'}),res);assert.equal(res.code,401);res=response();await handler(req({action:'email_start',email:'test@example.invalid'},{origin:'https://evil.invalid'}),res);assert.equal(res.code,403);res=response();await handler({...req(),method:'GET'},res);assert.equal(res.body.session,null);});
test('HTTP wallet-only access enforces proof, CSRF and original Base submission',async()=>{const mem=memory(),env={CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret};const handler=createContributorHandler('gov',{env,command:mem.command,verifyWallet:async({signature})=>signature==='valid',actorFor:async s=>({...applicant,id:s.identity,wallet:s.wallet,authorityExpiresAt:Date.now()+5000})});for(const action of ['email_start','email_finish']){const res=response();await handler(req({action}),res);assert.equal(res.code,410);}let res=response();await handler(req({action:'wallet_login_start',address:'0x'+'1'.repeat(40)}),res);const challenge=res.body.challenge,binding=res.headers['Set-Cookie'].split(';')[0];res=response();await handler(req({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:binding}),res);assert.equal(res.code,200);const cookie=res.headers['Set-Cookie'][0].split(';')[0];res=response();await handler({...req({}, {cookie}),method:'GET'},res);const csrf=res.body.session.csrf;res=response();await handler(req({action:'list'},{cookie}),res);assert.equal(res.code,403);res=response();await handler(req({action:'apply',application:interest},{cookie,'x-contributor-csrf':csrf}),res);assert.equal(res.code,409);});
test('a verified wallet cannot silently merge distinct contributor accounts',()=>{const core=contributorService(),wallet='0x'+'1'.repeat(40),first={...applicant,wallet};const state=core.submitInterest(emptyState(),first,'research',{...interest,wallet});assert.throws(()=>core.submitInterest(state,{...first,id:'other-email'},'research',{...interest,wallet}),/reconciliation/);const other=core.submitInterest(state,{...first,id:'other-email',wallet:null},'research',{...interest,wallet:''});const app=other.applications.at(-1);assert.throws(()=>core.transition(other,{...first,id:'other-email'},app.id,{action:'link_wallet',expectedVersion:app.version}),/reconciliation/);});

test('wallet-only sign-in binds origin/browser challenge and rejects replay and invalid signatures',async()=>{
 const mem=memory();let now=1000;const wallet='0x'+'1'.repeat(40);const auth=contributorAuth({command:mem.command,codec,project:'gov',origin:'https://gov.bittrees.org',env:{CONTRIBUTOR_IDENTITY_SECRET:secret},now:()=>now,verifyWallet:async({signature})=>signature==='valid'});
 const start=response(),c=await auth.walletLoginStart(req(),start,wallet);assert.match(c.message,/https:\/\/gov.bittrees.org/);
 await assert.rejects(()=>auth.walletLoginFinish(req(),response(),c.challenge,'valid'),/rejected/);
 const bound=req({}, {cookie:start.headers['Set-Cookie'].split(';')[0]});await assert.rejects(()=>auth.walletLoginFinish(bound,response(),c.challenge,'bad'),/ownership/);
 const done=response();await auth.walletLoginFinish(bound,done,c.challenge,'valid');const logged=req({}, {cookie:done.headers['Set-Cookie'][0].split(';')[0]});const session=await auth.read(logged);assert.equal(session.email,null);assert.equal(session.wallet,wallet);assert.match(session.identity,/^wallet:/);await assert.rejects(()=>auth.walletLoginFinish(bound,response(),c.challenge,'valid'),/expired/);
 const expired=response(),c2=await auth.walletLoginStart(req(),expired,wallet);now+=300001;await assert.rejects(()=>auth.walletLoginFinish(req({}, {cookie:expired.headers['Set-Cookie'].split(';')[0]}),response(),c2.challenge,'valid'),/ownership/);
});
test('wallet authority sends only verified wallet, never a synthetic verified email',async()=>{
 const wallet='0x'+'1'.repeat(40);let seen;const actor=await contributorActor({identity:'wallet:test',email:null,wallet},'gov',{secret,access:async(...args)=>{seen=args;return {enrolled:true,authoritative:true,actions:[]};}});assert.deepEqual(seen[1],[wallet]);assert.deepEqual(seen[2].verifiedEmails,[]);assert.equal(actor.issue,false);
});
test('Base import is idempotent, keeps approval separate and prefills memo from same application',()=>{
 const core=contributorService(),wallet='0x'+'1'.repeat(40),actor={...applicant,id:'wallet:applicant',wallet};const source={uid:'0x'+'2'.repeat(64),kind:'base-eas',chainId:8453};const input={application:{...interest,email:'',requestedRoles:[],wallet},source};let state=core.importBase(emptyState(),actor,'gov',input);const app=state.applications[0];assert.equal(app.walletVerification,'verified');assert.equal(app.state,'submitted');assert.equal(app.emailVerified,false);assert.equal(core.importBase(state,actor,'gov',input).applications.length,1);assert.throws(()=>core.importBase(state,{...actor,id:'other'},'gov',input),/reconciliation/);
 assert.throws(()=>core.transition(state,partner,app.id,{action:'draft_memo',expectedVersion:1}),/Accept/);
 for(const action of ['start_review','approve'])state=core.transition(state,partner,app.id,{action,expectedVersion:state.applications[0].version,reason:'Reviewed'});
 state=core.transition(state,partner,app.id,{action:'draft_memo',expectedVersion:state.applications[0].version,level:'Full Time',rank:'Lead contributor',scope:app.specialty,start:new Date().toISOString().slice(0,10),end:null});assert.equal(state.applications[0].memos[0].scope,app.specialty);assert.equal(state.applications[0].credential,null);
});

test('HTTP wallet-only import requires CSRF and stores provenance without content key',async()=>{
 const mem=memory(),wallet='0x'+'1'.repeat(40),uid='0x'+'3'.repeat(64),contentKey='4'.repeat(64);let imports=0;
 const handler=createContributorHandler('gov',{env:{CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret},command:mem.command,verifyWallet:async({signature})=>signature==='valid',actorFor:async s=>({...applicant,id:s.identity,wallet:s.wallet,authorityExpiresAt:Date.now()+10000}),baseReader:async(project,session,body)=>{assert.equal(project,'gov');assert.equal(session.wallet,wallet);assert.equal(body.contentKey,contentKey);imports++;return {application:{...interest,email:'',requestedRoles:[],wallet},source:{uid,chainId:8453}};}});
 let res=response();await handler(req({action:'wallet_login_start',address:wallet}),res);const challenge=res.body.challenge,binding=res.headers['Set-Cookie'].split(';')[0];res=response();await handler(req({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:binding}),res);assert.equal(res.code,200);const cookie=res.headers['Set-Cookie'][0].split(';')[0];res=response();await handler({...req({}, {cookie}),method:'GET'},res);const csrf=res.body.session.csrf;assert.equal(res.body.session.email,null);
 const body={action:'import_base',uid,contentKey};res=response();await handler(req(body,{cookie}),res);assert.equal(res.code,403);assert.equal(imports,0);
 for(let i=0;i<2;i++){res=response();await handler(req(body,{cookie,'x-contributor-csrf':csrf}),res);assert.equal(res.code,200);assert.equal(res.body.applications.length,1);assert.equal(res.body.applications[0].state,'submitted');assert.equal(res.body.applications[0].sourceAttestation.uid,uid);assert.ok(!JSON.stringify(res.body).includes(contentKey));}
 for(const raw of mem.values.values()){try{assert.ok(!JSON.stringify(codec.open(raw)).includes(contentKey));}catch(e){if(e.code==='ERR_ASSERTION')throw e;}}
});

test('historical service is signed memo context, never retroactive validity or review eligibility',async()=>{
 const {termsFor}=await import('./chain.mjs');
 const core=contributorService(),today=new Date().toISOString().slice(0,10);
 let state=core.submitInterest(emptyState(),applicant,'research',interest);
 const id=state.applications[0].id;
 const change=(actor,input)=>core.transition(state,actor,id,{expectedVersion:state.applications[0].version,...input});
 for(const action of ['start_review','approve'])state=change(partner,{action,reason:'Reviewed'});
 const draft={action:'draft_memo',level:'Full Time',rank:'Lead contributor',scope:'Stewardship',start:today,end:null,historicalServiceStart:'2020-03-27'};
 assert.throws(()=>change(applicant,draft),/authority/);
 assert.throws(()=>change(partner,{...draft,start:'2020-03-27'}),/today or a future/);
 assert.throws(()=>change(partner,{...draft,historicalServiceStart:'2999-01-01'}),/Historical service/);
 assert.throws(()=>change(partner,{...draft,historicalServiceStart:'2020-02-30'}),/valid date/);
 state=change(partner,draft);
 const first=structuredClone(state.applications[0].memos[0]),terms=termsFor(state.applications[0],first,'research');
 assert.equal(first.historicalServiceStart,'2020-03-27');
 assert.equal(core.view(state,applicant,'research').applications[0].memos[0].historicalServiceStart,'2020-03-27');
 assert.equal(terms.validFrom,Date.parse(today+'T00:00:00Z')/1000);
 state=change(partner,{...draft,historicalServiceStart:'2020-03-28'});
 const revised=state.applications[0].memos[1];
 assert.notEqual(first.hash,revised.hash);
 assert.equal(termsFor(state.applications[0],revised,'research').validFrom,terms.validFrom);
 assert.equal(state.applications[0].memos[0].historicalServiceStart,'2020-03-27');
 assert.equal(state.applications[0].memos[0].status,'superseded');
 assert.equal(state.applications[0].credential,null);
 state=change(partner,{...draft,historicalServiceStart:''});
 assert.equal(state.applications[0].memos.at(-1).historicalServiceStart,null);
});

test('only an issuer with Partner decision authority can prepare signed custom weights',()=>{
 const core=contributorService(),today=new Date().toISOString().slice(0,10);let state=core.submitInterest(emptyState(),applicant,'research',interest);const id=state.applications[0].id;
 const change=(actor,input)=>core.transition(state,actor,id,{expectedVersion:state.applications[0].version,...input});
 for(const action of ['start_review','approve'])state=change(partner,{action,reason:'Reviewed'});
 const draft={action:'draft_memo',level:'Half Time',rank:'Contributor',scope:'Research',start:today,end:null,allocationWeight:'1/3',allocationReason:'Agreed project commitment'};
 assert.throws(()=>change({...partner,decide:[],issue:false},draft),/authority/);
 assert.throws(()=>change(partner,{...draft,allocationReason:''}),/Explain/);
 state=change(partner,draft);const first=structuredClone(state.applications[0].memos[0]);assert.equal(first.allocationWeight.label,'1/3');assert.equal(first.allocationWeight.approvedBy,partner.id);assert.equal(core.view(state,applicant,'research').applications[0].memos[0].allocationWeight.reason,draft.allocationReason);
 state=change(partner,{...draft,allocationWeight:'1/4'});const second=state.applications[0].memos[1];assert.notEqual(first.hash,second.hash);assert.equal(second.consent,undefined);assert.equal(state.applications[0].memos[0].status,'superseded');assert.equal(state.applications[0].credential,null);
});

test('monthly beneficiary eligibility requires a fresh chain check; validation does not authorize a payment',()=>{
 const core=contributorService();let state=core.submitInterest(emptyState(),applicant,'research',interest),a=state.applications[0],today=new Date().toISOString().slice(0,10);a.state='approved';a.memos=[{version:1,start:today,end:null,allocationWeight:{numerator:1,denominator:1}}];a.credential={tokenId:'1',contract:'0x'+'2'.repeat(40),standing:'active',memoVersion:1,level:'Full Time'};
 const input={action:'validate_month',expectedVersion:a.version,month:today.slice(0,7),from:today,through:today,evidence:'Documented work'};
 assert.throws(()=>core.transition(state,partner,a.id,input),/beneficiary eligibility/);
 a.credential.monthlyBtreeBeneficiary=true;a.credential.chainCheckedAt=new Date(Date.now()-100000).toISOString();assert.throws(()=>core.transition(state,partner,a.id,input),/beneficiary eligibility/);
 a.credential.chainCheckedAt=new Date().toISOString();a.credential.chainCheckedBlock='123';const updated=core.transition(state,partner,a.id,input),v=updated.applications[0].validations[0];assert.equal(v.beneficiaryEligibility.eligible,true);assert.equal(v.beneficiaryEligibility.blockNumber,'123');assert.equal(v.amount,null);assert.equal(v.allocationStatus,'blocked_policy');
});

test('application information reply and memo negotiation preserve exact approval, identity and version history',async()=>{
 const core=contributorService(),wallet='0x'+'1'.repeat(40),owner={...applicant,wallet};
 let state=core.submitInterest(emptyState(),owner,'research',{...interest,wallet});const id=state.applications[0].id;
 const apply=(actor,action,extra={})=>{state=core.transition(state,actor,id,{action,expectedVersion:state.applications[0].version,...extra});};
 apply(partner,'request_info',{reason:'Describe research scope'});
 assert.throws(()=>apply(partner,'respond_info',{reason:'Not mine'}),/Only the applicant/);
 apply(owner,'respond_info',{reason:'Research and documentation'});assert.equal(state.applications[0].state,'in_review');
 apply(partner,'approve',{reason:'Approved'});
 apply(partner,'draft_memo',{level:'Full Time',rank:'Contributor',scope:'Original scope',start:new Date().toISOString().slice(0,10),end:null});
 const original=structuredClone(state.applications[0].memos[0]);
 const edits={memoVersion:original.version,memoHash:original.hash,level:'Half Time',rank:'Senior contributor',scope:'Revised scope',start:original.start,end:null,allocationWeight:'1/3',allocationReason:'Agreed scope',reason:'Adjust weekly commitment'};
 assert.throws(()=>apply({...owner,id:'intruder'},'request_memo_edit',edits),/access denied/);
 apply(owner,'request_memo_edit',edits);
 assert.deepEqual(state.applications[0].memos[0],original);
 assert.throws(()=>apply(owner,'acknowledge',{memoVersion:1,memoHash:original.hash}),/Resolve/);
 const {prepareConsent,prepareExecution}=await import('./chain.mjs');
 const session={identity:owner.id,wallet};
 await assert.rejects(()=>prepareConsent(state.applications[0],session,'research',{}),/Resolve/);
 await assert.rejects(()=>prepareExecution(state.applications[0],partner,{wallet},'research',{}, {kind:'issue'}),/Resolve/);
 const editId=state.applications[0].memoEdits[0].id;
 assert.throws(()=>apply({...partner,id:owner.id},'review_memo_edit',{editId,decision:'approve',reason:'Self'}),/own proposal/);
 assert.throws(()=>apply({...partner,issue:false},'review_memo_edit',{editId,decision:'approve',reason:'Jr'}),/Partner/);
 apply(partner,'review_memo_edit',{editId,decision:'approve',reason:'Accepted reduced commitment'});
 const app=state.applications[0],memo=app.memos.at(-1);
 assert.equal(app.wallet,wallet);assert.equal(memo.wallet,wallet);assert.equal(memo.version,2);assert.equal(app.memos[0].status,'superseded');assert.equal(app.memos[0].hash,original.hash);
 assert.equal(memo.scope,'Revised scope');assert.equal(memo.allocationWeight.label,'1/3');assert.equal(memo.allocationWeight.approvedBy,partner.id);assert.equal(memo.consent,undefined);assert.equal(memo.acknowledgedAt,undefined);assert.notEqual(memo.hash,original.hash);
 assert.equal(app.memoEdits[0].reviewedBy,partner.id);assert.equal(app.memoEdits[0].state,'approved');assert.equal(app.memoEdits[0].acceptedVersion,2);
 assert.throws(()=>apply(owner,'acknowledge',{memoVersion:1,memoHash:original.hash}),/current memorandum/);
 await assert.rejects(()=>prepareExecution(app,partner,{wallet},'research',{}, {kind:'issue'}),/must sign/);
 apply(owner,'acknowledge',{memoVersion:2,memoHash:memo.hash});assert.equal(state.applications[0].memos.at(-1).acknowledgedBy,owner.id);
});

test('declining edits preserves draft and stale or signed edits cannot replace it',()=>{
 const core=contributorService();let s=core.submitInterest(emptyState(),applicant,'research',interest);const id=s.applications[0].id;
 const act=(actor,action,extra={})=>{s=core.transition(s,actor,id,{action,expectedVersion:s.applications[0].version,...extra});};
 act(partner,'start_review',{reason:'Review'});act(partner,'approve',{reason:'Approved'});
 const terms={level:'Full Time',rank:'Contributor',scope:'Scope',start:new Date().toISOString().slice(0,10),end:null};act(partner,'draft_memo',terms);
 let m=s.applications[0].memos.at(-1);const request={...terms,memoVersion:m.version,memoHash:m.hash,reason:'Please change',scope:'Changed'};
 act(applicant,'request_memo_edit',request);const edit=s.applications[0].memoEdits[0];
 assert.throws(()=>act(applicant,'request_memo_edit',request),/already awaiting/);
 act(partner,'review_memo_edit',{editId:edit.id,decision:'reject',reason:'Keep original scope'});assert.equal(s.applications[0].memos.length,1);assert.equal(s.applications[0].memos[0].hash,m.hash);
 assert.throws(()=>core.transition(s,applicant,id,{action:'request_memo_edit',expectedVersion:1,...request}),/record changed/);
 s.applications[0].memos[0].consent={typedData:{message:{deadline:1}}};
 assert.throws(()=>act(applicant,'request_memo_edit',request),/already signed/);
 assert.throws(()=>act(partner,'draft_memo',terms),/expire and be verified/);
 assert.throws(()=>act(partner,'draft_memo',{...terms,expiredConsentVerified:true}),/expire and be verified/);
});

test('expired draft revision requires finalized expiry and unused original-contract consent',async()=>{
 const {verifyExpiredMemoConsent}=await import('./chain.mjs');const {ROOT_AUTHORITY}=await import('../../shared/contributor-chain.mjs');
 const contract='0x'+'2'.repeat(40),app={wallet:'0x'+'1'.repeat(40),memos:[{status:'draft',consent:{typedData:{domain:{verifyingContract:contract},message:{deadline:100,nonce:'0'}}}}]};
 let timestamp=100n,nonce=0n;const ctx={client:{getBlock:async({blockTag})=>{assert.equal(blockTag,'finalized');return {number:25n,timestamp};},readContract:async({address,blockNumber,functionName})=>{assert.equal(address,contract);assert.equal(blockNumber,25n);return functionName==='rootAuthority'?ROOT_AUTHORITY:nonce;}}};
 await assert.rejects(()=>verifyExpiredMemoConsent(app,ctx),/remains valid/);timestamp=101n;assert.equal(await verifyExpiredMemoConsent(app,ctx),true);nonce=1n;await assert.rejects(()=>verifyExpiredMemoConsent(app,ctx),/already have been issued/);
});

test('approved level proposals use current memo policy and preserve individually agreed weights',async()=>{
 const core=contributorService(),today=new Date().toISOString().slice(0,10);let s=core.submitInterest(emptyState(),applicant,'research',interest);const id=s.applications[0].id;
 const act=(a,action,extra={})=>{s=core.transition(s,a,id,{action,expectedVersion:s.applications[0].version,...extra});};
 act(partner,'start_review',{reason:'Review'});act(partner,'approve',{reason:'Accept'});act(partner,'draft_memo',{level:'Full Time',rank:'Contributor',scope:'Research',start:today,end:null,historicalServiceStart:'2020-03-27',allocationWeight:'1/3',allocationReason:'Agreed workload'});
 s.applications[0].memos[0].status='issued';s.applications[0].credential={memoVersion:1,standing:'active',revision:1,level:'Full Time',rank:'Contributor'};
 const junior={...applicant,id:'junior',review:['research'],proposeStatus:['research']};act(junior,'propose_change',{kind:'terms',level:'Half Time',rank:'Senior contributor',reason:'New scope'});act(partner,'review_proposal',{proposalId:s.applications[0].proposals[0].id,decision:'approve',reason:'Approved'});
 const memo=s.applications[0].memos.at(-1);assert.equal(memo.policyVersion,'contributor-policy-v4-btree-beneficiary');assert.equal(memo.historicalServiceStart,'2020-03-27');assert.equal(memo.allocationWeight.label,'1/3');assert.equal(memo.consent,undefined);
 const {termsFor}=await import('./chain.mjs');assert.equal(termsFor(s.applications[0],memo,'research').weightDenominator,3);
});


test('reviewer import preserves applicant ownership, source, audit actor and duplicate safety',()=>{
 const core=contributorService(),wallet='0x'+'8'.repeat(40),owner={...applicant,id:'wallet:source-owner',wallet};
 const input={application:{...interest,wallet},source:{uid:'0x'+'7'.repeat(64),attester:wallet,chainId:8453}};
 assert.throws(()=>core.importBaseForReview(emptyState(),applicant,owner,'research',input),/reviewer permission/);
 const s=core.importBaseForReview(emptyState(),partner,owner,'research',input),app=s.applications[0];
 assert.equal(app.identity,owner.id);assert.equal(app.wallet,wallet);assert.equal(app.state,'submitted');assert.equal(app.emailVerified,false);assert.equal(app.credential,null);assert.ok(s.audit.every(e=>e.actor===partner.id));
 assert.equal(core.view(s,owner,'research').applications.length,1);assert.equal(core.view(s,{...applicant,id:'other'},'research').applications.length,0);
 assert.equal(core.importBaseForReview(s,partner,owner,'research',input).applications.length,1);
 assert.throws(()=>core.transition(s,partner,app.id,{action:'acknowledge',expectedVersion:app.version}),/Only the applicant/);
});

test('applicant cannot request reviewer import or spoof reviewer authority',async()=>{
 const mem=memory();let sent,read=false;const env={CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret,RESEND_API_KEY:'test',CONTRIBUTOR_EMAIL_FROM:'test@example.invalid'};
 const handler=createContributorHandler('gov',{env,command:mem.command,verifyWallet:async({signature})=>signature==='valid',actorFor:async s=>({...applicant,id:s.identity,authorityExpiresAt:Date.now()+10000}),baseReader:async()=>{read=true;throw Error('must not read');}});
 let res=response();await handler(req({action:'wallet_login_start',address:'0x'+'1'.repeat(40)}),res);const challenge=res.body.challenge,binding=res.headers['Set-Cookie'].split(';')[0];res=response();await handler(req({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:binding}),res);const cookie=res.headers['Set-Cookie'][0].split(';')[0];res=response();await handler({...req({}, {cookie}),method:'GET'},res);const csrf=res.body.session.csrf;
 res=response();await handler(req({action:'import_base_review',reviewer:true,wallet:'0x'+'1'.repeat(40)},{cookie,'x-contributor-csrf':csrf}),res);assert.equal(res.code,403);assert.equal(read,false);
});

test('HTTP reviewer imports Base application into the original applicant wallet account',async()=>{
 const mem=memory(),reviewerWallet='0x'+'3'.repeat(40),ownerWallet='0x'+'4'.repeat(40),uid='0x'+'5'.repeat(64);
 const handler=createContributorHandler('gov',{env:{CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret},command:mem.command,verifyWallet:async()=>true,actorFor:async s=>({...s.wallet===reviewerWallet?partner:applicant,id:s.identity,wallet:s.wallet,authorityExpiresAt:Date.now()+10000}),baseReader:async(project,session,body,client,options)=>{assert.equal(options.reviewer,true);assert.equal(session.wallet,reviewerWallet);return {application:{...interest,requestedRoles:[],wallet:ownerWallet},source:{uid,attester:ownerWallet,chainId:8453}};}});
 async function login(wallet){let r=response();await handler(req({action:'wallet_login_start',address:wallet}),r);const challenge=r.body.challenge,binding=r.headers['Set-Cookie'].split(';')[0];r=response();await handler(req({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:binding}),r);const cookie=r.headers['Set-Cookie'][0].split(';')[0];r=response();await handler({...req({}, {cookie}),method:'GET'},r);return {cookie,'x-contributor-csrf':r.body.session.csrf};}
 const reviewerHeaders=await login(reviewerWallet);let r=response();await handler(req({action:'import_base_review',uid,contentKey:'6'.repeat(64)},reviewerHeaders),r);assert.equal(r.code,200);assert.equal(r.body.applications[0].wallet,ownerWallet);assert.notEqual(r.body.applications[0].identity,r.body.persona.id);assert.equal(r.body.applications[0].state,'submitted');
 const ownerHeaders=await login(ownerWallet);r=response();await handler(req({action:'list'},ownerHeaders),r);assert.equal(r.code,200);assert.equal(r.body.applications.length,1);assert.equal(r.body.applications[0].identity,r.body.persona.id);assert.equal(r.body.applications[0].sourceAttestation.uid,uid);
});

test('wallet login restores only verified legacy identities and rejects ambiguous ownership',async()=>{
 const wallet='0x'+'1'.repeat(40);
 for(const mode of ['verified','unverified','ambiguous']){
 const mem=memory(),store=contributorStore(mem.command,codec,'gov');await store.mutate(s=>({...s,applications:[{identity:'legacy',wallet,walletVerification:mode==='unverified'?'not_connected':'verified'},...(mode==='ambiguous'?[{identity:'another',wallet,walletVerification:'verified'}]:[])]}));
 let identity;const handler=createContributorHandler('gov',{env:{CONTRIBUTORS_ENABLED:'1',CONTRIBUTOR_IDENTITY_SECRET:secret,CONTRIBUTOR_STORAGE_SECRET:secret},command:mem.command,verifyWallet:async({signature})=>signature==='valid',actorFor:async s=>{identity=s.identity;throw Object.assign(Error('test capture'),{status:418});}});
 let res=response();await handler(req({action:'wallet_login_start',address:wallet}),res);const challenge=res.body.challenge,binding=res.headers['Set-Cookie'].split(';')[0];res=response();await handler(req({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:binding}),res);
 if(mode==='ambiguous'){assert.equal(res.code,409);continue;}assert.equal(res.code,200);const cookie=res.headers['Set-Cookie'][0].split(';')[0];res=response();await handler({...req({}, {cookie}),method:'GET'},res);const csrf=res.body.session.csrf;res=response();await handler(req({action:'list'},{cookie,'x-contributor-csrf':csrf}),res);if(mode==='verified')assert.equal(identity,'legacy');else assert.match(identity,/^wallet:/);
 }
});
