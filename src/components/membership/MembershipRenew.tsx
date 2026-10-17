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
  const [now, setNow] = useState(() => Math.floor(Date.now()/1000));
  useEffect(() => { const timer=setInterval(()=>setNow(Math.floor(Date.now()/1000)),1000); return ()=>clearInterval(timer); }, []);
  const selected=eligible.find(t=>t.tokenId===tokenId);
  const proposed=selected&&valid?Math.max(selected.expiresAt,now)+duration*86400:undefined;
  const date=(seconds:number)=>new Date(seconds*1000).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC';
  const cost=typeof rate==='bigint'&&valid?rate*BigInt(duration):undefined;
  if(!eligible.length)return null;
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
    <label>Days to add <input type="number" min="1" max="3650" step="1" aria-describedby="renewal-days-help" value={days} disabled={busy} onChange={e=>setDays(e.target.value)}/></label>
    <p id="renewal-days-help">Choose 1–3,650 whole days. ETH is only used for network gas.</p>
    <dl style={{display:'grid',gridTemplateColumns:'minmax(0, 1fr) minmax(0, 1fr)',gap:'0.75rem',margin:0}} aria-live="polite">
      <dt>BIT price per day</dt><dd style={{margin:0}}>{typeof rate==='bigint'?`${formatUnits(rate,18)} BIT`:'Loading…'}</dd>
      <dt>Total BIT payment</dt><dd style={{margin:0}}>{cost===undefined?'—':`${formatUnits(cost,18)} BIT`}</dd>
      <dt>Current expiration</dt><dd style={{margin:0}}>{selected?date(selected.expiresAt):'—'}</dd>
      <dt>Proposed expiration</dt><dd style={{margin:0}}>{proposed===undefined?'—':date(proposed)}</dd>
    </dl>
    {!valid&&<p role="alert">Enter a whole number of days between 1 and 3,650.</p>}
    <p>{selected&&selected.expiresAt<=now?'This membership has expired. Renewal starts when the transaction confirms; the proposed date is an estimate.':'Days are added to this membership’s current expiration.'} Its credentials stay attached.</p>
    {chainId!==1?<button className="btn-primary" onClick={()=>switchChain({chainId:1})}>Switch to Ethereum</button>:<button className="btn-primary" disabled={busy||cost===undefined} onClick={()=>void renew()}>{busy?'Check wallet…':'Approve BIT and renew'}</button>}
    {message&&<p role="status">{message}</p>}
  </div>;
}
