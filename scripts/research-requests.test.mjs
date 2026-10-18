import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {transition,emptyState} from '../server/research-requests/core.mjs';
import {requestStore} from '../server/research-requests/store.mjs';
import {privateCodec,compareAndSet} from '../server/contributors/storage.mjs';
import {consume} from '../server/contributors/auth.mjs';
import {createResearchRequestHandler} from '../server/research-requests/handler.mjs';
import {requestEligibility} from '../server/research-requests/authority.mjs';
import {chainFixture,evidence,wallet} from '../tests/fixtures/research-native.mjs';
const owner={wallet,member:true,researcher:false},worker={wallet:'0x'+'2'.repeat(40),member:true,researcher:true},stranger={wallet:'0x'+'3'.repeat(40),member:true,researcher:true};
const input=(action,extra={})=>({action,commandId:randomUUID(),...extra});
const brief={title:'Compare storage options',brief:'Assess costs and resilience with sources.',deliverable:'A cited comparison',targetDate:'2026-12-01'};
const create=()=>transition(emptyState(),owner,input('create',brief));
const change=(state,actor,action,extra={})=>transition(state,actor,input(action,{id:state.requests[0].id,expectedVersion:state.requests[0].version,...extra}));
test('member request → researcher acceptance → revisions → requester completion preserves history',()=>{
 let s=create();s=change(s,worker,'accept');s=change(s,worker,'submit',{summary:'Findings v1',url:'https://example.org/report'});s=change(s,owner,'revise',{note:'Include resilience evidence'});s=change(s,worker,'submit',{summary:'Findings v2',url:''});s=change(s,owner,'complete');
 assert.equal(s.requests[0].status,'completed');assert.equal(s.requests[0].history.length,6);assert.equal(s.requests[0].history[2].submission.summary,'Findings v1');assert.throws(()=>change(s,owner,'revise',{note:'Again'}),/No submission/);
});
test('no membership, no credential, self-assignment, foreign submissions and requester impersonation fail',()=>{
 const s=create();assert.throws(()=>transition(emptyState(),{...owner,member:false},input('create',brief)),/active Research/);
 assert.throws(()=>change(s,{...worker,researcher:false},'accept'),/Researcher/);assert.throws(()=>change(s,{...owner,researcher:true},'accept'),/Another researcher/);
 const accepted=change(s,worker,'accept');assert.throws(()=>change(accepted,stranger,'submit',{summary:'Forged'}),/assigned researcher/);assert.throws(()=>change(accepted,{...worker,researcher:false},'submit',{summary:'Revoked'}),/Researcher/);
 assert.throws(()=>change(accepted,stranger,'cancel',{note:'No'}),/requester/);assert.throws(()=>change(accepted,owner,'complete'),/submitted/);
});
test('release works after Researcher credential loss and cancellation records reason',()=>{
 let s=change(create(),worker,'accept');s=change(s,{...worker,researcher:false},'release',{note:'No longer available'});assert.equal(s.requests[0].assignee,null);assert.equal(s.requests[0].status,'open');s=change(s,owner,'cancel',{note:'Scope changed'});assert.equal(s.requests[0].status,'cancelled');assert.throws(()=>change(s,worker,'accept'),/no longer open/);
});
test('stale versions, duplicate commands, invalid dates and unsafe links never commit',()=>{
 const c=input('create',brief),s=transition(emptyState(),owner,c);assert.throws(()=>transition(s,owner,c),/already saved/);
 assert.throws(()=>change(s,worker,'accept',{expectedVersion:0}),/changed/);assert.throws(()=>transition(emptyState(),owner,input('create',{...brief,targetDate:'2026-02-30'})),/date/);
 const accepted=change(s,worker,'accept');for(const url of ['javascript:alert(1)','https://user:secret@example.org','data:text/html,no'])assert.throws(()=>change(accepted,worker,'submit',{summary:'Results',url}),/link/);
});
const secret='research-workflow-test-only-'.repeat(4),codec=privateCodec(secret);
function memory(){const values=new Map();return {values,async command([op,...args]){if(op==='GET')return {result:values.get(args[0])||null};if(op==='SET'){values.set(args[0],args[1]);return {result:'OK'};}if(op==='DEL'){values.delete(args[0]);return {result:1};}if(op==='EVAL'){const [script,,key,...a]=args;if(script===consume){if(values.get(key)!==a[0])return {result:0};values.delete(key);return {result:1};}if(script===compareAndSet){if((values.get(key)||'')!==a[0])return {result:0};values.set(key,a[1]);return {result:1};}const n=Number(values.get(key)||0)+1;values.set(key,n);return {result:n};}throw Error(op);}};}
test('atomic encrypted storage allows exactly one concurrent acceptance',async()=>{
 const mem=memory(),store=requestStore(mem.command,codec);await store.mutate(()=>create());
 const results=await Promise.allSettled([store.mutate(s=>change(s,worker,'accept')),store.mutate(s=>change(s,stranger,'accept'))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read()).requests[0].version,2);assert(!JSON.stringify([...mem.values.values()]).includes(brief.title));
});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
test('HTTP session, CSRF, wallet binding and fresh chain authorization protect reads and writes',async()=>{
 const mem=memory();let member=true,researcher=false;const handler=createResearchRequestHandler({env:{CONTRIBUTOR_STORAGE_SECRET:secret,CONTRIBUTOR_IDENTITY_SECRET:secret},command:mem.command,verifyWallet:async({signature})=>signature==='valid',eligibility:async wallet=>({wallet,member,researcher,validUntil:Date.now()+5000,researcherUntil:researcher?Date.now()+5000:0})});
 const call=async(body,headers={},method='POST')=>{const r=response();await handler({method,body,headers:{origin:'https://research.bittrees.org','content-type':'application/json',...headers}},r);return r;};
 assert.equal((await call({action:'list'})).code,401);assert.equal((await call({action:'wallet_login_start',address:wallet},{origin:'https://evil.invalid'})).code,403);
 const start=await call({action:'wallet_login_start',address:wallet}),challenge=start.body.challenge;assert.match(start.body.message,/Research member sign-in/);
 const loginCookie=start.headers['Set-Cookie'].split(';')[0];assert.match(loginCookie,/research-work-login/);
 assert.equal((await call({action:'wallet_login_finish',challenge,signature:'bad'},{cookie:loginCookie})).code,403);
 const finish=await call({action:'wallet_login_finish',challenge,signature:'valid'},{cookie:loginCookie});assert.equal(finish.code,200);
 const cookie=finish.headers['Set-Cookie'][0].split(';')[0],session=(await call({}, {cookie},'GET')).body.session,headers={cookie,'x-research-csrf':session.csrf};
 assert.equal((await call({action:'list',wallet},{cookie})).code,403);assert.equal((await call({action:'list',wallet:worker.wallet},headers)).code,403);
 assert.equal((await call({action:'list',wallet},headers)).code,200);
 member=false;assert.equal((await call(input('create',{...brief,wallet}),headers)).code,403);member=true;
 const saved=await call(input('create',{...brief,wallet}),headers);assert.equal(saved.code,200);assert.equal(saved.body.requests.length,1);
 member=false;assert.equal((await call({action:'list',wallet},headers)).code,403);
});
test('exact Researcher type and current parent required; other roles cannot accept work',async()=>{
 for(const role of ['researcher','assistant','steward','executive']){
  const f=chainFixture(),read=f.client.readContract;f.client.readContract=args=>args.functionName==='lastTokenId'?Promise.resolve(1n):read(args);f.client.multicall=async()=>[true];
  const result=await requestEligibility(wallet,{...f,native:async()=>evidence(role)});assert.equal(result.member,true);assert.equal(result.researcher,role==='researcher');
 }
 const f=chainFixture(),read=f.client.readContract;f.client.readContract=args=>args.functionName==='lastTokenId'?Promise.resolve(1n):read(args);f.client.multicall=async()=>[false];assert.equal((await requestEligibility(wallet,{...f,native:async()=>evidence('researcher')})).member,false);
});
