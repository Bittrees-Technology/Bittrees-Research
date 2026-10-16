import {useState} from 'react';
import {useWalletClient} from 'wagmi';
import {CONTRIB_COMMUNITY,useTopics} from '../lib/forum';
import {deriveEncKeypair,applicationContentKey,decryptApplication} from '../lib/appcrypto';

export default function BaseApplicationSync({wallet,records,onImport}:{wallet:string;records:any[];onImport:(uid:string,key:string)=>Promise<void>}){
 const {data:walletClient}=useWalletClient();
 const {data:posts,isLoading,isError}=useTopics(CONTRIB_COMMUNITY);
 const [unlocked,setUnlocked]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const own=(posts||[]).filter(p=>p.attester.toLowerCase()===wallet&&!records.some(a=>a.sourceAttestation?.uid===p.id));
 if(!isLoading&&!isError&&!own.length)return null;
 async function unlock(p:any){setBusy(true);setError('');try{
  if(!walletClient||walletClient.account?.address.toLowerCase()!==wallet)throw Error('Connect the wallet used to submit this application.');
  const kp=await deriveEncKeypair(walletClient,wallet as `0x${string}`);
  try{const envelope=JSON.parse(p.body),plaintext=decryptApplication(envelope,wallet as `0x${string}`,kp.secretKey);if(!plaintext)throw Error('Application could not be unlocked.');setUnlocked({wallet,uid:p.id,application:JSON.parse(plaintext),key:applicationContentKey(envelope,wallet as `0x${string}`,kp.secretKey)});}finally{kp.secretKey.fill(0);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="cp-panel"><h2>Continue a Base application</h2><p>Continue from the application you already submitted. Unlock it with your wallet, review it, then sync it into the private contributor record. Email is optional.</p>
 {isLoading?<p>Looking for your applications…</p>:isError?<p>The Base application index is unavailable. Try again shortly.</p>:!own.length?<p>No indexed applications found for this wallet.</p>:own.map(p=>{
 const linked=records.find(a=>a.sourceAttestation?.uid===p.id);return <div key={p.id}><a href={`https://base.easscan.org/attestation/view/${p.id}`} target="_blank" rel="noreferrer">Application · {new Date(p.time*1000).toLocaleDateString()}</a>{linked?<p>Synced · {linked.state}. Continue in contributor administration.</p>:<button disabled={busy} onClick={()=>unlock(p)}>Unlock existing application</button>}</div>;
 })}
 {unlocked?.wallet===wallet&&<div><h3>{unlocked.application.name}</h3><p>{unlocked.application.specialty}</p><p>Sync shares this application's contents with authorized contributor reviewers. It preserves the Base source and does not accept the application or issue a credential.</p><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onImport(unlocked.uid,unlocked.key);setUnlocked(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Sync application for review and memorandum</button><button disabled={busy} onClick={()=>setUnlocked(null)}>Cancel</button></div>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
