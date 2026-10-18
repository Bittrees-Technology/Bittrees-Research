import {createPublicClient,http,keccak256,toBytes,parseAbi} from 'viem';
import {mainnet} from 'viem/chains';
import deployment from '../src/lib/constants/research-deployment.json' with {type:'json'};
import membershipAbi from '../src/lib/constants/membership.abi.json' with {type:'json'};
import credentialsAbi from '../src/lib/constants/credentials.abi.json' with {type:'json'};
export {deployment};
export const RESEARCHER_TYPE=keccak256(toBytes('research.role.researcher.v1'));
// Exact chain/type mappings. Existing approved staff definitions gate these bounded capabilities.
export const CREDENTIAL_MAPPINGS=Object.freeze(Object.fromEntries([
 ['researcher',['role.researcher']],
 ['assistant',['community.moderation.manage']],
 ['steward',['research.credentials.define','community.moderation.manage']],
 ['executive',['research.credentials.assign','community.moderation.manage']],
].map(([role,actions])=>[keccak256(toBytes(`research.role.${role}.v1`)),{role,actions}])));
export const CREDENTIAL_ACTIONS=Object.freeze(Object.fromEntries(Object.entries(CREDENTIAL_MAPPINGS).map(([type,m])=>[type,m.actions])));
const slots={admin:'0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',implementation:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'};
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const assert=(ok)=>{if(!ok)throw Error('Research verification unavailable');};
const adminAbi=parseAbi(['function owner() view returns(address)','function rootAuthority() view returns(address)','function researchAuthority() view returns(address)']);
export async function verifyResearchDeployment(client,blockNumber,manifest=deployment){
 const d=manifest,a=d.addresses;
 assert(await client.getChainId()===d.chainId);
 await Promise.all(Object.entries(a).map(async([key,address])=>{
  const code=await client.getCode({address,blockNumber});assert(code&&code!=='0x'&&keccak256(code)===d.runtimeCodeHashes[key]);
 }));
 const read=(address,abi,functionName)=>client.readContract({address,abi,functionName,blockNumber});
 await Promise.all([[a.proxy,a.proxyAdmin,a.implementation],[a.credentialProxy,a.credentialProxyAdmin,a.credentialImplementation]].map(async([address,admin,implementation])=>{
  for(const [key,wanted] of Object.entries({admin,implementation})){
   const stored=await client.getStorageAt({address,slot:slots[key],blockNumber});assert(stored&&eq('0x'+stored.slice(-40),wanted));
  }
  assert(eq(await read(admin,adminAbi,'owner'),a.authority));
 }));
 await Promise.all([a.proxy,a.credentialProxy,a.authority].map(async(address)=>{
  assert(eq(await read(address,adminAbi,'rootAuthority'),d.root));
  assert(eq(await read(address,adminAbi,'researchAuthority'),d.research));
 }));
 assert(eq(await read(a.proxy,membershipAbi,'credentialRegistry'),a.credentialProxy));
 assert(eq(await read(a.credentialProxy,credentialsAbi,'membership'),a.proxy));
 assert(eq(await read(a.proxy,membershipAbi,'beneficiary'),d.research));
 assert(eq(await read(a.proxy,membershipAbi,'bit'),d.bit));
}
// No positive result is cached. Every call rechecks the current canonical block,
// implementation and full parent/child validity. Independent grants live elsewhere.
export async function readResearchCredentials(wallet,{client,env=process.env,now=Date.now(),manifest=deployment}={}){
 const started=Date.now();
 const base={wallet,chainId:1,registry:deployment.addresses.credentialProxy,membership:deployment.addresses.proxy,actions:[],credentials:[],checkedAt:now};
 if(!/^0x[a-f0-9]{40}$/i.test(wallet||''))return {...base,status:'wallet-required'};
 try{
  if(!client){const url=env.RESEARCH_RPC_URL||env.MAINNET_RPC_URL||env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com';assert(url);client=createPublicClient({chain:mainnet,transport:http(url,{batch:true,timeout:5000,retryCount:0,fetchOptions:{signal:AbortSignal.timeout(15000)}})});}
  const [finalized,block]=await Promise.all([client.getBlock({blockTag:'finalized'}),client.getBlock({blockTag:'latest'})]);
  assert(finalized.number>=BigInt(deployment.upgradeVerifiedBlock||deployment.deploymentBlock)&&finalized.number<=block.number);
  assert(Math.abs(now-Number(block.timestamp)*1000)<=60000);
  await verifyResearchDeployment(client,finalized.number,manifest);
  if(finalized.number!==block.number)await verifyResearchDeployment(client,block.number,manifest);
  const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber:block.number});
  const c=(fn,args)=>read(base.registry,credentialsAbi,fn,args),m=(fn,args)=>read(base.membership,membershipAbi,fn,args);
  const ids=[],seen=new Set();
  // Lifetime history is unbounded on-chain. Fail closed rather than partially
  // authorizing an account whose history exceeds this bounded request budget.
  for(let offset=0;offset<=1000;offset+=100){
   const page=await c('credentialIdsOf',[wallet,BigInt(offset),100n]);assert(Array.isArray(page)&&page.length<=100);
   for(const id of page){assert(typeof id==='bigint'&&id>0n&&!seen.has(String(id)));seen.add(String(id));ids.push(id);}
   assert(ids.length<=1000);if(page.length<100)break;
  }
  const records=[];let validUntil=Infinity;
  for(let offset=0;offset<ids.length;offset+=8)await Promise.all(ids.slice(offset,offset+8).map(async id=>{
   const [record,parent,valid,burned]=await Promise.all([c('credentials',[id]),c('parentMembershipOf',[id]),c('isCredentialValid',[id]),c('burnedCredentials',[id])]);
   const [member,parentId,type,,expiry,revoked]=record;
   assert(eq(member,wallet)&&parentId===parent);
   const [owner,active,parentExpiry]=await Promise.all([m('memberOf',[parent]),m('isActiveMember',[wallet,parent]),m('expirationTimestamps',[parent])]);
   let current=valid===true&&burned===false&&revoked===false&&active===true&&eq(owner,wallet)&&Number(parentExpiry)*1000>now&&(expiry===0n||Number(expiry)*1000>now);
   // The same credential must already be valid at finality and remain valid now.
   if(current){
    const atFinal=(address,abi,functionName,args)=>client.readContract({address,abi,functionName,args,blockNumber:finalized.number});
    const [old,oldValid,oldBurned,oldActive,oldOwner,oldExpiry]=await Promise.all([
     atFinal(base.registry,credentialsAbi,'credentials',[id]),
     atFinal(base.registry,credentialsAbi,'isCredentialValid',[id]),
     atFinal(base.registry,credentialsAbi,'burnedCredentials',[id]),
     atFinal(base.membership,membershipAbi,'isActiveMember',[wallet,parent]),
     atFinal(base.membership,membershipAbi,'memberOf',[parent]),
     atFinal(base.membership,membershipAbi,'expirationTimestamps',[parent]),
    ]);
    current=oldValid===true&&oldBurned===false&&oldActive===true&&eq(old[0],wallet)&&old[1]===parent&&old[2]===type&&old[5]===false&&eq(oldOwner,wallet)&&Number(oldExpiry)*1000>now&&(old[4]===0n||Number(old[4])*1000>now);
    if(current&&CREDENTIAL_ACTIONS[type]?.length)validUntil=Math.min(validUntil,Number(oldExpiry)*1000,old[4]===0n?Infinity:Number(old[4])*1000);
   }
   const actions=current?(CREDENTIAL_ACTIONS[type]||[]):[];
   if(actions.length)validUntil=Math.min(validUntil,Number(parentExpiry)*1000,expiry===0n?Infinity:Number(expiry)*1000);
   records.push({id:String(id),parentId:String(parent),type,valid:current,burned,revoked,expiresAt:expiry===0n?null:new Date(Number(expiry)*1000).toISOString(),actions,action:actions.length===1?actions[0]:null});
  }));
  const [canonical,finalCanonical]=await Promise.all([client.getBlock({blockNumber:block.number}),client.getBlock({blockNumber:finalized.number})]);assert(canonical.hash===block.hash&&finalCanonical.hash===finalized.hash);
  const finished=now+Date.now()-started;assert(Math.abs(finished-Number(block.timestamp)*1000)<=60000);
  validUntil=Math.min(validUntil,finished+5000);
  return {...base,status:'current',blockNumber:String(block.number),blockHash:block.hash,finalizedBlock:String(finalized.number),validUntil,credentials:records.sort((a,b)=>Number(BigInt(a.id)-BigInt(b.id))),actions:[...new Set(records.flatMap(r=>r.actions))]};
 }catch{return {...base,status:'unavailable'};}
}
