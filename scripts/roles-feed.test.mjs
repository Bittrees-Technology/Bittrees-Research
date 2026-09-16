import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
// The same adapter is shipped independently in Gov and Research; fixtures never contact storage.
import {readFeed} from '../api/roles-feed.js';
const keys=generateKeyPairSync('ed25519');
const env={KV_REST_API_URL:'https://storage.example',KV_REST_API_TOKEN:'fixture',ROLES_FEED_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'})};
test('feed signs exact source records and does not expose storage credentials',async()=>{
 const result=await readFeed({env,fetcher:async()=>new Response(JSON.stringify({result:[JSON.stringify({['0x'+'a'.repeat(40)]:[{label:'Partner'}]}),'[]']}))});
 assert.equal(verify(null,Buffer.from(JSON.stringify(result.data)),keys.publicKey,Buffer.from(result.signature,'base64')),true);
 assert.ok(!JSON.stringify(result).includes('fixture'));
});
test('storage failures are errors, never healthy empty role rosters',async()=>{
 for(const payload of [{error:'offline'},{result:'invalid'}]) await assert.rejects(()=>readFeed({env,fetcher:async()=>new Response(JSON.stringify(payload))}));
 await assert.rejects(()=>readFeed({env:{},fetcher:async()=>{throw Error('Must not fetch');}}));
});
