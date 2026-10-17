import {test} from 'node:test';import assert from 'node:assert/strict';
import {MEMBERSHIP,LEGACY,researchMembershipBalance} from '../server/research-membership.mjs';
const user='0x1111111111111111111111111111111111111111';
function fixture({blocked=false,active=true,expired=false,fail=false}={}){return {getBlockNumber:async()=>100n,readContract:async({functionName,blockNumber})=>{assert.equal(blockNumber,100n);if(fail)throw Error('RPC unavailable');return ({blockedWallets:blocked,isActiveMember:active,lastTokenId:1n,balanceOf:1n,isExpired:expired})[functionName];},multicall:async({contracts,blockNumber,allowFailure})=>{assert.equal(blockNumber,100n);assert.equal(allowFailure,false);return contracts.map(c=>c.functionName==='isActiveMember'?active:c.functionName==='balanceOf'?1n:expired);}};}
test('new membership uses active validity, not raw balance',async()=>{assert.equal(await researchMembershipBalance(fixture({active:false}),MEMBERSHIP,user,1n),0n);assert.equal(await researchMembershipBalance(fixture(),MEMBERSHIP,user,1n),1n);});
test('new wallet block denies both legacy and current memberships',async()=>{for(const token of [LEGACY,MEMBERSHIP])assert.equal(await researchMembershipBalance(fixture({blocked:true}),token,user,1n),0n);});
test('expired legacy passes do not grant access',async()=>{assert.equal(await researchMembershipBalance(fixture({expired:true}),LEGACY,user,1n),0n);});
test('persisted legacy room URL uses only new active membership',async()=>{assert.equal(await researchMembershipBalance(fixture({expired:true}),LEGACY,user),1n);assert.equal(await researchMembershipBalance(fixture({active:false,expired:true}),LEGACY,user),0n);});
test('RPC errors never grant access',async()=>{await assert.rejects(researchMembershipBalance(fixture({fail:true}),MEMBERSHIP,user,1n));});

import {createGateHandler} from '../api/gate.js';
async function gate(balance,min='1') {
 let status,body,calls=0;const res={setHeader(){},status(v){status=v;return this;},json(v){body=v;return this;}};
 const handler=createGateHandler({membershipBalance:async(token,account)=>{calls++;assert.equal(token.toLowerCase(),MEMBERSHIP);assert.equal(account,user);if(balance instanceof Error)throw balance;return balance;}});
 await handler({query:{p:`token/erc1155/${MEMBERSHIP}/${min}/${user}/checkAccess`}},res);return {status,body,calls};
}
test('direct membership room path enforces active validity and a positive minimum',async()=>{
 assert.equal((await gate(1n)).status,200);assert.equal((await gate(0n)).status,403);assert.equal((await gate(0n,'0')).status,403);
});
test('direct membership room RPC failure is unavailable without provider details',async()=>{
 const result=await gate(Error('https://private-provider/api/secret'));assert.equal(result.status,503);assert.deepEqual(result.body,{error:'Membership verification unavailable'});
});

test("retired contract never reads chain, for any or explicit ID",async()=>{for(const id of [1n])assert.equal(await researchMembershipBalance({},LEGACY,user,id),0n);});
test('legacy URL gates deny wallets without current membership for every standard and minimum',async()=>{
 const handler=createGateHandler({membershipBalance:async()=>0n});
 for(const standard of ['erc1155','erc721','erc20'])for(const min of ['0','1'])for(const multi of [false,true]){
  let status;const res={setHeader(){},status(v){status=v;return this;},json(){return this;}};
  const encoded=Buffer.from(JSON.stringify({rules:[{kind:'token',standard,token:LEGACY,min}],combine:'all'})).toString('base64url');
  await handler({query:{p:multi?`multi/${encoded}/${user}/checkAccess`:`token/${standard}/${LEGACY}/${min}/${user}/checkAccess`}},res);
  assert.equal(status,403);
 }
});

test('saved legacy room URLs read only current contract, never legacy balances',async()=>{
 const client=fixture();const read=client.readContract;const multi=client.multicall;
 client.readContract=async args=>{assert.equal(args.address,MEMBERSHIP);return read(args);};
 client.multicall=async args=>{for(const c of args.contracts)assert.equal(c.address,MEMBERSHIP);return multi(args);};
 assert.equal(await researchMembershipBalance(client,LEGACY,user),1n);
 assert.equal(await researchMembershipBalance(fixture({active:false}),LEGACY,user),0n);
});

test('saved any-ID room routes admit current holders through direct and multi URLs',async()=>{
 for(const multi of [false,true]){
  let status;const res={setHeader(){},status(v){status=v;return this;},json(){return this;}};
  const handler=createGateHandler({membershipBalance:async(token,account,id)=>researchMembershipBalance(fixture(),token,account,id)});
  const encoded=Buffer.from(JSON.stringify({rules:[{kind:'token',standard:'erc1155',token:LEGACY,min:'1'}]})).toString('base64url');
  await handler({query:{p:multi?`multi/${encoded}/${user}/checkAccess`:`token/erc1155/${LEGACY}/1/${user}/checkAccess`}},res);
  assert.equal(status,200);
 }
});
