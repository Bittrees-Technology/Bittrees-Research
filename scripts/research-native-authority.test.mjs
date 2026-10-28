import test from 'node:test';import assert from 'node:assert/strict';
import {readResearchCredentials} from '../server/research-native-authority.mjs';
import {nativeRoles} from '../shared/research-permissions.mjs';
import {authorityDecision} from '../server/authority-client.mjs';
import {contributorActor} from '../server/contributors/authority.mjs';
import {applicationReviewers} from '../server/application-reviewers.mjs';
import {chainFixture,evidence,wallet} from '../tests/fixtures/research-native.mjs';
test('native proof verifies both pinned deployments and finalized/current parent and credential',async()=>{
 const f=chainFixture(),proof=await readResearchCredentials(wallet,f);
 assert.equal(proof.status,'current');assert.deepEqual(nativeRoles(proof,wallet),['executive']);
 for(const fn of ['isActiveMember','isCredentialValid','rootAuthority'])for(const blockNumber of [f.latest,f.finalized])assert(f.reads.some(r=>r.fn===fn&&r.blockNumber===blockNumber));
});
for(const key of ['revoked','burned','invalid','expired','parentExpired','priorCredentialExpired','priorParentExpired','blocked','inactive','unfinalized','parentUnfinalized','wrongOwner','wrongParent','stale','reorg','badCode','badSlot'])test(`${key} never grants native authority`,async()=>{
 const proof=await readResearchCredentials(wallet,chainFixture({[key]:true}));assert.deepEqual(nativeRoles(proof,wallet),[]);
});
test('wrong chain and outage fail closed',async()=>{
 assert.equal((await readResearchCredentials(wallet,chainFixture({chain:8453}))).status,'unavailable');
 assert.equal((await readResearchCredentials(wallet,{client:{getBlock:async()=>{throw Error('outage')}}})).status,'unavailable');
});
test('server decisions intersect policy with native credentials and reject legacy',async()=>{
 const access=async()=>({enrolled:true,authoritative:true,expiresAt:Date.now()+30000,actions:['project.admin']});
 assert.equal((await authorityDecision(wallet,'rooms.manage',{access,native:async()=>evidence()})).allowed,true);
 assert.equal((await authorityDecision(wallet,'rooms.manage',{access,native:async()=>({...evidence(),credentials:[]})})).allowed,false);
 await assert.rejects(()=>authorityDecision(wallet,'rooms.manage',{access:async()=>({enrolled:false}),native:async()=>evidence()}));
});
test('Research contributor permissions and reviewer distribution require Executive AND reviewer policy',async()=>{
 const access=async()=>({enrolled:true,authoritative:true,expiresAt:Date.now()+30000,actions:['tier.partner'],reviewers:[wallet]});
 for(const role of ['assistant','steward','executive']){
  const native=async()=>evidence(role),actor=await contributorActor({identity:'test',wallet},'research',{access,native});
  assert.equal(actor.issue,role==='executive');assert.equal(actor.review.length>0,role==='executive');
  const routed=await applicationReviewers({[wallet]:'a'.repeat(64)},{access,native});assert.deepEqual(routed.reviewers,role==='executive'?[wallet]:[]);
 }
 const actor=await contributorActor({identity:'test',wallet},'research',{access:async()=>({...await access(),actions:['project.admin']}),native:async()=>evidence()});assert.equal(actor.issue,true);
});

test('native reads cannot outlive policy or authorize review from an expired decision',async()=>{
 const access=async()=>({enrolled:true,authoritative:true,expiresAt:Date.now()-1,actions:['tier.partner','project.admin']});
 await assert.rejects(()=>contributorActor({identity:'test',wallet},'research',{access,native:async()=>evidence()}),/expired/);
 await assert.rejects(()=>authorityDecision(wallet,'rooms.manage',{access,native:async()=>evidence()}),/unavailable/);
});

test('approved Research admin plus native Executive can decide Research applications without Governance tiers',async()=>{
 for(const action of ['project.admin','role.executive']){
  const access=async()=>({enrolled:true,authoritative:true,expiresAt:Date.now()+30000,actions:[action]});
  const actor=await contributorActor({identity:'test',wallet},'research',{access,native:async()=>evidence()});
  assert.deepEqual(actor.review,['research']);assert.deepEqual(actor.decide,['research']);assert.equal(actor.issue,true);assert.equal(actor.validate,false);assert.deepEqual(actor.changeStatus,[]);
  const {researchAccess}=await import('../server/authority-client.mjs');
  assert.equal((await researchAccess(wallet,{access,native:async()=>evidence()})).reviewer,true);
  for(const role of ['assistant','steward'])assert.deepEqual((await contributorActor({identity:'test',wallet},'research',{access,native:async()=>evidence(role)})).review,[]);
  assert.deepEqual((await contributorActor({identity:'test',wallet},'gov',{access,native:async()=>evidence()})).review,[]);
 }
 const actor=await contributorActor({identity:'test',wallet},'research',{access:async()=>({enrolled:true,authoritative:true,expiresAt:Date.now()+30000,actions:[]}),native:async()=>evidence()});assert.deepEqual(actor.review,[]);
});
