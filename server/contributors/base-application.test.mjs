import test from 'node:test';import assert from 'node:assert/strict';
import {encodeAbiParameters,keccak256,encodePacked} from 'viem';
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {readBaseApplication} from './base-application.mjs';
const uid='0x'+'1'.repeat(64),wallet='0x'+'2'.repeat(40),zero='0x'+'0'.repeat(64),key=new Uint8Array(32).fill(4),nonce=new Uint8Array(24).fill(5);
function fixture({community='bittrees-contributors',recipients=[],...changes}={}){
 const application={name:'Applicant',email:'',specialty:'Engineering',wallet};const ciphertext=bytesToHex(xchacha20poly1305(key,nonce).encrypt(new TextEncoder().encode(JSON.stringify(application))));
 const a={uid,schema:keccak256(encodePacked(['string','address','bool'],['string community,string title,string body','0x'+'0'.repeat(40),true])),refUID:zero,attester:wallet,revocationTime:0n,expirationTime:0n,time:20n,data:encodeAbiParameters([{type:'string'},{type:'string'},{type:'string'}],[community,'Contributor application',JSON.stringify({v:1,alg:'x25519-xchacha20poly1305',nonce:bytesToHex(nonce),ciphertext,recipients})]),...changes};
 return {getChainId:async()=>8453,getBlock:async()=>({number:100n,timestamp:100n}),readContract:async args=>{assert.equal(args.blockNumber,100n);return a;}};
}
const session={wallet,walletVerifiedAt:1},input={uid,contentKey:bytesToHex(key)};
test('import recovers exact encrypted contents from finalized Base source',async()=>{const out=await readBaseApplication('gov',session,input,fixture());assert.equal(out.application.specialty,'Engineering');assert.equal(out.source.uid,uid);assert.equal(out.source.verifiedBlock,'100');assert.ok(!JSON.stringify(out).includes(input.contentKey));});
test('import rejects foreign wallets, wrong project/schema, revoked and unfinalized attestations',async()=>{for(const changes of [{attester:'0x'+'3'.repeat(40)},{community:'bittrees-research-contributors'},{schema:zero},{revocationTime:1n},{uid:zero},{expirationTime:99n},{refUID:uid}])await assert.rejects(()=>readBaseApplication('gov',session,input,fixture(changes)));await assert.rejects(()=>readBaseApplication('gov',session,{...input,contentKey:'0'.repeat(64)},fixture()),/decrypted/);await assert.rejects(()=>readBaseApplication('gov',{},input,fixture()),/Sign in/);});

test('reviewer import requires named encryption recipient and still verifies source/project',async()=>{
 const reviewer='0x'+'7'.repeat(40),rs={wallet:reviewer,walletVerifiedAt:1};
 await assert.rejects(()=>readBaseApplication('gov',rs,input,fixture(),{reviewer:true}),/decrypted/);
 const result=await readBaseApplication('gov',rs,input,fixture({recipients:[{addr:reviewer}]}),{reviewer:true});assert.equal(result.source.attester,wallet);assert.equal(result.application.wallet,wallet);
 await assert.rejects(()=>readBaseApplication('gov',rs,{...input,reviewer:true},fixture({recipients:[{addr:reviewer}]})),/from this wallet/);
 await assert.rejects(()=>readBaseApplication('gov',rs,input,fixture({recipients:[{addr:reviewer}],revocationTime:1n}),{reviewer:true}));
 await assert.rejects(()=>readBaseApplication('research',rs,input,fixture({recipients:[{addr:reviewer}]}),{reviewer:true}),/another project/);
});
