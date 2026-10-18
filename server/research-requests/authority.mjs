import {createPublicClient,http} from 'viem';
import {mainnet} from 'viem/chains';
import abi from '../../src/lib/constants/membership.abi.json' with {type:'json'};
import {deployment,verifyResearchDeployment,readResearchCredentials,RESEARCHER_TYPE} from '../research-native-authority.mjs';
export async function requestEligibility(wallet,{client,env=process.env,native=readResearchCredentials,manifest=deployment}={}){
 if(!/^0x[a-f0-9]{40}$/i.test(wallet||''))throw Error('Verified wallet required');
 client||=createPublicClient({chain:mainnet,transport:http(env.RESEARCH_RPC_URL||env.MAINNET_RPC_URL||env.ETHEREUM_RPC_URL||'https://ethereum-rpc.publicnode.com',{batch:true,timeout:5000,retryCount:0,fetchOptions:{signal:AbortSignal.timeout(15000)}})});
 const block=await client.getBlock({blockTag:'latest'}),now=Date.now();if(Math.abs(now-Number(block.timestamp)*1000)>60000)throw Error('Stale membership evidence');
 await verifyResearchDeployment(client,block.number,manifest);
 const address=deployment.addresses.proxy,read=(functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber:block.number});
 const last=await read('lastTokenId');if(last>10000n)throw Error('Membership capacity exceeded');
 let expires=0;
 for(let start=1n;start<=last;start+=100n){
  const ids=Array.from({length:Number(last-start+1n<100n?last-start+1n:100n)},(_,i)=>start+BigInt(i));
  const active=await client.multicall({contracts:ids.map(id=>({address,abi,functionName:'isActiveMember',args:[wallet,id]})),allowFailure:false,blockNumber:block.number});
  const expiries=await Promise.all(ids.filter((_,i)=>active[i]===true).map(id=>read('expirationTimestamps',[id])));
  for(const expiry of expiries)expires=Math.max(expires,Number(expiry)*1000);
 }
 const proof=await native(wallet,{client,env}),end=Date.now();
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Membership evidence changed');
 const member=expires>end,validUntil=Math.min(expires,end+5000);
 const researcher=member&&proof.status==='current'&&proof.wallet?.toLowerCase()===wallet.toLowerCase()&&proof.validUntil>end&&proof.credentials.some(c=>c.type===RESEARCHER_TYPE&&c.valid===true&&!c.revoked&&!c.burned);
 return {wallet:wallet.toLowerCase(),member,researcher,validUntil,researcherUntil:researcher?Math.min(validUntil,proof.validUntil):0,researcherUnavailable:proof.status==='unavailable'};
}
