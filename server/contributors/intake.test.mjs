import test from 'node:test';
import assert from 'node:assert/strict';
import {stageIntake,settleIntakes,intakeView,intakeVault} from './intake.mjs';
import {contributorService,emptyState} from './core.mjs';
import {privateCodec} from './storage.mjs';
const wallet='0x'+'1'.repeat(40),uid='0x'+'2'.repeat(64),key='3'.repeat(64);
const session={wallet,identity:'wallet:owner',walletVerifiedAt:1000};
const owner={id:session.identity,applicant:true,wallet,review:[]};
const source={uid,attester:wallet,kind:'base-eas',chainId:8453,dataHash:'0x'+'4'.repeat(64)};
const application={name:'Applicant',email:'',wallet,expertise:['Business'],specialty:'Lead project documentation',region:['EMEA'],languages:['English'],heardFrom:'Website'};
const input={uid,contentKey:key},verified={application,source},service=contributorService();
function memoryVault(){const values=new Map();const command=async([op,k,v,,expire])=>{if(op==='SET'){assert.equal(expire,86400);values.set(k,v);return {result:'OK'};}if(op==='GET')return {result:values.get(k)};if(op==='DEL')values.delete(k);};return {values,...intakeVault(command,privateCodec('vault-test-secret-'.repeat(4)),'gov')};}
test('new intake is encrypted at rest, hidden from views and not yet an application or grant',async()=>{
 const vault=memoryVault();
 let options;
 const state=await stageIntake(emptyState(),session,'gov',input,{vault,now:1000,read:async(_p,_s,_i,_c,o)=>{options=o;return verified;}});
 assert.equal(options.finality,'latest');assert.equal(state.applications.length,0);
 assert.equal(intakeView(state,owner,'gov')[0].status,'waiting_finality');
 assert.ok(!JSON.stringify(intakeView(state,owner,'gov')).includes(key));
 assert.ok(!JSON.stringify(service.view(state,{...owner,decide:[],changeStatus:[]},'gov')).includes(key));
 assert.deepEqual(intakeView(state,{...owner,id:'someone-else'},'gov'),[]);
 const codec=privateCodec('local-test-only-'.repeat(5)),encrypted=codec.seal(state);
 assert.ok(!encrypted.includes(key));assert.ok(!JSON.stringify(codec.open(encrypted)).includes(key));assert.equal(await vault.read(uid,wallet),key);assert.ok(!JSON.stringify([...vault.values.values()]).includes(key));
});
test('finality promotion retains provenance and ownership and consumes the per-document key',async()=>{
 const vault=memoryVault();
 let state=await stageIntake(emptyState(),session,'gov',input,{vault,now:1000,read:async()=>verified});
 let calls=0;
 state=await settleIntakes(state,owner,'gov',{vault,now:2000,service,read:async(_p,s,i)=>{calls++;assert.equal(s.wallet,wallet);assert.equal(i.contentKey,key);return verified;}});
 assert.equal(calls,1);assert.equal(state.pendingIntakes.length,0);assert.ok(!JSON.stringify(state).includes(key));
 const app=state.applications[0];assert.equal(app.identity,owner.id);assert.equal(app.state,'submitted');assert.equal(app.capabilityGrant,null);assert.equal(app.credential,null);assert.equal(app.sourceAttestation.uid,uid);
 const again=await stageIntake(state,session,'gov',input,{vault,read:async()=>verified});assert.equal(again.applications.length,1);
});
test('unfinalized, changed or unavailable source never produces a reviewable record; checks are bounded',async()=>{
 const vault=memoryVault();
 let state=await stageIntake(emptyState(),session,'gov',input,{vault,now:1000,read:async()=>verified});
 let reads=0;const read=async()=>{reads++;throw Error('Not finalized');};
 state=await settleIntakes(state,owner,'gov',{vault,now:2000,service,read});
 assert.equal(state.applications.length,0);assert.equal(state.pendingIntakes[0].status,'waiting_finality');
 state=await settleIntakes(state,owner,'gov',{vault,now:3000,service,read});assert.equal(reads,1);
 state=await settleIntakes(state,owner,'gov',{vault,now:63000,service,read:async()=>({...verified,source:{...source,dataHash:'changed'}})});assert.equal(state.applications.length,0);
});
test('an unrelated identity cannot process another applicant intake; an authorized reviewer can',async()=>{
 const vault=memoryVault();
 const state=await stageIntake(emptyState(),session,'gov',input,{vault,now:1000,read:async()=>verified});let reads=0;
 const read=async()=>{reads++;return verified;};
 const hidden=await settleIntakes(state,{...owner,id:'other'},'gov',{vault,now:2000,service,read});assert.equal(reads,0);assert.equal(hidden.applications.length,0);
 const imported=await settleIntakes(state,{...owner,id:'reviewer',review:['inc-ops-governance']},'gov',{vault,now:2000,service,read});assert.equal(reads,1);assert.equal(imported.applications[0].identity,owner.id);
});
test('expired intake discards its key and requests an unlock; ownership mismatches reject staging',async()=>{
 const vault=memoryVault();
 const state=await stageIntake(emptyState(),session,'gov',input,{vault,now:1000,read:async()=>verified});
 const expired=await settleIntakes(state,owner,'gov',{vault,now:1000+86400001,service,read:async()=>{throw Error('Must not read');}});
 assert.equal(expired.pendingIntakes[0].status,'unlock_needed');assert.ok(!JSON.stringify(expired).includes(key));
 await assert.rejects(()=>stageIntake(emptyState(),session,'gov',input,{vault,read:async()=>({...verified,source:{...source,attester:'0x'+'5'.repeat(40)}})}),/submitting wallet/);
});

test('failed older intakes do not starve newer submissions and invalid form data never stages a key',async()=>{
 const vault=memoryVault(),reviewer={...owner,id:'reviewer',review:['inc-ops-governance']};
 let state=emptyState();
 for(let i=0;i<4;i++){
  const w='0x'+String(i+1).repeat(40),u='0x'+String(i+1).repeat(64),s={identity:'wallet:'+i,wallet:w,walletVerifiedAt:1000};
  state=await stageIntake(state,s,'gov',{uid:u,contentKey:key},{vault,now:1000+i,read:async()=>({application:{...application,wallet:w},source:{...source,uid:u,attester:w}})});
 }
 let checked=[];
 state=await settleIntakes(state,reviewer,'gov',{vault,service,now:2000,read:async(_p,_s,input)=>{checked.push(input.uid);throw Error('Unavailable');}});assert.equal(checked.length,3);
 checked=[];await settleIntakes(state,reviewer,'gov',{vault,service,now:63000,read:async(_p,_s,input)=>{checked.push(input.uid);throw Error('Unavailable');}});assert.equal(checked[0],'0x'+'4'.repeat(64));
 await assert.rejects(()=>stageIntake(emptyState(),session,'gov',input,{vault,read:async()=>({...verified,application:{...application,specialty:''}})}),/contribution interests/);
});
