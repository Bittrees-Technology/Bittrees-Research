import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbiParameters} from 'viem';
import {credentialCall,credentialManagementAbi,RESEARCHER_TYPE,CREDENTIALS,AUTHORITIES,safeCredentialBatch,prepareCredential,credentialReceiptMatches} from '../src/lib/researchCredentialManagement.ts';
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

test('Safe success alone cannot confirm a credential operation',()=>{
 const plan={to:CREDENTIALS,data:credentialCall({kind:'revoke',member,credentialId:'9'}).data,authority:AUTHORITIES[0]};
 const event={address:CREDENTIALS,data:encodeAbiParameters(parseAbiParameters('bool'),[true]),topics:encodeEventTopics({abi:credentialManagementAbi,eventName:'CredentialRevocationUpdated',args:{credentialId:9n,administrator:AUTHORITIES[0]}})};
 assert.equal(credentialReceiptMatches(plan,{status:'success',logs:[]}),false);
 assert.equal(credentialReceiptMatches(plan,{status:'reverted',logs:[event]}),false);
 assert.equal(credentialReceiptMatches(plan,{status:'success',logs:[{...event,address:member}]}),false);
 assert.equal(credentialReceiptMatches(plan,{status:'success',logs:[event]}),true);
});
test('issuance confirmation binds the exact member, parent, type, metadata and Safe',()=>{
 const plan={to:CREDENTIALS,data:credentialCall(input).data,authority:AUTHORITIES[0]};
 const event={address:CREDENTIALS,data:encodeAbiParameters(parseAbiParameters('bytes32,string,uint64,address'),[RESEARCHER_TYPE,input.metadataURI,0n,AUTHORITIES[0]]),topics:encodeEventTopics({abi:credentialManagementAbi,eventName:'CredentialIssued',args:{credentialId:10n,member,membershipTokenId:7n}})};
 assert.equal(credentialReceiptMatches(plan,{status:'success',logs:[event]}),true);
 assert.equal(credentialReceiptMatches({...plan,data:credentialCall({...input,parentId:'8'}).data},{status:'success',logs:[event]}),false);
 assert.equal(credentialReceiptMatches({...plan,authority:AUTHORITIES[1]},{status:'success',logs:[event]}),false);
});

test('custom types are encoded explicitly without implying a Roles mapping',()=>{
 const type='0x'+'12'.repeat(32);const decoded=decodeFunctionData({abi:credentialManagementAbi,data:credentialCall({...input,credentialType:type}).data});assert.equal(decoded.args[2],type);
 for(const type of ['role.admin','0x'+'00'.repeat(32)])assert.throws(()=>credentialCall({...input,credentialType:type}));
});

test('five application roles have distinct matching credential types and metadata',async()=>{
 const {BUILTIN_ROLE_CREDENTIALS,RESEARCH_ROLE_NAMES}=await import('../shared/research-role-credentials.mjs');
 const {RESEARCH_ROLES,normalizeInterest}=await import('../server/contributors/interest.mjs');
 const {readFile}=await import('node:fs/promises');
 assert.deepEqual(RESEARCH_ROLE_NAMES,['Researcher','Contributor','Assistant','Steward','Executive']);assert.deepEqual(RESEARCH_ROLES,RESEARCH_ROLE_NAMES);
 assert.equal(new Set(BUILTIN_ROLE_CREDENTIALS.map(d=>d.credentialType)).size,5);
 for(const d of BUILTIN_ROLE_CREDENTIALS){
  const metadata=JSON.parse(await readFile(new URL('../public/credentials/'+d.label.toLowerCase()+'.json',import.meta.url)));
  assert.equal(metadata.attributes[0].value,d.identifier);
  const call=decodeFunctionData({abi:credentialManagementAbi,data:credentialCall({...input,credentialType:d.credentialType,metadataURI:d.metadataURI}).data});assert.equal(call.args[2],d.credentialType);
 }
 const app=normalizeInterest({name:'Test',email:'test@example.org',expertise:['Research'],requestedRoles:['Executive'],specialty:'Governance',region:['EMEA'],heardFrom:'Website'},'research',{wallet:null});assert.deepEqual(app.requestedRoles,['Executive']);assert.equal(app.credential,undefined);
});
