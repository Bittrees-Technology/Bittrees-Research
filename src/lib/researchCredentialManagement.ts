import { decodeEventLog, decodeFunctionData, encodeFunctionData, getAddress, isAddress, keccak256, parseAbi, toBytes, type Address, type PublicClient } from 'viem';
import deployment from './constants/research-deployment.json' with { type: 'json' };

export const MEMBERSHIP = deployment.addresses.proxy as Address;
export const CREDENTIALS = deployment.addresses.credentialProxy as Address;
export const AUTHORITIES = [deployment.research, deployment.root] as Address[];
export const RESEARCHER_TYPE = keccak256(toBytes('research.role.researcher.v1'));
export const credentialManagementAbi = parseAbi([
  'function rootAuthority() view returns(address)', 'function researchAuthority() view returns(address)',
  'function membership() view returns(address)', 'function credentialRegistry() view returns(address)',
  'function owner() view returns(address)',
  'function isActiveMember(address,uint256) view returns(bool)',
  'function credentialIdsOf(address,uint256,uint256) view returns(uint256[])',
  'function credentials(uint256) view returns(address member,uint256 membershipTokenId,bytes32 credentialType,string metadataURI,uint64 validUntil,bool revoked)',
  'function isCredentialValid(uint256) view returns(bool)', 'function burnedCredentials(uint256) view returns(bool)',
  'function issueCredential(address,uint256,bytes32,string,uint64) returns(uint256)',
  'function setCredentialRevoked(uint256,bool)',
  'event CredentialIssued(uint256 indexed credentialId,address indexed member,uint256 indexed membershipTokenId,bytes32 credentialType,string metadataURI,uint64 validUntil,address administrator)',
  'event CredentialRevocationUpdated(uint256 indexed credentialId,bool revoked,address indexed administrator)',
]);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const assert = (ok: unknown, message = 'Research contract verification unavailable.') => { if (!ok) throw Error(message); };
export type CredentialRecord = { id: string; member: Address; parentId: string; type: string; uri: string; expiresAt: string; revoked: boolean; burned: boolean; valid: boolean; role: string | null };
export type CredentialAction = { kind: 'issue'; credentialType?: `0x${string}`; member: string; parentId: string; metadataURI: string; validUntil: string } | { kind: 'revoke' | 'restore'; member: string; credentialId: string; credentialType?: `0x${string}` };
export type CredentialPlan = { to: Address; data: `0x${string}`; value: '0'; operation: 0; authority: Address; summary: string; checkedAt: number; blockNumber: string };

/** Pin both proxies, implementations and upgrade owners before preparing authority calls. */
async function verifiedBlock(client: PublicClient) {
  assert(await client.getChainId() === 1);
  const block = await client.getBlock({ blockTag: 'latest' });
  assert(Math.abs(Date.now()/1000-Number(block.timestamp)) < 60);
  const blockNumber = block.number;
  await Promise.all(Object.entries(deployment.addresses).map(async ([key,address]) => {
    const code = await client.getCode({address: address as Address,blockNumber});
    assert(code && keccak256(code) === deployment.runtimeCodeHashes[key as keyof typeof deployment.runtimeCodeHashes]);
  }));
  const read = (address:Address, functionName:'owner'|'rootAuthority'|'researchAuthority'|'membership'|'credentialRegistry') => client.readContract({address,abi:credentialManagementAbi,functionName,blockNumber});
  for (const [proxy,admin,implementation] of [[MEMBERSHIP,deployment.addresses.proxyAdmin,deployment.addresses.implementation],[CREDENTIALS,deployment.addresses.credentialProxyAdmin,deployment.addresses.credentialImplementation]]) {
    for (const [slot,wanted] of [['0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',admin],['0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',implementation]]) {
      const value=await client.getStorageAt({address:proxy as Address,slot:slot as `0x${string}`,blockNumber});assert(value&&same('0x'+value.slice(-40),wanted));
    }
    assert(same(await read(admin as Address,'owner'),deployment.addresses.authority));
  }
  for(const address of [MEMBERSHIP,CREDENTIALS,deployment.addresses.authority as Address]) {
    assert(same(await read(address,'rootAuthority'),deployment.root));assert(same(await read(address,'researchAuthority'),deployment.research));
  }
  assert(same(await read(MEMBERSHIP,'credentialRegistry'),CREDENTIALS));assert(same(await read(CREDENTIALS,'membership'),MEMBERSHIP));
  return block;
}

export async function readManagedCredentials(client:PublicClient,member:string) {
  assert(isAddress(member),'Enter an Ethereum wallet address.');const wallet=getAddress(member),block=await verifiedBlock(client);
  const records:CredentialRecord[]=[];
  for(let offset=0;offset<=1000;offset+=100) {
    const ids=await client.readContract({address:CREDENTIALS,abi:credentialManagementAbi,functionName:'credentialIdsOf',args:[wallet,BigInt(offset),100n],blockNumber:block.number});
    assert(offset+ids.length<=1000,'Credential history is too large for this view.');
    records.push(...await Promise.all(ids.map(async id=>{
      const [r,valid,burned]=await Promise.all([
        client.readContract({address:CREDENTIALS,abi:credentialManagementAbi,functionName:'credentials',args:[id],blockNumber:block.number}),
        client.readContract({address:CREDENTIALS,abi:credentialManagementAbi,functionName:'isCredentialValid',args:[id],blockNumber:block.number}),
        client.readContract({address:CREDENTIALS,abi:credentialManagementAbi,functionName:'burnedCredentials',args:[id],blockNumber:block.number}),
      ]);assert(same(r[0],wallet));return {id:String(id),member:r[0],parentId:String(r[1]),type:r[2],uri:r[3],expiresAt:String(r[4]),revoked:r[5],valid,burned,role:r[2]===RESEARCHER_TYPE?'Researcher':null};
    })));
    if(ids.length<100)break;
  }
  assert((await client.getBlock({blockNumber:block.number})).hash===block.hash);
  return {records,blockNumber:String(block.number),checkedAt:Date.now()};
}

