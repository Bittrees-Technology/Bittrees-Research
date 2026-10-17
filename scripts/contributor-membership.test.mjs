import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyContributorMembership} from '../src/lib/contributorMembership.ts';
const wallet='0x'+'1'.repeat(40);
test('submission preflight uses only current membership and rejects unavailable or denied evidence',async()=>{
 for(const [status,result,allowed] of [[200,{access:true},true],[200,{access:false},false],[200,{},false],[403,{access:false},false],[503,{access:true},false]]){
  const fetcher=async(url,options)=>{assert.match(url,/0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335\/1\//i);assert.equal(options.cache,'no-store');return {status,ok:status===200,json:async()=>result};};
  if(allowed)await verifyContributorMembership(wallet,fetcher);else await assert.rejects(()=>verifyContributorMembership(wallet,fetcher));
 }
});
