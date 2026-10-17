import {parseAbi} from 'viem';
export const MEMBERSHIP='0xcecd807193cf79b59e9c849b9cccba10dd6f8335';
export const LEGACY='0xc8121e650bd797d8b9dad00227a9a77ef603a84a';
const abi=parseAbi(['function blockedWallets(address) view returns(bool)','function lastTokenId() view returns(uint256)','function isActiveMember(address,uint256) view returns(bool)','function balanceOf(address,uint256) view returns(uint256)','function isExpired(uint256) view returns(bool)']);
/** Fresh evidence only. Explicit token IDs stay scoped to the requested contract. */
export async function researchMembershipBalance(client,token,user,id) {
 const blockNumber=await client.getBlockNumber();
 const read=(address,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber});
 if(await read(MEMBERSHIP,'blockedWallets',[user]))return 0n;
 if(id!==undefined){
  if(token.toLowerCase()===MEMBERSHIP)return await read(MEMBERSHIP,'isActiveMember',[user,id])?1n:0n;
  const [balance,expired]=await Promise.all([read(LEGACY,'balanceOf',[user,id]),read(LEGACY,'isExpired',[id])]);return expired?0n:balance;
 }
 const last=await read(MEMBERSHIP,'lastTokenId');
 if(last>10000n)throw Error('Membership index capacity exceeded');
 let count=0n;
 for(let start=1n;start<=last;start+=100n){
  const ids=Array.from({length:Number(last-start+1n<100n?last-start+1n:100n)},(_,i)=>start+BigInt(i));
  const valid=await client.multicall({contracts:ids.map(id=>({address:MEMBERSHIP,abi,functionName:'isActiveMember',args:[user,id]})),allowFailure:false,blockNumber});
  count+=BigInt(valid.filter(v=>v===true).length);
 }
 if(token.toLowerCase()===MEMBERSHIP)return count;
 // Existing legacy 'any ID' rooms used IDs 0..255. Preserve that range and
 // admit new passes too, while adding the expiry and new wallet-block checks.
 const results=await client.multicall({contracts:Array.from({length:256},(_,i)=>BigInt(i)).flatMap(id=>[
  {address:LEGACY,abi,functionName:'balanceOf',args:[user,id]},
  {address:LEGACY,abi,functionName:'isExpired',args:[id]},
 ]),allowFailure:false,blockNumber});
 for(let i=0;i<256;i++)if(results[i*2+1]===false)count+=results[i*2];
 return count;
}
