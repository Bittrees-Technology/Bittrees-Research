import ApplicationEditor from './ApplicationEditor';
import {NativeRoleStatus} from './NativeRoleStatus';
import {journeySteps,contributorStage} from '../lib/contributorJourney';
export default function ContributorJourney({app,busy,change}:any){
 const stage=contributorStage(app),latest=app.reviews?.filter((r:any)=>r.state!=='pending_authority').at(-1);
 const messages:Record<string,string>={submitted:'Your application is in the review queue.',in_review:'An Executive is reviewing your application.',needs_info:'Please respond to the reviewer’s question below.',pending_authority:'Your application is awaiting an Executive decision.',rejected:'Your application was not accepted. The reviewer’s explanation is below.',approved:'Your application is accepted. Role credential assignment is a separate transaction; acceptance alone does not grant access.'};
 return <section className="cp-journey" aria-label="My contribution"><h2>{app.name}</h2>
 <ol className="cp-journey-steps" aria-label="Contributor progress">{journeySteps.map((label,i)=><li key={label} aria-current={i===stage?'step':undefined} data-complete={i<stage}><span>{i+1}</span>{label}</li>)}</ol>
 <p className="cp-next-step" role="status">{messages[app.state]||'Review your contributor record.'}</p>
 {latest?.reason&&<section className="cp-review-message"><h3>Message from your reviewer</h3><p>{latest.reason}</p></section>}
 {app.state==='needs_info'&&<form onSubmit={e=>{e.preventDefault();change('respond_info',{reason:new FormData(e.currentTarget).get('reason')});}}><label className="cp-field"><span>Your response</span><textarea name="reason" required maxLength={2000}/></label><button className="cp-primary" disabled={busy}>Send response</button></form>}
 <p>Requested roles: {(app.requestedRoles||[]).join(', ')||'Not supplied'}. Requests do not grant permissions.</p>
 {app.walletVerification==='verified'&&<NativeRoleStatus wallet={app.wallet}/>}
 <details><summary>Application details</summary><p>{app.specialty}</p>{app.sourceAttestation?.uid&&<a href={`https://base.easscan.org/attestation/view/${app.sourceAttestation.uid}`} target="_blank" rel="noreferrer">Original Base application</a>}</details>
 <ApplicationEditor app={app} busy={busy} change={change}/>
 <details><summary>Review history</summary>{(app.reviews||[]).map((r:any,i:number)=><div key={i}><p>{r.reason}</p><small>{r.at}</small></div>)}</details>
 </section>;
}
