import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureResearchSignIn} from '../src/lib/researchSignIn.ts';
const wallet='0x'+'1'.repeat(40);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('reuse current wallet session without challenges or signatures',async t=>{
 let reads=0;t.mock.method(globalThis,'fetch',async()=>{reads++;return json({session:{wallet,csrf:'csrf',expiresAt:Date.now()+60000}});});
 await ensureResearchSignIn(wallet,()=>{throw Error('Must not sign');},()=>true);assert.equal(reads,1);
});
test('unavailable session check fails without requesting a new proof',async t=>{
 t.mock.method(globalThis,'fetch',async()=>json({error:'Unavailable'},503));
 await assert.rejects(ensureResearchSignIn(wallet,()=>{throw Error('Must not sign');},()=>true),/Unavailable/);
});
for(const kind of ['expired','different wallet','missing'])test(`${kind} session requires one fresh proof`,async t=>{
 const calls=[];let signatures=0;
 t.mock.method(globalThis,'fetch',async(_,options)=>{
  if(!options?.method)return json({session:kind==='missing'?null:{wallet:kind==='different wallet'?'0x'+'2'.repeat(40):wallet,expiresAt:kind==='expired'?Date.now()-1:Date.now()+60000}});
  const body=JSON.parse(options.body);calls.push(body.action);return json(body.action==='wallet_login_start'?{message:'proof',challenge:'nonce'}:{ok:true});
 });
 await ensureResearchSignIn(wallet,async message=>{assert.equal(message,'proof');signatures++;return 'signature';},()=>true);
 assert.equal(signatures,1);assert.deepEqual(calls,['wallet_login_start','wallet_login_finish']);
});
test('wallet switch while signing never finishes the old wallet session',async t=>{
 let current=true;const calls=[];
 t.mock.method(globalThis,'fetch',async(_,options)=>{
  if(!options?.method)return json({session:null});const body=JSON.parse(options.body);calls.push(body.action);return json({message:'proof',challenge:'nonce'});
 });
 await assert.rejects(ensureResearchSignIn(wallet,async()=>{current=false;return 'signature';},()=>current),/Wallet changed/);
 assert.deepEqual(calls,['wallet_login_start']);
});
