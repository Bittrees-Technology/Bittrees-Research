import {unlockAndSaveApplications} from '../lib/bulkApplicationUnlock';
import {useEffect,useState,useRef,type ReactNode} from 'react';
import {useWalletClient} from 'wagmi';
import {CONTRIB_COMMUNITY,useTopics} from '../lib/forum';
import {deriveEncKeypair,applicationContentKey,decryptApplication,pubKeyHex} from '../lib/appcrypto';

import {publishEncKey} from '../lib/community';

export default function BaseApplicationSync({wallet,records,onImport,reviewer=false,renderApplications}:{wallet:string;records:any[];renderApplications?:(posts:any[],unlock:(p:any)=>void,busy:boolean)=>ReactNode;reviewer?:boolean;onImport:(uid:string,key:string)=>Promise<void>}){
 const {data:walletClient}=useWalletClient();
 const {data:posts,isLoading,isError}=useTopics(CONTRIB_COMMUNITY,true);
 const [unlocked,setUnlocked]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [batchNotice,setBatchNotice]=useState('');
 const generation=useRef(0),active=useRef(true),currentWallet=useRef(walletClient?.account?.address.toLowerCase());
 currentWallet.current=walletClient?.account?.address.toLowerCase();
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
 useEffect(()=>{generation.current++;setUnlocked(null);setError('');setBatchNotice('');},[wallet,reviewer,walletClient?.account?.address]);
 const own=(posts||[]).filter(p=>(reviewer||p.attester.toLowerCase()===wallet)&&!records.some(a=>a.sourceAttestation?.uid===p.id));
 if(!renderApplications&&!reviewer&&!isLoading&&!isError&&!own.length)return null;
 async function unlock(p:any){setBusy(true);setError('');try{
  if(!walletClient||walletClient.account?.address.toLowerCase()!==wallet)throw Error('Connect your verified wallet to unlock this application.');
  const kp=await deriveEncKeypair(walletClient,wallet as `0x${string}`);
  try{const envelope=JSON.parse(p.body),plaintext=decryptApplication(envelope,wallet as `0x${string}`,kp.secretKey);if(!plaintext)throw Error('This wallet is not an encryption recipient. The applicant can unlock and sync it from their own account.');setUnlocked({wallet,uid:p.id,application:JSON.parse(plaintext),key:applicationContentKey(envelope,wallet as `0x${string}`,kp.secretKey)});}finally{kp.secretKey.fill(0);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function unlockAll(){
  if(!walletClient||currentWallet.current!==wallet){setError('Connect your verified reviewer wallet.');return;}
  const run=++generation.current,isCurrent=()=>active.current&&generation.current===run&&currentWallet.current===wallet;
  setBusy(true);setError('');setUnlocked(null);setBatchNotice('Confirm one encryption signature in your wallet.');
  try {
   const result=await unlockAndSaveApplications({posts:own,wallet:wallet as `0x${string}`,derive:()=>deriveEncKeypair(walletClient,wallet as `0x${string}`),save:onImport,isCurrent,progress:(done,total)=>setBatchNotice(`Saving applications: ${done} of ${total} checked…`)});
   if(isCurrent())setBatchNotice(`${result.saved} saved for future visits. ${result.unavailable} not encrypted for this wallet. ${result.failed} could not be saved${result.failed?' — retry to process the remaining applications':''}.`);
  }catch(e){if(isCurrent()){setError((e as Error).message);setBatchNotice('');}}
  finally{if(active.current)setBusy(false);}
 }
 async function publish(){setBusy(true);setError('');try{
  if(!walletClient||walletClient.account?.address.toLowerCase()!==wallet)throw Error('Connect your verified reviewer wallet.');
  const kp=await deriveEncKeypair(walletClient,wallet as `0x${string}`);
  try{await publishEncKey({walletClient,account:wallet as `0x${string}`,pubkey:pubKeyHex(kp.publicKey)});}finally{kp.secretKey.fill(0);}
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="cp-panel">{!renderApplications&&<><h2>{reviewer?'Base applications awaiting review':'Continue a Base application'}</h2><p>{reviewer?'Unlock an application addressed to your wallet, then add it to the same review queue below. Approval, memorandum edits, acceptance and issuance continue in this workspace.':'Continue from the application you already submitted. Unlock it with your wallet, review it, then sync it into the private contributor record. '}</p></>}
 {reviewer&&<details><summary>Encryption access for future applications</summary><p>Publishing your public encryption key lets future applicants encrypt to you if you hold the required application-access role. It does not unlock older applications or grant review authority.</p><button disabled={busy} onClick={publish}>Publish reviewer encryption key</button></details>}

 {reviewer&&own.length>0&&<div className="cp-bulk-unlock"><button className="cp-primary" disabled={busy||isLoading||isError||currentWallet.current!==wallet} onClick={unlockAll}>{busy?'Unlocking and saving…':'Unlock and save all applications'}</button><p>One signature unlocks applications encrypted for this wallet and saves them in the private review workspace. Saved records reopen on future visits while you remain authorized; other authorized reviewers can also access them. Your signature and private decryption key are never stored. New submissions need a new unlock.</p></div>}
 {batchNotice&&<p role="status" className="cp-notice">{batchNotice}</p>}
 {renderApplications?renderApplications(own,unlock,busy):isLoading?<p>Looking for your applications…</p>:isError?<p>The Base application index is unavailable. Try again shortly.</p>:!own.length?<p>No additional Base applications to import.</p>:own.map(p=>{
 const linked=records.find(a=>a.sourceAttestation?.uid===p.id);return <div key={p.id}><a href={`https://base.easscan.org/attestation/view/${p.id}`} target="_blank" rel="noreferrer">{reviewer?`${p.attester.slice(0,6)}…${p.attester.slice(-4)} · `:'Application · '}{new Date(p.time*1000).toLocaleDateString()}</a>{linked?<p>Synced · {linked.state}. Continue in contributor administration.</p>:<button disabled={busy} onClick={()=>unlock(p)}>Unlock existing application</button>}</div>;
 })}
 {renderApplications&&isLoading&&<p role="status">Loading encrypted applications…</p>}{renderApplications&&isError&&<p role="alert">Encrypted applications could not be loaded. Reload to try again.</p>}
 {unlocked?.wallet===wallet&&<div><h3>{unlocked.application.name}</h3><p>{unlocked.application.specialty}</p><p>Sync shares this application's contents with authorized contributor reviewers. It preserves the Base source and does not accept the application or issue a credential.</p><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onImport(unlocked.uid,unlocked.key);setUnlocked(null);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{reviewer?'Add to contributor review':'Sync application for review and memorandum'}</button><button disabled={busy} onClick={()=>setUnlocked(null)}>Cancel</button></div>}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
