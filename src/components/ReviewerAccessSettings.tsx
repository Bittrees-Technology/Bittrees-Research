import {useState} from 'react';
import {useWalletClient} from 'wagmi';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuthorityAccess} from '../lib/authorityAccess';
import {deriveEncKeypair,pubKeyHex} from '../lib/appcrypto';
import {publishEncKey,currentReviewers,type CommunityData} from '../lib/community';

export function useReviewerSetupAccess(address?:string){
 const authority=useAuthorityAccess(address);
 return !authority.isError&&authority.data?.configured===true&&!!authority.data.roles?.some(r=>['Partner','Junior Partner','Associate','operations','executive'].includes(r.label));
}

export default function ReviewerAccessSettings({address}:{address?:`0x${string}`}){
 const eligible=useReviewerSetupAccess(address),wallet=address?.toLowerCase();
 const {data:client}=useWalletClient(),qc=useQueryClient();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const registry=useQuery({queryKey:['reviewer-setup',wallet],enabled:!!wallet&&eligible,staleTime:0,refetchInterval:15000,queryFn:async()=>{
  const response=await fetch('/api/community',{cache:'no-store'});
  if(!response.ok)throw Error('Application access could not be checked.');
  const data:CommunityData=await response.json();currentReviewers(data);return data;
 }});
 if(!eligible)return null;
 const registered=!!wallet&&/^[a-f0-9]{64}$/.test(registry.data?.enckeys?.[wallet]||'');
 const proof=registry.data?.reviewerAuthority;
 const receiving=registered&&proof?.ready&&!!proof.expiresAt&&proof.expiresAt>Date.now()&&proof.reviewers?.includes(wallet!);
 async function setup(){
  if(!client||!address||client.account?.address.toLowerCase()!==wallet)return;
  setBusy(true);setError('');
  try{
   const pair=await deriveEncKeypair(client,address);
   let pubkey:string;try{pubkey=pubKeyHex(pair.publicKey);}finally{pair.secretKey.fill(0);}
   await publishEncKey({walletClient:client,account:address,pubkey});
   await Promise.all([qc.invalidateQueries({queryKey:['reviewer-setup']}),qc.invalidateQueries({queryKey:['community']})]);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="card"><h2>Application access</h2>
 {registry.isError?<p role="alert">Application access could not be checked. <button onClick={()=>registry.refetch()}>Retry</button></p>:!registry.data?<p>Checking application access…</p>:receiving?<p role="status">Application access enabled. Future applications include this wallet while its reviewer role remains eligible.</p>:registered?<p role="status">Your wallet is registered. Future application access is waiting for current role eligibility to be confirmed.</p>:<><p>Set up this wallet once to receive future encrypted applications. Eligible Partners, Junior Partners and Associates are included automatically after setup.</p><button className="btn-primary" disabled={busy||!client||client.account?.address.toLowerCase()!==wallet} onClick={setup}>{busy?'Setting up…':'Enable application access'}</button><p>Your wallet will ask you to derive an encryption key and sign its public registration. No transaction is required.</p></>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