export function credentialCall(action:CredentialAction,now=Date.now()) {
  assert(isAddress(action.member),'Enter an Ethereum wallet address.');const member=getAddress(action.member);
  const type=action.credentialType??RESEARCHER_TYPE;
  assert(/^0x[0-9a-fA-F]{64}$/.test(type)&&!/^0x0{64}$/.test(type),'Choose a valid credential type.');
  const id=action.kind==='issue'?action.parentId:action.credentialId;
  assert(/^[1-9]\d{0,77}$/.test(id)&&BigInt(id)<2n**256n,'Enter a positive token ID.');
  if(action.kind==='issue') {
    let uri:URL;try{uri=new URL(action.metadataURI);}catch{throw Error('Enter a public HTTPS metadata URL.');}
    assert(uri.protocol==='https:'&&!uri.username&&!uri.password&&new TextEncoder().encode(action.metadataURI).length<=2048,'Enter a public HTTPS metadata URL of at most 2,048 bytes.');
    const parsed=action.validUntil===''?0:Math.floor(Date.parse(action.validUntil)/1000);
    assert(Number.isSafeInteger(parsed),'Enter a valid credential expiry.');
    const expiry=BigInt(parsed);
    assert(expiry===0n||(expiry>BigInt(Math.floor(now/1000))&&expiry<2n**64n),'Credential expiry must be in the future.');
    return {member,id:BigInt(id),data:encodeFunctionData({abi:credentialManagementAbi,functionName:'issueCredential',args:[member,BigInt(id),type,action.metadataURI,expiry]}),summary:`Issue ${type===RESEARCHER_TYPE?'Researcher':type} credential to ${member}, membership #${id}`};
  }
  return {member,id:BigInt(id),data:encodeFunctionData({abi:credentialManagementAbi,functionName:'setCredentialRevoked',args:[BigInt(id),action.kind==='revoke']}),summary:`${action.kind==='revoke'?'Revoke':'Restore'} credential #${id} for ${member}`};
}

export async function prepareCredential(client:PublicClient,action:CredentialAction,authority:Address):Promise<CredentialPlan> {
  assert(AUTHORITIES.some(a=>same(a,authority)),'Choose an authorized Research Safe.');
  const call=credentialCall(action),block=await verifiedBlock(client);
  if(action.kind==='issue') {
    assert(await client.readContract({address:MEMBERSHIP,abi:credentialManagementAbi,functionName:'isActiveMember',args:[call.member,call.id],blockNumber:block.number}),'The wallet must actively hold this membership.');
    const existing=await readManagedCredentials(client,call.member);
    assert(!existing.records.some(r=>r.type===(action.credentialType??RESEARCHER_TYPE)&&r.valid),'This wallet already has a valid credential of this type.');
  } else {
    const r=await client.readContract({address:CREDENTIALS,abi:credentialManagementAbi,functionName:'credentials',args:[call.id],blockNumber:block.number});
    assert(same(r[0],call.member)&&r[2]===(action.credentialType??RESEARCHER_TYPE),'This credential does not match the selected wallet and role.');
    if(action.kind==='restore')assert(await client.readContract({address:MEMBERSHIP,abi:credentialManagementAbi,functionName:'isActiveMember',args:[call.member,r[1]],blockNumber:block.number}),'Restore requires an active parent membership.');
  }
  await client.call({account:authority,to:CREDENTIALS,data:call.data,blockNumber:block.number});
  assert((await client.getBlock({blockNumber:block.number})).hash===block.hash);
  return {to:CREDENTIALS,data:call.data,value:'0',operation:0,authority,summary:call.summary,checkedAt:Date.now(),blockNumber:String(block.number)};
}
export function safeCredentialBatch(plan:CredentialPlan) {
  return {version:'1.0',chainId:'1',createdAt:plan.checkedAt,meta:{name:plan.summary,description:'Research membership credential. Roles derives eligibility only after on-chain confirmation and current verification.',txBuilderVersion:'1.18.0',createdFromSafeAddress:plan.authority},transactions:[{to:plan.to,value:'0',data:plan.data}]};
}

/** A Safe may emit ExecutionFailure while its outer transaction still succeeds. */
export function credentialReceiptMatches(plan:CredentialPlan,receipt:{status:string;logs:readonly {address:string;data:`0x${string}`;topics:readonly `0x${string}`[]}[]}) {
 if(receipt.status!=='success')return false;
 const call=decodeFunctionData({abi:credentialManagementAbi,data:plan.data});
 return receipt.logs.some(log=>{
  if(!same(log.address,CREDENTIALS))return false;
  try{
   const event=decodeEventLog({abi:credentialManagementAbi,data:log.data,topics:log.topics as [`0x${string}`,...`0x${string}`[]]});
   if(call.functionName==='issueCredential'&&event.eventName==='CredentialIssued'){
    const [member,parent,type,uri,expiry]=call.args;const e=event.args;
    return same(e.administrator,plan.authority)&&same(e.member,member)&&e.membershipTokenId===parent&&e.credentialType===type&&e.metadataURI===uri&&e.validUntil===expiry;
   }
   if(call.functionName==='setCredentialRevoked'&&event.eventName==='CredentialRevocationUpdated')return event.args.credentialId===call.args[0]&&event.args.revoked===call.args[1]&&same(event.args.administrator,plan.authority);
  }catch{return false;}
  return false;
 });
}
