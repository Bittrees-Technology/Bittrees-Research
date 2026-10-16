import test from 'node:test';import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {workflowPlan} from './workflow-plan.mjs';
import {contributorWorkflows,createWorkflowHandler} from './workflow-feed.mjs';
import {contributorService} from './core.mjs';
import {makeFeedRequest} from '../../shared/workflow-feed.mjs';
const wallet='0x'+'1'.repeat(40);
function fixture(){return {revision:1,audit:[],applications:[{id:'app-test',lane:'inc-ops-governance',identity:'wallet:test',state:'approved',version:1,name:'Jonathan',wallet,walletVerification:'verified',directory:{title:'Founder and Steward',notes:'PRIVATE'},memos:[{version:1,hash:'signed-hash',scope:'Lead metaverse strategy and talent acquisition as steward',level:'Full Time',rank:'Lead contributor',consent:{signature:'PRIVATE'}}]}]};}
test('workflow suggestions need signed terms and fresh Partner approval; profile changes invalidate approval',()=>{
 const core=contributorService(),partner={id:'partner',review:['inc-ops-governance'],decide:['inc-ops-governance']};let state=fixture();const plan=workflowPlan(state.applications[0]);assert.equal(plan.status,'pending');assert.equal(plan.suggestions.length,4);
 const input={action:'review_workflow_plan',expectedVersion:1,fingerprint:plan.fingerprint,decision:'approved',reason:'Responsibilities reviewed'};
 assert.throws(()=>core.transition(state,{...partner,decide:[]},'app-test',input),/Partner approval/);
 assert.throws(()=>core.transition(state,partner,'app-test',{...input,fingerprint:'stale'}),/changed/);
 state=core.transition(state,partner,'app-test',input);assert.equal(workflowPlan(state.applications[0]).status,'approved');assert.equal(state.audit[0].actor,'partner');
 state.applications[0].directory.title='Revised title';assert.equal(workflowPlan(state.applications[0]).status,'pending');
 state.applications[0].memos[0].consent=null;assert.equal(workflowPlan(state.applications[0]),null);
});
test('source feed is private to verified wallet owners and never creates runnable assignments',()=>{
 const state=fixture();assert.equal(contributorWorkflows(state,['0x'+'2'.repeat(40)],'gov').length,0);
 const records=contributorWorkflows(state,[wallet],'gov');assert.equal(records.length,4);assert.ok(records.every(r=>r.status==='paused'&&r.visibility==='owner'));assert.ok(!JSON.stringify(records).includes('PRIVATE'));
 state.applications[0].walletVerification='unverified';assert.equal(contributorWorkflows(state,[wallet],'gov').length,0);
});
test('workflow feed rejects unsigned requests, wrong audiences and replay',async()=>{
 const hub=generateKeyPairSync('ed25519'),source=generateKeyPairSync('ed25519');let used=false;
 const env={CONTRIBUTORS_ENABLED:'1',WORKFLOW_SOURCE_REQUEST_PUBLIC_KEY:hub.publicKey.export({type:'spki',format:'pem'}),ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY:source.privateKey,CONTRIBUTOR_STORAGE_SECRET:'s'.repeat(48)};
 const command=async c=>c[0]==='GET'?{result:null}:{result:used?null:(used=true,'OK')};const handler=createWorkflowHandler('gov',{env,command,now:()=>100000});
 const response=()=>({setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}});
 const packet=makeFeedRequest('gov',[wallet],hub.privateKey,randomUUID(),100000);
 let r=response();await handler({method:'POST',body:{...packet,signature:'bad'}},r);assert.equal(r.code,401);
 r=response();await handler({method:'POST',body:packet},r);assert.equal(r.code,200);
 r=response();await handler({method:'POST',body:packet},r);assert.equal(r.code,409);
 r=response();await handler({method:'POST',body:makeFeedRequest('research',[wallet],hub.privateKey,randomUUID(),100000)},r);assert.equal(r.code,401);
});
