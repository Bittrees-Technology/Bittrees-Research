import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {useQueryClient} from '@tanstack/react-query';
import {ensureResearchSignIn} from '../lib/researchSignIn';
import {useResearchRegistrySession} from '../lib/researchRegistryAccess';

/** The member app mounts only after matching the existing verified server session.
 * Every private registry response also checks membership on the server. */
export function ResearchPrivateSession({children}:{children:ReactNode}){
 const {address}=useAccount(),{signMessageAsync}=useSignMessage(),session=useResearchRegistrySession(),client=useQueryClient();
 const current=useRef(address);current.current=address;
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(!session.ready){
   void client.cancelQueries({queryKey:['community']});
   void client.cancelQueries({queryKey:['room-registry']});
   client.removeQueries({queryKey:['community']});
   client.removeQueries({queryKey:['room-registry']});
  }
 },[session.ready,client]);
 async function verify(){
  if(!address||busy)return;setBusy(true);setError('');const wallet=address;
  try{
   await ensureResearchSignIn(wallet,message=>signMessageAsync({message}),()=>current.current===wallet);
   if(current.current===wallet)await session.refetch();
  }catch(e){if(current.current===wallet)setError((e as Error).message);}
  finally{setBusy(false);}
 }
 if(session.ready)return children;
 return <main style={{maxWidth:'640px',margin:'3rem auto',padding:'1.5rem'}}>
  <h1>Open your private Research workspace</h1>
  <p>Verify wallet ownership once for Research. Existing verified sessions are reused. Member data is checked on the server before it is returned.</p>
  {session.isPending?<p role="status">Checking your Research session…</p>:<button className="btn-primary" disabled={!address||busy} onClick={verify}>{busy?'Waiting for wallet…':'Verify wallet and continue'}</button>}
  {(error||session.error)&&<p role="alert">{error||session.error?.message}</p>}
 </main>;
}
