import ApplicationEditor from './ApplicationEditor';
import MemoSummary from './MemoSummary';
import MemoNegotiation from './MemoNegotiation';
import {journeySteps,contributorStage,credentialLabel} from '../lib/contributorJourney';
export default function ContributorJourney({app,actor,busy,change,signMemo,executeChain,today,transactionPanel}:any){
 const stage=contributorStage(app),memo=app.memos?.at(-1),pending=app.memoEdits?.some((e:any)=>e.state==='pending');
 const latest=app.reviews?.filter((r:any)=>r.state!=='pending_authority').at(-1);
 const messages:Record<string,string>={submitted:'Your application is in the review queue.',in_review:'A reviewer is considering your application.',needs_info:'Please respond to the reviewer’s question below.',pending_authority:'A recommendation is awaiting a Partner’s decision.',rejected:'Your application was not accepted. The reviewer’s explanation is below.',approved:!memo?'Your application is accepted. A Partner will prepare your memorandum.':memo.status==='issued'?'Your memorandum credential has been issued.':pending?'A Partner is reviewing your proposed edits.':memo.consent?'You have signed. An authorized issuer can issue this version while your authorization is valid.':'Review your memorandum. Propose any changes before signing.'};
 return <section className="cp-journey" aria-label="My contribution">
  <h2>{app.name}</h2>
  <ol className="cp-journey-steps" aria-label="Contributor progress">{journeySteps.map((label,i)=><li key={label} aria-current={i===stage?'step':undefined} data-complete={i<stage}><span>{i+1}</span>{label}</li>)}</ol>
  <p className="cp-next-step" role="status">{messages[app.state]||'Review your contributor record.'}</p>
  {latest?.reason&&<section className="cp-review-message"><h3>Message from your reviewer</h3><p>{latest.reason}</p></section>}
  {app.state==='needs_info'&&<form onSubmit={e=>{e.preventDefault();change('respond_info',{reason:new FormData(e.currentTarget).get('reason')});}}><label className="cp-field"><span>Your response</span><textarea name="reason" required maxLength={2000}/></label><button className="cp-primary" disabled={busy}>Send response</button></form>}
  {transactionPanel}
  {memo&&<><MemoSummary app={app} memo={memo} own actor={actor} busy={busy} signMemo={signMemo} executeChain={executeChain}/><MemoNegotiation app={app} memo={memo} own actor={actor} busy={busy} change={change} today={today}/></>}
  {app.credential&&<section className="cp-credential"><h3>{credentialLabel(app)}</h3><p>Credential #{app.credential.tokenId} belongs to your verified wallet. Roles shows your separately approved project permissions.</p>{app.credential.transactionHash&&<a href={`https://etherscan.io/tx/${app.credential.transactionHash}`} target="_blank" rel="noreferrer">Issuance receipt</a>} <a href="https://roles.bittrees.org/profile">View role profile</a></section>}
  <details><summary>Application details</summary><p>Requested roles: {(app.requestedRoles||[]).join(', ')||'Not supplied'}</p><p>{app.specialty}</p>{app.sourceAttestation?.uid&&<a href={`https://base.easscan.org/attestation/view/${app.sourceAttestation.uid}`} target="_blank" rel="noreferrer">Original Base application</a>}</details>
  <ApplicationEditor app={app} busy={busy} change={change}/>
  <details><summary>Review and memorandum history</summary>{(app.reviews||[]).map((r:any,i:number)=><div key={i}><p>{r.reason}</p><small>{r.at}</small></div>)}{(app.memos||[]).slice(0,-1).reverse().map((m:any)=><details key={m.version}><summary>Memorandum {m.version} — {m.status}</summary><p>{m.scope}</p><p>{m.level} · {m.rank}</p></details>)}</details>
  {!!app.validations?.length&&<details><summary>Confirmed monthly contributions</summary>{app.validations.map((v:any)=><div key={v.id}><h3>{v.month}</h3><p>{v.evidence}</p><small>Confirmed by {v.validatedBy}</small></div>)}</details>}
 </section>;
}
