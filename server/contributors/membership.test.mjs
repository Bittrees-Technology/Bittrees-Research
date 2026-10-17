import test from 'node:test';
import assert from 'node:assert/strict';
import {requireApplicantMembership} from './membership.mjs';
import {MEMBERSHIP} from '../research-membership.mjs';
const wallet='0x'+'1'.repeat(40);
for(const state of ['active','expired','revoked','burned','blocked','legacy-only','unavailable','wrong-chain'])test(`Research admission checks contract membership: ${state}`,async()=>{
 let checked=false;
 const client={getChainId:async()=>state==='wrong-chain'?8453:1,getBlockNumber:async()=>10n,readContract:async({address,functionName})=>{assert.equal(address,MEMBERSHIP);if(state==='unavailable')throw Error('RPC outage');if(functionName==='blockedWallets')return state==='blocked';return state==='legacy-only'?0n:1n;},multicall:async({contracts,blockNumber})=>{checked=true;assert.equal(blockNumber,10n);assert.equal(contracts[0].functionName,'isActiveMember');assert.deepEqual(contracts[0].args,[wallet,1n]);return [state==='active'];}};
 if(state==='active'){await requireApplicantMembership(wallet,{client});assert.equal(checked,true);}else await assert.rejects(()=>requireApplicantMembership(wallet,{client}),e=>e.status===(['unavailable','wrong-chain'].includes(state)?503:403));
});
