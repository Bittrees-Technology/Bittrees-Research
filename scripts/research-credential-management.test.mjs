import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData} from 'viem';
import {credentialCall,credentialManagementAbi,RESEARCHER_TYPE,CREDENTIALS,AUTHORITIES,safeCredentialBatch,prepareCredential} from '../src/lib/researchCredentialManagement.ts';
const member='0x1111111111111111111111111111111111111111';
const input={kind:'issue',member,parentId:'7',metadataURI:'https://research.bittrees.org/credentials/researcher',validUntil:''};
test('issuance encodes only the approved Researcher type and selected parent',()=>{
 const call=credentialCall(input);const decoded=decodeFunctionData({abi:credentialManagementAbi,data:call.data});
 assert.equal(decoded.functionName,'issueCredential');assert.deepEqual(decoded.args,[member,7n,RESEARCHER_TYPE,input.metadataURI,0n]);
});
test('issuance rejects malformed wallet, token ID, private URL and invalid expiry',()=>{
 for(const patch of [{member:'not-a-wallet'},{parentId:'0'},{parentId:'-1'},{parentId:'1.5'},{parentId:String(2n**256n)},{metadataURI:'javascript:alert(1)'},{metadataURI:'https://user:pass@example.org'},{metadataURI:'https://example.org/'+ 'x'.repeat(2048)},{validUntil:'invalid'},{validUntil:'2000-01-01'}])assert.throws(()=>credentialCall({...input,...patch}));
});
test('credential expiry is encoded explicitly without changing membership term',()=>{
 const expiry='2030-01-01T12:00:00Z';const decoded=decodeFunctionData({abi:credentialManagementAbi,data:credentialCall({...input,validUntil:expiry}).data});assert.equal(decoded.args[4],BigInt(Date.parse(expiry)/1000));
});
test('revocation and restoration target the same credential without independent grants',()=>{
 for(const kind of ['revoke','restore']){const call=credentialCall({kind,member,credentialId:'9'});const decoded=decodeFunctionData({abi:credentialManagementAbi,data:call.data});assert.equal(decoded.functionName,'setCredentialRevoked');assert.deepEqual(decoded.args,[9n,kind==='revoke']);}
});
test('Safe batch pins Ethereum, zero ETH, exact registry and selected Safe',()=>{
 const data=credentialCall(input).data;const batch=safeCredentialBatch({to:CREDENTIALS,data,value:'0',operation:0,authority:AUTHORITIES[0],summary:'Researcher credential',checkedAt:123,blockNumber:'1'});
 assert.equal(batch.chainId,'1');assert.equal(batch.meta.createdFromSafeAddress,AUTHORITIES[0]);assert.deepEqual(batch.transactions,[{to:CREDENTIALS,value:'0',data}]);
});
test('preparation rejects an unauthorized authority before any chain or wallet action',async()=>{
 await assert.rejects(prepareCredential({},input,member),/authorized Research Safe/);
});
test('wrong chain or unavailable chain cannot produce a transaction plan',async()=>{
 await assert.rejects(prepareCredential({getChainId:async()=>8453},input,AUTHORITIES[0]),/verification unavailable/);
 await assert.rejects(prepareCredential({getChainId:async()=>{throw Error('unavailable');}},input,AUTHORITIES[0]));
});
