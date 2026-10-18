import {keccak256,toBytes} from 'viem';
import deployment from '../../src/lib/constants/research-deployment.json' with {type:'json'};
export const wallet='0x'+'1'.repeat(40);
export const type=role=>keccak256(toBytes(`research.role.${role}.v1`));
export function evidence(role='executive',now=Date.now()) {return {wallet,chainId:1,registry:deployment.addresses.credentialProxy,membership:deployment.addresses.proxy,status:'current',validUntil:now+5000,credentials:[{id:'1',parentId:'1',type:type(role),valid:true,burned:false,revoked:false}]};}
export function chainFixture(options={}){
 const now=Date.now(),latest=26216000n,finalized=latest-64n,a=deployment.addresses;
 const manifest={...deployment,runtimeCodeHashes:Object.fromEntries(Object.keys(a).map(k=>[k,keccak256('0x1234')]))};
 const reads=[];
 const client={
  getChainId:async()=>options.chain||1,
  getBlock:async({blockTag,blockNumber})=>({number:blockNumber??(blockTag==='finalized'?finalized:latest),hash:options.reorg&&blockNumber?'changed':String(blockNumber??(blockTag==='finalized'?finalized:latest)),timestamp:BigInt(Math.floor(now/1000)-(options.stale?120:0))}),
  getCode:async()=>options.badCode?'0x':'0x1234',
  getStorageAt:async({address,slot})=>{const member=address===a.proxy;const value=slot.startsWith('0xb531')?(member?a.proxyAdmin:a.credentialProxyAdmin):(member?a.implementation:a.credentialImplementation);return '0x'+'0'.repeat(24)+(options.badSlot?a.authority:value).slice(2);},
  readContract:async({address,functionName:fn,args=[],blockNumber})=>{
   reads.push({fn,blockNumber});const old=blockNumber===finalized;
   if(fn==='owner')return a.authority;
   if(fn==='rootAuthority')return deployment.root;
   if(fn==='researchAuthority'||fn==='beneficiary')return deployment.research;
   if(fn==='bit')return deployment.bit;
   if(fn==='membership')return a.proxy;
   if(fn==='credentialRegistry')return a.credentialProxy;
   if(fn==='credentialIdsOf')return options.empty?[]:[1n];
   if(fn==='credentials')return [options.wrongOwner?deployment.root:wallet,1n,type(options.role||'executive'),'',options.expired||old&&options.priorCredentialExpired?1n:0n,!!options.revoked];
   if(fn==='parentMembershipOf')return 1n;
   if(fn==='isCredentialValid')return !(options.invalid||old&&options.unfinalized);
   if(fn==='burnedCredentials')return !!options.burned;
   if(fn==='memberOf')return options.wrongParent?deployment.root:wallet;
   if(fn==='isActiveMember')return !(options.blocked||options.inactive||old&&options.parentUnfinalized);
   if(fn==='expirationTimestamps')return BigInt(Math.floor(now/1000)+(options.parentExpired||old&&options.priorParentExpired?-1:10000));
   throw Error(`Unexpected ${address} ${fn} ${args}`);
  }
 };
 return {client,manifest,now,reads,latest,finalized};
}
