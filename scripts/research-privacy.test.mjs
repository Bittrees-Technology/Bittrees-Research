import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {verifyMessage} from 'viem';
import {actionMessage} from '../shared/signed-action.mjs';
import {withResearchRegistryPrivacy} from '../server/private-registry.mjs';
import {publishPost,assertResearchPostPublication,FORUM_COMMUNITY,PROPOSAL_COMMUNITY,CONTRIB_COMMUNITY} from '../src/lib/forum.ts';
import {fetchResearchRegistry} from '../src/lib/researchRegistryAccess.ts';

const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),origin='https://research.bittrees.org';
const secret='synthetic-only-research-privacy-'.repeat(3);
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const request=(headers={})=>({method:'GET',headers:{'x-research-wallet':wallet,...headers},url:'/api/rooms'});
const session=()=>({wallet,walletVerifiedAt:900,expiresAt:10000});
const proof=()=>({wallet,member:true,validUntil:6000});

for(const [label,readSession,eligibility,headers,status] of [
 ['anonymous',async()=>null,proof,{},401],
 ['expired session',async()=>({...session(),expiresAt:999}),proof,{},401],
 ['unverified session',async()=>({...session(),walletVerifiedAt:null}),proof,{},401],
 ['wallet/session mismatch',session,proof,{'x-research-wallet':other},403],
 ['missing wallet binding',session,proof,{'x-research-wallet':undefined},403],
 ['nonmember',session,()=>({...proof(),member:false}),{},403],
 ['stale membership',session,()=>({...proof(),validUntil:999}),{},503],
 ['wrong-wallet membership proof',session,()=>({...proof(),wallet:other}),{},503],
 ['foreign origin',session,proof,{origin:'https://evil.invalid'},403],
 ['verification unavailable',session,()=>{throw Error('unavailable');},{},503],
])for(const method of ['GET','POST'])test(`${label} ${method} cannot read or serialize the registry`,async()=>{
 let reads=0;
 const wrapped=withResearchRegistryPrivacy(async(req,res)=>{reads++;return res.status(200).json({secret:'SYNTHETIC PRIVATE CONTENT'});},{readSession,eligibility,now:()=>1000});
 const res=response();await wrapped({...request(headers),method,body:{address:wallet}},res);
 assert.equal(res.code,status);assert.equal(reads,0);assert.ok(!JSON.stringify(res.body).includes('SYNTHETIC PRIVATE CONTENT'));
 assert.equal(res.headers['cache-control'],'private, no-store');assert.equal(res.headers['vercel-cdn-cache-control'],'no-store');
});

test('unsupported methods reject before session or registry reads',async()=>{
 for(const method of ['OPTIONS','PUT','DELETE','HEAD']){
  const wrapped=withResearchRegistryPrivacy(()=>{throw Error('Must not enter registry');},{readSession:()=>{throw Error('Must not read session');}});
  const res=response();await wrapped({...request(),method},res);assert.equal(res.code,405);
 }
});

test('POST envelope signer must match the verified session and wallet header before registry reads',async()=>{
 let reads=0;
 const wrapped=withResearchRegistryPrivacy(()=>{reads++;},{readSession:session,eligibility:proof,now:()=>1000});
 for(const body of [{address:other},{address:undefined},'not JSON']){
  const res=response();await wrapped({...request(),method:'POST',body},res);assert.ok([400,403].includes(res.code));assert.equal(reads,0);
 }
});

test('real session reader rejects missing and invented cookies before registry access',async()=>{
 for(const cookie of [undefined,'__Host-bittrees-contributor=not-a-token','__Host-bittrees-contributor='+'a'.repeat(64)]){
  let registryReads=0,sessionReads=0;
  const wrapped=withResearchRegistryPrivacy(async()=>{registryReads++;},{env:{CONTRIBUTOR_STORAGE_SECRET:secret},command:async([op])=>{assert.equal(op,'GET');sessionReads++;return {result:null};},eligibility:()=>{throw Error('No unauthenticated membership reads');},now:()=>1000});
  const res=response();await wrapped(request({cookie}),res);assert.equal(res.code,401);assert.equal(registryReads,0);assert.ok(sessionReads<=1);
 }
});

test('fresh member response is private and cannot be serialized after membership expiry',async()=>{
 let now=1000;
 const wrapped=withResearchRegistryPrivacy(async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('access-control-allow-origin','*');
  if(req.headers.expire)now=6001;
  return res.status(200).json({secret:'SYNTHETIC PRIVATE CONTENT'});
 },{readSession:session,eligibility:proof,now:()=>now});
 let res=response();await wrapped(request(),res);assert.equal(res.code,200);assert.equal(res.body.secret,'SYNTHETIC PRIVATE CONTENT');assert.equal(res.headers['cache-control'],'private, no-store');assert.equal(res.headers['cdn-cache-control'],'no-store');assert.equal(res.headers['access-control-allow-origin'],undefined);
 res=response();await wrapped(request({expire:'yes'}),res);assert.equal(res.code,403);assert.ok(!JSON.stringify(res.body).includes('SYNTHETIC PRIVATE CONTENT'));
});

