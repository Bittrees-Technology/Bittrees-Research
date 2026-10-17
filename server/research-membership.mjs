import {parseAbi} from 'viem';
export const MEMBERSHIP='0xcecd807193cf79b59e9c849b9cccba10dd6f8335';
// Retired address identifies persisted room URLs, never a source of balances.
export const LEGACY='0xc8121e650bd797d8b9dad00227a9a77ef603a84a';
const abi=parseAbi(['function blockedWallets(address) view returns(bool)','function lastTokenId() view returns(uint256)','function isActiveMember(address,uint256) view returns(bool)']);
/** Fresh evidence only. Explicit token IDs stay scoped to the requested contract. */
export async function researchMembershipBalance(client,token,user,id) {
 const address=token.toLowerCase();
 // Preserve saved any-ID room URLs using only current-contract evidence.
 // Explicit legacy IDs cannot be translated to new token identities.
 if(address!==MEMBERSHIP && (address!==LEGACY || id!==undefined))return 0n;
 const blockNumber=await client.getBlockNumber();
 const read=(address,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber});
 if(await read(MEMBERSHIP,'blockedWallets',[user]))return 0n;
 if(id!==undefined)return await read(MEMBERSHIP,'isActiveMember',[user,id])?1n:0n;
 const last=await read(MEMBERSHIP,'lastTokenId');
 if(last>10000n)throw Error('Membership index capacity exceeded');
 let count=0n;
 for(let start=1n;start<=last;start+=100n){
  const ids=Array.from({length:Number(last-start+1n<100n?last-start+1n:100n)},(_,i)=>start+BigInt(i));
  const valid=await client.multicall({contracts:ids.map(id=>({address:MEMBERSHIP,abi,functionName:'isActiveMember',args:[user,id]})),allowFailure:false,blockNumber});
  count+=BigInt(valid.filter(v=>v===true).length);
 }
 return count;
}
