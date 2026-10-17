import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useChainId, usePublicClient, useWriteContract } from 'wagmi';
import type { Abi } from 'viem';
import credentialAbi from '@/lib/constants/credentials.abi.json';
import membershipAbi from '@/lib/constants/membership.abi.json';
import { getContractAddress } from '@/lib/constants/contracts';
import type { MembershipToken } from '@/lib/membershipVerification';
const registry='0x335708826d76302E5014E6Ca41564482e38AA8B2';
const membership=getContractAddress('membership',1);
export function MembershipCredentials({tokens,onChanged}:{tokens:MembershipToken[];onChanged:()=>void}) {
  const client=usePublicClient({chainId:1});const {address}=useAccount();const chainId=useChainId();const {writeContractAsync}=useWriteContract();
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const parents=tokens.filter(t=>t.version==='v2');
  const query=useQuery({queryKey:['research-credentials',address,parents.map(t=>t.tokenId).join(',')],enabled:!!client&&!!address&&parents.length>0,refetchInterval:30000,retry:1,queryFn:async()=>{
    const blockNumber=await client!.getBlockNumber();
    return Promise.all(parents.map(async parent=>{
      const ids=await client!.readContract({address:registry,abi:credentialAbi as Abi,functionName:'credentialIdsForMembership',args:[BigInt(parent.tokenId),0n,100n],blockNumber}) as bigint[];
      const credentials=await Promise.all(ids.map(async id=>{
        const [record,valid]=await Promise.all([
          client!.readContract({address:registry,abi:credentialAbi as Abi,functionName:'credentials',args:[id],blockNumber}),
          client!.readContract({address:registry,abi:credentialAbi as Abi,functionName:'isCredentialValid',args:[id],blockNumber}),
        ]);
        const [, ,type,uri,validUntil]=record as [string,bigint,string,string,bigint,boolean];
        return {id,type,uri,validUntil,valid:valid===true};
      }));return {parent,credentials};
    }));
  }});
  async function burn(id:bigint,parent:boolean){
    if(!client||!address||busy||chainId!==1)return;
    if(!window.confirm(parent?'Permanently burn this membership AND ALL its credentials? This cannot be undone.':'Permanently burn this credential? This cannot be undone.'))return;
    setBusy(true);setMessage('Confirm permanent burn in your wallet.');
    try{
      const sim=await client.simulateContract({address:parent?membership:registry,abi:(parent?membershipAbi:credentialAbi) as Abi,functionName:parent?'burnMembership':'burnCredential',args:[id],account:address});
      const hash=await writeContractAsync(sim.request);const receipt=await client.waitForTransactionReceipt({hash});
      if(receipt.status!=='success')throw Error('Burn reverted');setMessage('Burn confirmed.');onChanged();void query.refetch();
    }catch{setMessage('Burn not confirmed. Check wallet history before retrying.');}finally{setBusy(false);}
  }
  if(!parents.length)return null;
  return <section className="card"><h2>Attached credentials</h2><p>Credentials are held inside each membership. Roles grants permissions only for explicitly supported, currently valid types.</p>
    {query.isError?<p role="alert">Credential verification unavailable. <button onClick={()=>void query.refetch()}>Retry</button></p>:query.isPending?<p>Checking credentials…</p>:query.data?.map(({parent,credentials})=><div key={parent.tokenId}>
      <h3>Membership #{parent.tokenId}</h3>
      {credentials.length===0?<p>No attached credentials.</p>:<ul>{credentials.map(c=><li key={c.id.toString()}>Credential #{c.id.toString()} — {c.valid?'Valid':'Inactive'}<br/><code style={{overflowWrap:'anywhere'}}>{c.type}</code>{/^https:\/\//i.test(c.uri)&&<> · <a href={c.uri} target="_blank" rel="noreferrer">Metadata</a></>}<br/><button disabled={busy||chainId!==1} onClick={()=>void burn(c.id,false)}>Burn credential</button></li>)}</ul>}
      <button disabled={busy||chainId!==1} onClick={()=>void burn(BigInt(parent.tokenId),true)}>Burn membership and all credentials</button>
    </div>)}{chainId!==1&&<p>Switch your wallet to Ethereum to burn tokens.</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
