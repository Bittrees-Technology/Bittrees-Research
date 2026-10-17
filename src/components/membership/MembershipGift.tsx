import {useEffect, useRef, useState} from 'react';
import {decodeEventLog, formatEther, getAddress, isAddress, parseAbi, zeroAddress, type Address} from 'viem';
import {useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract} from 'wagmi';
import {getContractAddress} from '@/lib/constants/contracts';
import {saveGift,useGiftRecord} from '@/lib/membershipGiftJournal';
import {useMembershipStatus} from '@/hooks/membership/useMembershipStatus';

const membership=getContractAddress('membership',1);
const abi=parseAbi([
 'function mintPrice() view returns(uint256)',
 'function expirationTimeframe() view returns(uint256)',
 'function mintMembership(address to) payable returns(uint256)',
 'event MemberJoined(address indexed member,uint256 indexed tokenId,uint256 expiry)',
]);
type Review={recipient:Address;price:bigint;term:bigint};

/** Gifts never enter the sender's membership-verification or access state. */
export function MembershipGift(){
 const {address}=useAccount(),chainId=useChainId(),client=usePublicClient({chainId:1});
 const {sessionRevision}=useMembershipStatus();const {switchChain,isPending:switching}=useSwitchChain();
 const {writeContractAsync}=useWriteContract();
 const [recipient,setRecipient]=useState(''),[review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const gift=useGiftRecord();
 const scope=JSON.stringify([address,chainId,sessionRevision,recipient]);const current=useRef(scope);current.current=scope;
 useEffect(()=>{setReview(null);setMessage('');},[scope]);
 useEffect(()=>{current.current=scope;return()=>{current.current='unmounted';};},[]);
 const price=useReadContract({address:membership,abi,functionName:'mintPrice',chainId:1,query:{refetchInterval:15000}});
 const term=useReadContract({address:membership,abi,functionName:'expirationTimeframe',chainId:1});
 const target=recipient.trim();
 const valid=isAddress(target)&&target.toLowerCase()!==zeroAddress&&target.toLowerCase()!==address?.toLowerCase();
 async function send(){
  if(!review||!client||!address||chainId!==1||busy)return;
  const captured=scope;const check=()=>{if(current.current!==captured)throw Error('Session changed');};
  setBusy(true);setMessage('Checking the current price and recipient…');
  try{
   const [latestPrice,latestTerm]=await Promise.all([
    client.readContract({address:membership,abi,functionName:'mintPrice'}),
    client.readContract({address:membership,abi,functionName:'expirationTimeframe'}),
   ]);check();
   if(latestPrice!==review.price||latestTerm!==review.term){setReview(null);setMessage('The mint price or term changed. Review the updated gift before continuing.');void price.refetch();void term.refetch();return;}
   const simulation=await client.simulateContract({address:membership,abi,functionName:'mintMembership',args:[review.recipient],value:review.price,account:address});check();
   setMessage('Confirm the gift in your wallet.');
   const hash=await writeContractAsync({...simulation.request,chainId:1});
   // Keep the originating sender and recipient even if the wallet changes during approval.
   saveGift({sender:address,recipient:review.recipient,hash,status:'pending'});
   setReview(null);setMessage('');
  }catch{if(current.current===captured)setMessage('Gift was not confirmed. Check your wallet transaction history before retrying. The recipient may be blocked or unable to receive this token.');}
  finally{setBusy(false);}
 }
 useEffect(()=>{
  if(!gift||gift.status!=='pending'||!client)return;
  let active=true,replaced=false;
  void (async()=>{
   try{
    const receipt=await client.waitForTransactionReceipt({hash:gift.hash,timeout:120000,onReplaced:({reason})=>{if(reason!=='repriced')replaced=true;}});
    if(!active)return;
    if(receipt.status!=='success'||replaced)throw Error('Gift not confirmed');
    let minted:{id:string;expiry:number}|undefined;
    for(const log of receipt.logs){
     if(log.address.toLowerCase()!==membership.toLowerCase())continue;
     try{const event=decodeEventLog({abi,data:log.data,topics:log.topics});
      if(event.eventName==='MemberJoined'&&event.args.member.toLowerCase()===gift.recipient.toLowerCase())minted={id:String(event.args.tokenId),expiry:Number(event.args.expiry)};
     }catch{/* Ignore other contract events. */}
    }
    if(!minted)throw Error('No matching mint event');
    saveGift({...gift,...minted,hash:receipt.transactionHash,status:'confirmed'});
   }catch{if(active)saveGift({...gift,status:'unconfirmed'});}
  })();
  return()=>{active=false;};
 },[gift,client]);
 return <details className="card-subtle" style={{marginTop:'1.5rem',padding:'1rem',borderTop:'1px solid var(--color-border)'}}>
  <summary style={{cursor:'pointer',fontWeight:700}}>Gift a membership</summary>
  <div style={{display:'grid',gap:'0.85rem',marginTop:'1rem'}}>
   <p>Mint a fresh membership directly to another wallet. You pay the mint price and Ethereum network fee; the recipient receives the token without needing to claim it.</p>
   {gift?<div role="status">
    <h3>{gift.status==='confirmed'?'Gift membership minted':gift.status==='pending'?'Gift submitted':'Gift was not confirmed'}</h3>
    <p style={{overflowWrap:'anywhere'}}>Sender: {gift.sender}<br/>Recipient: {gift.recipient}</p>
    {gift.status==='confirmed'?<p>Membership #{gift.id}. Initial expiration: {new Date(gift.expiry!*1000).toLocaleString()}. The recipient can connect that wallet to view their membership.</p>:<p>{gift.status==='pending'?'Waiting for the submitted gift transaction. This remains tracked if you switch wallets.':'Check your wallet transaction history before sending another gift.'}</p>}
    <a href={`https://etherscan.io/tx/${gift.hash}`} target="_blank" rel="noreferrer">View gift transaction ↗</a>
    {gift.status==='unconfirmed'&&<p><button onClick={()=>saveGift({...gift,status:'pending'})}>Check gift transaction again</button></p>}
    {gift.status!=='pending'&&<p><button onClick={()=>{saveGift(null);setRecipient('');setMessage('');}}> {gift.status==='confirmed'?'Gift another membership':'I checked the transaction — return to gifts'}</button></p>}
   </div>:!address?<p>Connect your wallet to gift a membership.</p>:chainId!==1?<button className="btn-primary" disabled={switching} onClick={()=>switchChain({chainId:1})}>Switch to Ethereum</button>:<>
    <label htmlFor="gift-recipient">Recipient wallet address</label>
    <input id="gift-recipient" value={recipient} disabled={busy} onChange={e=>setRecipient(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} aria-describedby="gift-address-help" style={{width:'100%',boxSizing:'border-box',padding:'0.7rem',border:'1px solid var(--color-border)',background:'var(--color-bg)'}}/>
    <p id="gift-address-help">Use an Ethereum wallet address. Memberships cannot be transferred, so check the recipient carefully. ENS names are not accepted here.</p>
    {target&&!valid&&<p role="alert">{target.toLowerCase()===address.toLowerCase()?'Use “Mint membership” above for your own wallet.':'Enter a valid, nonzero Ethereum wallet address.'}</p>}
    <p>Mint price: <strong>{typeof price.data==='bigint'?`${formatEther(price.data)} ETH`:'Unavailable'}</strong> + network fee.</p>
    <p>{typeof term.data==='bigint'?`Initial term: ${Number(term.data)/86400} days from mint confirmation.`:'Loading membership term…'} This creates a new token; it does not renew an existing membership or include credentials.</p>
    {review?<section aria-label="Review gift membership" style={{display:'grid',gap:'0.75rem'}}>
     <h3>Review your gift</h3>
     <p style={{overflowWrap:'anywhere'}}>Recipient: <strong>{review.recipient}</strong></p>
     <p>You pay {formatEther(review.price)} ETH plus network fee. The recipient owns this nontransferable membership.</p>
     <button className="btn-primary" disabled={busy} onClick={()=>void send()}>{busy?'Processing gift…':'Confirm gift in wallet'}</button>
     <button disabled={busy} onClick={()=>setReview(null)}>Back to details</button>
    </section>:<button className="btn-primary" disabled={!valid||typeof price.data!=='bigint'||typeof term.data!=='bigint'||busy} onClick={()=>{if(valid&&typeof price.data==='bigint'&&typeof term.data==='bigint'){setReview({recipient:getAddress(target),price:price.data,term:term.data});setMessage('');}}}>Review gift</button>}
   </>}
   {message&&<p role="status">{message}</p>}
  </div>
 </details>;
}
