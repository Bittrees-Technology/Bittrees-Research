import {test} from 'node:test';import assert from 'node:assert/strict';
import {MEMBERSHIP,LEGACY,researchMembershipBalance} from '../server/research-membership.mjs';
const user='0x1111111111111111111111111111111111111111';
function fixture({blocked=false,active=true,expired=false,fail=false}={}){return {getBlockNumber:async()=>100n,readContract:async({functionName,blockNumber})=>{assert.equal(blockNumber,100n);if(fail)throw Error('RPC unavailable');return ({blockedWallets:blocked,isActiveMember:active,lastTokenId:1n,balanceOf:1n,isExpired:expired})[functionName];},multicall:async({contracts,blockNumber,allowFailure})=>{assert.equal(blockNumber,100n);assert.equal(allowFailure,false);return contracts.map(c=>c.functionName==='isActiveMember'?active:c.functionName==='balanceOf'?1n:expired);}};}
test('new membership uses active validity, not raw balance',async()=>{assert.equal(await researchMembershipBalance(fixture({active:false}),MEMBERSHIP,user,1n),0n);assert.equal(await researchMembershipBalance(fixture(),MEMBERSHIP,user,1n),1n);});
test('new wallet block denies both legacy and current memberships',async()=>{for(const token of [LEGACY,MEMBERSHIP])assert.equal(await researchMembershipBalance(fixture({blocked:true}),token,user,1n),0n);});
test('expired legacy passes do not grant access',async()=>{assert.equal(await researchMembershipBalance(fixture({expired:true}),LEGACY,user,1n),0n);});
test('legacy any-token room accepts valid new pass; not revoked/expired passes',async()=>{assert.equal(await researchMembershipBalance(fixture({expired:true}),LEGACY,user),1n);assert.equal(await researchMembershipBalance(fixture({active:false,expired:true}),LEGACY,user),0n);});
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
