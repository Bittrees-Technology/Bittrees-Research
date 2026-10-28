import {ensureResearchSignIn} from '../lib/researchSignIn';
import {useEffect,useRef,useState} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {useQuery,useQueryClient} from '@tanstack/react-query';

type Session={wallet:string;csrf:string;expiresAt:number};
export function ResearchSessionCard(){
 const {address}=useAccount();
 return <WalletSession key={address?.toLowerCase()||'disconnected'} wallet={address?.toLowerCase()}/>;
}
function WalletSession({wallet}:{wallet?:string}){
 const {signMessageAsync}=useSignMessage(),qc=useQueryClient(),alive=useRef(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const session=useQuery({queryKey:['research-session',wallet],enabled:!!wallet,staleTime:30000,retry:false,refetchOnMount:'always',refetchOnWindowFocus:'always',queryFn:async()=>{
  const r=await fetch('/api/contributors',{cache:'no-store'}),data=await r.json();
  if(!r.ok)throw Error(data.error||'Research sign-in is unavailable.');
  return data.session as Session|null;
 }});
 // Expiry revokes the local presentation too; the server remains authoritative.
 useEffect(()=>{
  if(!session.data?.expiresAt)return;
  const delay=Math.max(0,session.data.expiresAt-Date.now());
  const timer=setTimeout(()=>qc.invalidateQueries({queryKey:['research-session',wallet]}),delay);
  return()=>clearTimeout(timer);
 },[session.data?.expiresAt,qc,wallet]);
 const verified=!!wallet&&!session.isError&&!!session.data&&session.data.wallet===wallet&&session.data.expiresAt>Date.now();
 async function signIn(){
  if(!wallet||busy)return;setBusy(true);setError('');
  try{
   await ensureResearchSignIn(wallet,message=>signMessageAsync({message}),()=>alive.current);
   if(alive.current)await session.refetch();
  }catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setBusy(false);}
 }
 if(!wallet||verified)return null;
 return <section aria-label="Research sign-in" style={{maxWidth:720,width:'100%',margin:'0 auto',padding:'1rem 0',borderBlock:'1px solid var(--color-border)'}}>
  <h2 style={{fontSize:'1rem',margin:'0 0 .5rem'}}>Verify once for Research</h2>
  <p style={{fontSize:'.9rem',color:'var(--color-ink-muted)'}}>Connecting a wallet identifies it. One gas-free signature verifies ownership for research requests and contributor records.</p>
  {session.isPending?<p role="status">Checking your Research session…</p>:<button className="btn-primary" disabled={busy} onClick={signIn}>{busy?'Waiting for wallet…':'Verify wallet for Research'}</button>}
  {(error||session.isError)&&<p role="alert">{error||'Your sign-in session could not be checked. Retry wallet verification.'}</p>}
 </section>;
}
