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

import {readFileSync} from 'node:fs';
test('permission reporting matches the existing server administration rules',async()=>{
 const wallet='0x'+'a'.repeat(40),research=true;
 const role=research?'Executive':'Partner';
 const feed=await readFeed({env,fetcher:async()=>new Response(JSON.stringify({result:[JSON.stringify({[wallet]:[{label:role}]}),'[]']}))});
 assert.equal(feed.data.schemaVersion,2);assert.equal(feed.data.permissions[wallet].length,2);assert.equal(feed.data.permissionCoverage,'partial');assert.equal(feed.data.tags,null);
 const server=readFileSync(new URL('../api/community.js',import.meta.url),'utf8');
 assert.ok(server.includes(research?'const FULL_ROLE_RE = /^executive$/i;':'const FULL_ROLE_RE = /^(partner|junior partner|associate)$/i;'));
 assert.ok(server.includes('const SUPER_ADMIN = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f";'));
 assert.ok(server.includes(research?'!hasRole(roles, signer, /^assistant$/i)':'!hasRole(roles, signer, /^(moderator|mod)$/i)'));
});
