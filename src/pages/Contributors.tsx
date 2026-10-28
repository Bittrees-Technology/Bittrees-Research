import ContributorJourney from '../components/ContributorJourney';
import {ResearchCredentialRoles} from '../components/ResearchCredentialRoles';
import {NativeRoleStatus} from '../components/NativeRoleStatus';
import {useAuthorityAccess} from '../lib/authorityAccess';
import {ensureResearchSignIn} from '../lib/researchSignIn';
import {ConnectButton} from '@rainbow-me/rainbowkit';
import ContributorSheet from '../components/ContributorSheet';
import Contribute from './Contribute';
import BaseApplicationSync from '../components/BaseApplicationSync';
import {useEffect,useState,useRef} from 'react';
import {Link} from 'react-router';
import {useAccount,useSignMessage} from 'wagmi';
import './contributors.css';
const status=(v:string)=>({submitted:'New application',in_review:'In review',needs_info:'Information requested',pending_authority:'Executive decision needed',approved:'Accepted',rejected:'Not accepted'}[v]||v);
const formValues=(form:HTMLFormElement)=>Object.fromEntries(new FormData(form));
export default function Contributors({apply=false,embedded=false}:{apply?:boolean;embedded?:boolean}){
 const [session,setSession]=useState<any>(undefined);
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[workspaceTab,setTab]=useState('Applications');
 const {address}=useAccount(),{signMessageAsync}=useSignMessage();
 const tab=data?.persona?.canReview?workspaceTab:'My contribution';
 useEffect(()=>{if(!data?.intakes?.some((i:any)=>i.status==='waiting_finality')||!session?.csrf)return;let active=true;const generation=readVersion.current;const timer=setInterval(()=>{if(document.visibilityState!=='visible')return;call({action:'list'}).then(result=>{if(active&&generation===readVersion.current)setData(result);}).catch(e=>{if(active&&generation===readVersion.current){setData(null);setError(e.message);}});},60000);return()=>{active=false;clearInterval(timer);};},[data?.intakes,session?.csrf]);
 const hadWallet=useRef(false);if(address)hadWallet.current=true;
 const currentWallet=useRef(address);currentWallet.current=address;
 const alive=useRef(true),readVersion=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;readVersion.current++;};},[]);
 async function call(body:any,csrf=session?.csrf){const requestWallet=currentWallet.current;const r=await fetch('/api/contributors',{method:'POST',headers:{'content-type':'application/json',...(csrf?{'x-contributor-csrf':csrf}:{})},body:JSON.stringify(body)});const result=await r.json();if(!alive.current||currentWallet.current!==requestWallet)throw Error('Wallet changed. Reload the current contributor session.');if(!r.ok)throw Error(result.error||'Request failed.');return result;}
 async function refresh(){const version=++readVersion.current,wallet=address;const current=()=>alive.current&&version===readVersion.current&&currentWallet.current===wallet;const r=await fetch('/api/contributors',{cache:'no-store'});const s=await r.json();if(!current())return;if(!r.ok){setData(null);throw Error(s.error);}setSession(s.session);if(s.session&&(!wallet||s.session.wallet?.toLowerCase()===wallet.toLowerCase())){try{const next=await call({action:'list'},s.session.csrf);if(current())setData(next);}catch(e){if(current())setData(null);throw e;}}else setData(null);}
 useEffect(()=>{const restore=()=>{refresh().catch(e=>setError(e.message));};restore();window.addEventListener('focus',restore);return()=>window.removeEventListener('focus',restore);},[address]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const walletMismatch=!!(session?.wallet&&((address&&address.toLowerCase()!==session.wallet.toLowerCase())||(!address&&hadWallet.current)));
 const shared=useAuthorityAccess(address);
 const permissions=!shared.isError&&shared.data?.configured&&(shared.data.expiresAt??0)>Date.now()?shared.data.permissions:[];
 const queue=(data?.applications||[]).filter((a:any)=>tab==='My contribution'?a.identity===data?.persona?.id:tab==='Directory'?a.state==='approved':a.state!=='approved');
 const app=queue.find((a:any)=>a.id===selected)||(tab==='My contribution'?queue[0]:null),actor=data?.persona;
 async function change(action:string,values:any={}){if(!app)return;await run(async()=>{const next=await call({action:'review',id:app.id,change:{action,expectedVersion:app.version,...values}});setData(next);if(action==='approve'&&next.applications.find((a:any)=>a.id===app.id)?.state==='approved'){setTab('Directory');setNotice('Application accepted. Assign a role credential separately below.');}else setNotice(action==='edit_application'?'Application changes saved.':'Saved.');});}
 async function walletSignIn(){await run(async()=>{if(!address)throw Error('Connect your wallet.');readVersion.current++;await ensureResearchSignIn(address,message=>signMessageAsync({message}),()=>alive.current&&currentWallet.current===address);if(alive.current&&currentWallet.current===address)await refresh();});}
 if(apply)return <Contribute/>;
 return <section className="cp" data-insights-ignore="true">
 {!embedded&&<nav>{actor?.canReview&&<Link to="/admin">Admin home</Link>}<Link to="/contribute">Apply to contribute</Link></nav>}
 <header>{embedded?<h2>Contributor applications</h2>:<h1>{actor?.canReview?'Contributors':'My contribution'}</h1>}<p>{actor?.canReview?'Review member applications, then assign Research role credentials. Executive is the Research admin role.':'Follow your application and Research role credentials.'}</p></header>
 {error&&<div role="alert" className="cp-error">{error}<button onClick={()=>run(refresh)} disabled={busy}>Retry</button></div>}{notice&&<p role="status" className="cp-notice">{notice}</p>}
 {session===undefined&&!error&&<p role="status">Checking your contributor session…</p>}
 {(session===null||walletMismatch)&&<section className="cp-access"><h3>{address?'Wallet connected':'Connect your wallet'}</h3>{address?<><p>{walletMismatch?'Your connected wallet differs from the saved session. Verify this wallet to switch accounts.':'Verify ownership once for Research member features and applications. Your Research session is reused across these pages.'}</p><button className="cp-primary" disabled={busy} onClick={walletSignIn}>{busy?'Waiting for wallet…':'Verify wallet and continue'}</button></>:<><p>Use the wallet that submitted your application, or your authorized Executive wallet.</p><ConnectButton showBalance={false}/></>}</section>}
 {session&&!walletMismatch&&data&&<>
 <nav className="cp-tabs" aria-label="Contributor workspace">{(actor.canReview?['Applications','Directory',...(data.applications.some((a:any)=>a.identity===actor.id)?['My contribution']:[])]:['My contribution']).map(t=><button key={t} aria-current={t===tab?'page':undefined} onClick={()=>{setTab(t);setSelected('');setSearch('');}}>{t}</button>)}</nav>
 {data.intakes?.length>0&&<div className="cp-intakes" role="status">{data.intakes.map((i:any)=><p key={i.uid}>{i.wallet===session.wallet?'Your application':i.wallet.slice(0,6)+'…'+i.wallet.slice(-4)}: {i.status==='waiting_finality'?'waiting for Base finality; review intake continues automatically while this workspace is open.':'Unlock the existing submission below to finish intake.'}</p>)}</div>}
 <div className={actor.canReview&&selected?'cp-review-layout':''}>
 {tab!=='Directory'&&<BaseApplicationSync key={session.wallet} wallet={session.wallet} reviewer={actor.canReview} renderApplications={actor.canReview?(posts,unlock,loading)=><ContributorSheet records={queue} pending={posts} unlock={unlock} busy={loading} selected={selected} onSelect={setSelected} search={search} onSearch={setSearch}/>:undefined} records={[...data.applications,...(data.intakes||[]).filter((i:any)=>i.status==='waiting_finality').map((i:any)=>({sourceAttestation:{uid:i.uid}}))]} onImport={async(uid,key)=>{const next=await call({action:actor.canReview?'import_base_review':'import_base',uid,contentKey:key});setData(next);setSelected(actor.canReview?'':next.applications.find((a:any)=>a.sourceAttestation?.uid===uid)?.id||'');setNotice('Application ready for review.');}}/>}
 {actor.canReview&&tab==='Directory'&&<ContributorSheet directory records={queue} selected={selected} onSelect={setSelected} search={search} onSearch={setSearch}/>}
 <div className="cp-workspace cp-single">
 {app?tab==='My contribution'?<ContributorJourney app={app} busy={busy} change={change}/>:<article key={app.id}>
 <h2>{app.name}</h2><p>{status(app.state)} · {app.project}</p>
 <p>Requested roles: {(app.requestedRoles||[]).join(', ')||'Not supplied'}</p><h3>Contribution interests</h3><p>{app.specialty}</p>
 {app.sourceAttestation&&<p>Source: <a href={`https://base.easscan.org/attestation/view/${app.sourceAttestation.uid}`} target="_blank" rel="noreferrer">Base application</a></p>}
 <details><summary>Contact and application details</summary><dl>{['email','twitter','telegram','region','languages','heardFrom','referrer','wallet','walletVerification'].map(k=><div key={k}><dt>{k.replace(/([A-Z])/g,' $1')}</dt><dd>{Array.isArray(app[k])?app[k].join(', '):app[k]||'Not supplied'}</dd></div>)}</dl></details>
 {actor.canReview&&!['approved','rejected'].includes(app.state)&&<form onSubmit={e=>{e.preventDefault();change(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value,formValues(e.currentTarget));}}><label className="cp-field"><span>Contributor-facing explanation</span><textarea name="reason" required maxLength={2000}/></label><label className="cp-field"><span>Private staff note (optional)</span><textarea name="privateNote" maxLength={2000}/></label>{['needs_info','pending_authority'].includes(app.state)&&<button value="resume_review" disabled={busy}>Resume review</button>}{['submitted','in_review','pending_authority'].includes(app.state)&&<><button className="cp-primary" value="approve" disabled={busy||!actor.canDecide}>Accept application</button><button value="reject" disabled={busy||!actor.canDecide}>Reject application</button><button value="request_info" disabled={busy}>Request information</button></>}</form>}
 <details><summary>Decision history</summary>{(app.reviews||[]).map((r:any,i:number)=><div key={i}><strong>{status(r.state)}</strong><p>{r.reason}</p>{r.privateNote&&<p>Private note: {r.privateNote}</p>}<small>{r.at}</small></div>)}</details>
 {app.walletVerification==='verified'&&<NativeRoleStatus wallet={app.wallet}/>}
 {app.state==='approved'&&<><p>Acceptance does not issue credentials or grant access. An active membership is required for every assignment. Only primary administrators can issue Executive credentials.</p>{app.walletVerification!=='verified'?<p>The applicant must verify ownership of their wallet before credential assignment.</p>:actor.canIssue&&permissions.includes('research.credentials.assign')?<ResearchCredentialRoles key={app.id} initialMember={app.wallet} initialRole={app.requestedRoles?.[0]} canAssign canManage={permissions.includes('community.roles.manage')}/>:<Link to="/admin?tab=roles">Open role credential management</Link>}</>}
 </article>:<p>{tab==='My contribution'?data.intakes?.some((i:any)=>i.status==='waiting_finality')?'Your submission is recorded. It will appear here after finality is verified.':'No application is linked yet. Unlock an existing submission above, or apply to contribute.':queue.length?'Select an application to review.':tab==='Directory'?'No accepted contributors yet.':'No applications awaiting review.'}</p>}
 </div></div></>}
 </section>;
}
