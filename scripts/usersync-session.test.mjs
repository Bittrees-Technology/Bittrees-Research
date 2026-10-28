import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {xchacha20poly1305} from '@noble/ciphers/chacha.js';
import {sha256} from '@noble/hashes/sha2.js';
import {utf8ToBytes,hexToBytes,bytesToHex} from '@noble/hashes/utils.js';
import {createUserSyncHandler} from '../server/usersync/session.mjs';
import {createSyncVault} from '../src/lib/sync-vault.mjs';
const account=privateKeyToAccount('0x'+'1'.repeat(64)),other=privateKeyToAccount('0x'+'2'.repeat(64)),addr=account.address.toLowerCase();
const legacyMessage='Bittrees Messenger — sync key (v1)\n\nSign to sync and encrypt your saved messages and preferences across your devices. No gas; this only proves wallet ownership.';
const legacySignature=await account.signMessage({message:legacyMessage});
const data={savedMessages:[{id:'existing',text:'Encrypted fixture'}],prefs:{fixture:true},settings:{mute:false},blocked:[]};
const encrypt=(sig,value)=>{const nonce=new Uint8Array(24).fill(1);return bytesToHex(nonce)+':'+bytesToHex(xchacha20poly1305(sha256(utf8ToBytes(sig)),nonce).encrypt(utf8ToBytes(JSON.stringify(value))));};
const decrypt=(sig,value)=>{const [nonce,body]=value.split(':');return JSON.parse(new TextDecoder().decode(xchacha20poly1305(sha256(utf8ToBytes(sig)),hexToBytes(nonce)).decrypt(hexToBytes(body))));};
function fixture(origin='https://gov.bittrees.org'){
 let clock=Date.now(),fail=false;const records=new Map(),jar=new Map(),posts=[],cookieHeaders=[];
 const command=async([verb,key,value,...args])=>{
  if(fail)throw Error('Unavailable');const old=records.get(key);if(old?.expires&&old.expires<=clock)records.delete(key);
  if(verb==='GET'||verb==='GETDEL'){const result=records.get(key)?.value||null;if(verb==='GETDEL')records.delete(key);return result;}
  if(verb==='SET'){if(args.includes('NX')&&records.has(key))return null;const ex=args.indexOf('EX');records.set(key,{value,expires:ex>=0?clock+Number(args[ex+1])*1000:null});return 'OK';}
  if(verb==='INCR'){const row=records.get(key);row.value=String(Number(row.value)+1);return Number(row.value);}
  if(verb==='DEL')return records.delete(key)?1:0;
  throw Error('Unexpected command');
 };
 const prefix=origin.includes('research')?'bittrees:research:usersync:':'bittrees:usersync:';
 const handler=createUserSyncHandler({origin,prefix,fallbackPrefix:origin.includes('research')?'bittrees:usersync:':null,command,now:()=>clock});
 async function request(body,headers={}){
  const h={},req={method:body?'POST':'GET',headers:{origin,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...headers},query:body?{}:{address:addr},body};
  const res={status(n){this.code=n;return this;},setHeader(k,v){h[k.toLowerCase()]=v;},json(data){this.data=data;return this;}};
  await handler(req,res);for(const c of (Array.isArray(h['set-cookie'])?h['set-cookie']:h['set-cookie']?[h['set-cookie']]:[])){cookieHeaders.push(c);const [pair]=c.split(';'),at=pair.indexOf('='),key=pair.slice(0,at),value=pair.slice(at+1);if(c.includes('Max-Age=0'))jar.delete(key);else jar.set(key,value);}
  return {status:res.code,data:res.data,headers:h};
 }
 async function fetcher(path,init){const body=init?.body?JSON.parse(init.body):null;if(body)posts.push(body);const r=await request(body);return {ok:r.status>=200&&r.status<300,status:r.status,json:async()=>r.data};}
 return {request,fetcher,records,jar,posts,cookieHeaders,prefix,origin,clock:()=>clock,advance(ms){clock+=ms;},fail(v){fail=v;},put(value,key=prefix+addr){records.set(key,{value:JSON.stringify(value),expires:null});}};
}
function vaultFixture(f,legacy=legacySignature){const stored=new Map(legacy?[['bittrees.sync.sig.'+addr,legacy]]:[]);let removed=0;const vault=createSyncVault({message:legacyMessage,validate:decrypt,fetcher:f.fetcher,origin:()=>f.origin,now:f.clock,storage:()=>({getItem:k=>stored.get(k)||null,removeItem:k=>{removed++;stored.delete(k);}})});return {vault,stored,get removed(){return removed;}};}
const sign=message=>account.signMessage({message});
for(const origin of ['https://gov.bittrees.org','https://research.bittrees.org']){
 test(origin+': legacy ciphertext decrypts unchanged; reusable proof leaves storage only after fresh scoped authorization',async()=>{
  const f=fixture(origin),blob=encrypt(legacySignature,data);f.put({blob,updatedAt:10});const v=vaultFixture(f);
  assert.equal(v.vault.signature(addr),null,'never automatically use a saved signature');
  const result=await v.vault.connect(addr,sign);assert.deepEqual(result.remote,data);assert.equal(result.legacyCleared,true);assert.equal(v.removed,1);assert.equal(v.vault.signature(addr),legacySignature);
  assert.equal(f.records.get(f.prefix+addr).value,JSON.stringify({blob,updatedAt:10}),'connection does not rewrite encrypted content');
  assert(f.cookieHeaders.some(c=>c.includes('HttpOnly')&&c.includes('SameSite=Strict')&&c.includes('Secure')&&c.includes('Max-Age=3600')&&!c.includes('Domain=')));
  assert(!f.posts.some(p=>p.signature===legacySignature),'encryption proof is never sent as a write credential');
  await v.vault.write(addr,blob);assert.deepEqual(await v.vault.read(addr),data);
  await v.vault.disconnect(addr);assert.equal(v.vault.signature(addr),null);assert.equal((await f.request({address:addr,blob})).status,401);
 });
}
test('captured legacy signatures, anonymous writes, cross-site requests and another wallet do not authorize writes',async()=>{
 const f=fixture(),blob=encrypt(legacySignature,data);
 assert.equal((await f.request({address:addr,signature:legacySignature,blob})).status,401);
 assert.equal((await f.request({action:'challenge',address:addr},{origin:'https://evil.test'})).status,403);
 const c=(await f.request({action:'challenge',address:addr})).data;
 assert.equal((await f.request({action:'connect',address:addr,nonce:c.nonce,signature:await other.signMessage({message:c.message})})).status,403);
 assert(!f.records.has(f.prefix+addr));
});
test('challenges are browser-bound, single-use, scoped and expire; sessions expire without sliding renewal',async()=>{
 const f=fixture();let c=(await f.request({action:'challenge',address:addr})).data;const signed=await sign(c.message);
 const saved=new Map(f.jar);f.jar.clear();assert.equal((await f.request({action:'connect',address:addr,nonce:c.nonce,signature:signed})).status,401);for(const [k,v]of saved)f.jar.set(k,v);
 const body={action:'connect',address:addr,nonce:c.nonce,signature:signed};const responses=await Promise.all([f.request(body),f.request(body)]);assert.equal(responses.filter(r=>r.status===200).length,1);
 const blob=encrypt(legacySignature,data);f.advance(3599000);assert.equal((await f.request({address:addr,blob})).status,200);f.advance(2000);assert.equal((await f.request({address:addr,blob})).status,401);
 c=(await f.request({action:'challenge',address:addr})).data;f.advance(300001);assert.equal((await f.request({action:'connect',address:addr,nonce:c.nonce,signature:await sign(c.message)})).status,401);
});
test('failed decryption, a different wallet key and unavailable storage preserve the legacy credential and all ciphertext',async()=>{
 for(const mode of ['decryption','different-key','storage']){
  const f=fixture(),blob=mode==='decryption'?encrypt('unrecoverable-with-this-wallet',data):encrypt(legacySignature,data);f.put({blob,updatedAt:10});const v=vaultFixture(f);if(mode==='storage')f.fail(true);
  await assert.rejects(()=>v.vault.connect(addr,mode==='different-key'?()=>other.signMessage({message:legacyMessage}):sign));
  assert.equal(v.removed,0);assert(v.stored.has('bittrees.sync.sig.'+addr));assert.equal(v.vault.signature(addr),null);assert.equal(f.records.get(f.prefix+addr).value,JSON.stringify({blob,updatedAt:10}));
 }
});
test('new tabs start locked, one-hour memory proof expires, and rejected wallet confirmation preserves legacy storage',async()=>{
 const f=fixture();f.put({blob:encrypt(legacySignature,data),updatedAt:10});const v=vaultFixture(f);let calls=0;
 await assert.rejects(()=>v.vault.connect(addr,async msg=>{if(++calls===2)throw Error('User declined');return sign(msg);}));assert.equal(v.removed,0);assert.equal(v.vault.signature(addr),null);
 await v.vault.connect(addr,sign);assert.equal(vaultFixture(f,null).vault.signature(addr),null);f.advance(3600001);assert.equal(v.vault.signature(addr),null);
});
test('Research retains read-only Gov ciphertext fallback and writes only its own namespace',async()=>{
 const f=fixture('https://research.bittrees.org'),blob=encrypt(legacySignature,data);f.put({blob,updatedAt:10},'bittrees:usersync:'+addr);const v=vaultFixture(f);assert.deepEqual((await v.vault.connect(addr,sign)).remote,data);await v.vault.write(addr,blob);assert.equal(JSON.parse(f.records.get('bittrees:usersync:'+addr).value).updatedAt,10);assert(f.records.has(f.prefix+addr));
});
test('challenge generation is bounded and sync data is never cached publicly',async()=>{
 const f=fixture();for(let i=0;i<10;i++)assert.equal((await f.request({action:'challenge',address:addr})).status,200);assert.equal((await f.request({action:'challenge',address:addr})).status,429);assert.match((await f.request()).headers['cache-control'],/private, no-store/);
});