test('successful mutation returns only acknowledgement even if proof expires after the commit',async()=>{
 let now=1000;
 const wrapped=withResearchRegistryPrivacy(async(req,res)=>{now=6001;return res.status(200).json({ok:true,revision:1,flags:{note:{preview:'SYNTHETIC PRIVATE PREVIEW'}},proposals:['SYNTHETIC PRIVATE PROPOSAL']});},{readSession:session,eligibility:proof,now:()=>now});
 const res=response();await wrapped({...request(),method:'POST',body:{address:wallet}},res);
 assert.equal(res.code,200);assert.deepEqual(res.body,{ok:true,revision:1});
});

test('both production registry factories authorize before MGET; member fixture remains readable',async t=>{
 const priorUrl=process.env.KV_REST_API_URL,priorToken=process.env.KV_REST_API_TOKEN;
 process.env.KV_REST_API_URL='https://fixture.invalid';process.env.KV_REST_API_TOKEN='synthetic-only';
 t.after(()=>{if(priorUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=priorUrl;if(priorToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=priorToken;});
 const modules=await Promise.all([import('../api/community.js'),import('../api/rooms.js')]);
 t.mock.method(globalThis,'fetch',async()=>{throw Error('No live network in privacy tests');});
 const values={roles:{[wallet]:[{label:'SYNTHETIC PRIVATE ROLE'}]},roledefs:[],credentialdefs:[],flags:{note:{preview:'SYNTHETIC PRIVATE PREVIEW'}},enckeys:{},rooms:{lounge:'SYNTHETIC PRIVATE CHAT'},customrooms:[],roomicons:{},roomproposals:[{name:'SYNTHETIC PRIVATE PROPOSAL'}]};
 for(const module of modules){
  let mget=0;
  const command=async([op,...keys])=>{assert.equal(op,'MGET');mget++;return {result:keys.map(key=>key.endsWith(':revision')?'0':JSON.stringify(values[key.split(':').at(-1)]))};};
  let handler=module.createPrivateHandler({command,readSession:async()=>null,eligibility:proof,now:()=>1000});
  let res=response();await handler(request(),res);assert.equal(res.code,401);assert.equal(mget,0);
  handler=module.createPrivateHandler({command,readSession:session,eligibility:()=>({...proof(),member:false}),now:()=>1000});
  res=response();await handler(request(),res);assert.equal(res.code,403);assert.equal(mget,0);
  handler=module.createPrivateHandler({command,readSession:session,eligibility:proof,now:()=>1000});
  res=response();await handler(request(),res);assert.equal(res.code,200);assert.equal(mget,1);assert.match(JSON.stringify(res.body),/SYNTHETIC PRIVATE/);assert.equal(res.headers['cache-control'],'private, no-store');
 }
});

test('validly signed anonymous/nonmember mutations cannot reveal snapshots; member mutations retain replay protection',async t=>{
 const priorUrl=process.env.KV_REST_API_URL,priorToken=process.env.KV_REST_API_TOKEN;
 process.env.KV_REST_API_URL='https://fixture.invalid';process.env.KV_REST_API_TOKEN='synthetic-only';
 t.after(()=>{if(priorUrl===undefined)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=priorUrl;if(priorToken===undefined)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=priorToken;});
 t.mock.method(globalThis,'fetch',async()=>{throw Error('No live network in privacy tests');});
 const account=privateKeyToAccount('0x'+'1'.repeat(64)),signedWallet=account.address.toLowerCase();
 const values={roles:{},roledefs:[],credentialdefs:[],flags:{note:{by:[],mod:null,preview:'SYNTHETIC PRIVATE PREVIEW'}},enckeys:{},rooms:{},customrooms:[],roomicons:{},roomproposals:[{name:'SYNTHETIC PRIVATE PROPOSAL'}]};
 for(const [path,payload] of [['community',{unflag:{id:'absent'}}],['rooms',{proposal:{name:'Member proposal',blurb:'Private proposed room',gate:{kind:'ens',name:'member.eth'}}}]]){
  const module=await import(`../api/${path}.js`);
  const envelope={version:2,audience:origin,chainId:1,endpoint:`/api/${path}`,address:signedWallet,timestamp:Date.now(),nonce:'a'.repeat(64),expectedRevision:0,payload};
  const message=actionMessage(envelope),signature=await account.signMessage({message});
  assert.equal(await verifyMessage({address:account.address,message,signature}),true);
  const req={method:'POST',url:envelope.endpoint,headers:{origin,'content-type':'application/json','x-research-wallet':signedWallet},body:{...envelope,signature}};
  const currentSession=()=>({wallet:signedWallet,walletVerifiedAt:Date.now()-1000,expiresAt:Date.now()+60000});
  const currentProof=()=>({wallet:signedWallet,member:true,validUntil:Date.now()+5000});
  for(const [label,readSession,eligibility,expected] of [['anonymous',async()=>null,currentProof,401],['nonmember',currentSession,()=>({...currentProof(),member:false}),403]]){
   let reads=0;
   const handler=module.createPrivateHandler({command:async()=>{reads++;throw Error('Must not read registry');},readSession,eligibility,verify:verifyMessage});
   const res=response();await handler(req,res);assert.equal(res.code,expected,label);assert.equal(reads,0);assert.ok(!JSON.stringify(res.body).includes('SYNTHETIC PRIVATE'));
  }
  let reads=0,commits=0,used=false;
  const command=async([op,...keys])=>{
   if(op==='MGET'){reads++;return {result:keys.map(key=>key.endsWith(':revision')?'0':JSON.stringify(values[key.split(':').at(-1)]))};}
   assert.equal(op,'EVAL');commits++;if(used)return {result:-2};used=true;return {result:1};
  };
  const handler=module.createPrivateHandler({command,readSession:currentSession,eligibility:currentProof,verify:verifyMessage,authority:async()=>({configured:true,allowed:true,expiresAt:new Date(Date.now()+60000).toISOString()})});
  let res=response();await handler(req,res);assert.equal(res.code,200,path);assert.deepEqual(res.body,{ok:true,revision:1});assert.equal(reads,1);assert.equal(commits,1);
  res=response();await handler(req,res);assert.equal(res.code,409);assert.match(res.body.error,/already used/);assert.ok(!JSON.stringify(res.body).includes('SYNTHETIC PRIVATE'));
 }
});

test('client binds private reads to the current wallet and never returns a public empty fallback',async t=>{
 let options;
 t.mock.method(globalThis,'fetch',async(_,input)=>{options=input;return new Response(JSON.stringify({error:'Verify wallet'}),{status:401});});
 await assert.rejects(fetchResearchRegistry('/api/community',wallet),/Verify wallet/);
 assert.equal(options.headers['x-research-wallet'],wallet);assert.equal(options.cache,'no-store');
});

test('new forum and proposal publication stops before schema, RPC or wallet calls',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Must not fetch');});
 const walletClient=new Proxy({},{get(){calls++;throw Error('Must not open wallet');}});
 for(const community of [undefined,FORUM_COMMUNITY,PROPOSAL_COMMUNITY,'unknown-public-surface']){
  await assert.rejects(publishPost({walletClient,account:wallet,title:'Private discussion',body:'Private unpublished research',community}),/plaintext to a public blockchain/);
 }
 assert.equal(calls,0);
});

test('only the existing encryption envelope format passes the contributor exception',()=>{
 const encrypted={v:1,alg:'x25519-xchacha20poly1305',nonce:'a'.repeat(48),ciphertext:'b'.repeat(64),recipients:[{addr:wallet,epk:'c'.repeat(64),n:'d'.repeat(48),k:'e'.repeat(96)}]};
 assert.doesNotThrow(()=>assertResearchPostPublication(CONTRIB_COMMUNITY,'Member role application',JSON.stringify(encrypted)));
 for(const body of ['Private unpublished draft',JSON.stringify({title:'Secret'}),JSON.stringify({...encrypted,plaintext:'Secret'}),JSON.stringify({...encrypted,recipients:[]})])assert.throws(()=>assertResearchPostPublication(CONTRIB_COMMUNITY,'Member role application',body),/Encrypted contributor/);
 assert.throws(()=>assertResearchPostPublication(CONTRIB_COMMUNITY,'Secret draft title',JSON.stringify(encrypted)),/Encrypted contributor/);
});

test('app noindex covers every route while existing member and Paragraph readers remain unchanged',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<meta name="robots" content="noindex, nofollow"/);
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.ok(config.headers.some(rule=>rule.source==='/(.*)'&&rule.headers.some(h=>h.key==='X-Robots-Tag'&&h.value==='noindex, nofollow')));
 assert.ok(config.rewrites.some(rule=>rule.source==='/api/gate/(.*)'&&rule.destination==='/api/gate?p=$1'));
});
