import { useEffect, useRef, useState } from 'react';
import { erc20Abi, formatUnits, type Abi } from 'viem';
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';
import membershipAbi from '@/lib/constants/membership.abi.json';
import { getContractAddress } from '@/lib/constants/contracts';
import { useMembershipStatus } from '@/hooks/membership/useMembershipStatus';
const membership = getContractAddress('membership',1), bit = getContractAddress('bit',1);
export function MembershipRenew() {
  const { tokens, refetch, sessionRevision } = useMembershipStatus();
  const { address } = useAccount(); const chainId = useChainId(); const { switchChain } = useSwitchChain();
  const client = usePublicClient({ chainId: 1 }); const { writeContractAsync } = useWriteContract();
  const [id, setId] = useState(''); const [days, setDays] = useState('30'); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const scope = `${address}:${sessionRevision}`; const current = useRef(scope); current.current=scope;
  useEffect(()=>{setId('');setMessage('');},[scope]);
  const eligible=tokens.filter(t=>t.version==='v2'&&!t.revoked&&!t.blocked);
  const tokenId=eligible.some(t=>t.tokenId===id)?id:eligible[0]?.tokenId;
  const duration=Number(days); const valid=/^\d+$/.test(days)&&Number.isSafeInteger(duration)&&duration>0&&duration<=3650;
  const { data: rate, refetch: refreshRate } = useReadContract({ address:membership,abi:membershipAbi as Abi,functionName:'bitPricePerDay',chainId:1,query:{refetchInterval:15000} });
  const cost=typeof rate==='bigint'&&valid?rate*BigInt(duration):undefined;
  if(!eligible.length)return <p>BIT renewal is available for new memberships. Legacy holders can mint a new membership below; existing credentials do not move between tokens.</p>;
  async function renew(){
    if(!client||!address||!tokenId||cost===undefined||busy)return;
    const captured=scope;const max=cost;const check=()=>{if(current.current!==captured)throw Error('Wallet session changed. Review your transactions before continuing.');};
    setBusy(true);setMessage('Checking allowance…');
    try{
      const allowance=await client.readContract({address:bit,abi:erc20Abi,functionName:'allowance',args:[address,membership]});check();
      if(allowance<max){
        setMessage('Approve the exact BIT amount in your wallet.');
        const approval=await writeContractAsync({address:bit,abi:erc20Abi,functionName:'approve',args:[membership,max],chainId:1});
        const receipt=await client.waitForTransactionReceipt({hash:approval});check();if(receipt.status!=='success')throw Error('BIT approval reverted.');
      }
      const simulation=await client.simulateContract({address:membership,abi:membershipAbi as Abi,functionName:'renewMembership',args:[BigInt(tokenId),duration,max],account:address});check();
      setMessage('Confirm the BIT renewal in your wallet.');
      const hash=await writeContractAsync(simulation.request);const receipt=await client.waitForTransactionReceipt({hash});check();
      if(receipt.status!=='success')throw Error('Renewal reverted.');
      setMessage('Renewal confirmed. Checking current membership.');refetch();
    }catch{if(current.current===captured)setMessage('Renewal was not confirmed. Check wallet history before retrying; a rate increase may require a new quote.');}
    finally{setBusy(false);void refreshRate();}
  }
  return <div style={{display:'grid',gap:12}}>
    <label>Membership <select value={tokenId} disabled={busy} onChange={e=>setId(e.target.value)}>{eligible.map(t=><option key={t.tokenId} value={t.tokenId}>#{t.tokenId}</option>)}</select></label>
    <label>Days to add <input type="number" min="1" max="3650" value={days} disabled={busy} onChange={e=>setDays(e.target.value)}/></label>
    <p>{typeof rate==='bigint'?formatUnits(rate,18):'Loading…'} BIT per day. Maximum payment: {cost===undefined?'—':formatUnits(cost,18)} BIT. ETH is only used for network gas.</p>
    <p>Extends this token from its expiry, or from today if expired. Its credentials stay attached.</p>
    {chainId!==1?<button className="btn-primary" onClick={()=>switchChain({chainId:1})}>Switch to Ethereum</button>:<button className="btn-primary" disabled={busy||cost===undefined} onClick={()=>void renew()}>{busy?'Check wallet…':'Approve BIT and renew'}</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
