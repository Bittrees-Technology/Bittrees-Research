import {useState} from 'react';
const labels:Record<string,string>={scope:'Responsibilities',level:'Contribution level',rank:'Recognition rank',start:'Effective from',end:'Effective through',historicalServiceStart:'Historical service',allocationWeight:'Allocation weight'};
const display=(key:string,value:any)=>key==='allocationWeight'?value?.label||'Standard':value||'None / ongoing';
export default function MemoNegotiation({app,memo,own,actor,busy,change,today}:any){
 const [ongoing,setOngoing]=useState(memo?.end===null);
 const pending=app.memoEdits?.some((e:any)=>e.state==='pending');
 return <>
 {pending&&<p role="status">Proposed edits are awaiting a Partner’s review. Signing and issuance are paused.</p>}
 {own&&memo?.status==='draft'&&!memo.consent&&!pending&&<details><summary>Propose changes to this memorandum</summary>
 <p>Your edits will go to a Partner. Once accepted, review and sign the new version. Proposing edits does not change the approved terms or wallet.</p>
 <form onSubmit={e=>{e.preventDefault();const v:any=Object.fromEntries(new FormData(e.currentTarget));v.end=ongoing?null:v.end;change('request_memo_edit',{...v,memoVersion:memo.version,memoHash:memo.hash});}}>
 <div className="cp-grid">{[['level','Contribution level',['Advisor','Part Time','Half Time','Full Time']],['rank','Recognition rank',['Contributor','Senior contributor','Lead contributor']]].map(([name,title,options]:any)=><label className="cp-field" key={name}><span>{title}</span><select name={name} defaultValue={memo[name]}>{options.map((v:string)=><option key={v}>{v}</option>)}</select></label>)}
 <label className="cp-field"><span>Effective from</span><input name="start" type="date" required defaultValue={memo.start}/></label>
 <label className="cp-field"><span>Historical service start (optional)</span><input name="historicalServiceStart" type="date" defaultValue={memo.historicalServiceStart||''}/></label>
 <label className="cp-field"><span>Term</span><select value={ongoing?'ongoing':'fixed'} onChange={e=>setOngoing(e.target.value==='ongoing')}><option value="ongoing">Ongoing</option><option value="fixed">Fixed end date</option></select></label>
 {!ongoing&&<label className="cp-field"><span>Effective through</span><input name="end" type="date" required defaultValue={memo.end||''}/></label>}</div>
 <label className="cp-field"><span>Proposed responsibilities</span><textarea name="scope" required maxLength={2000} defaultValue={memo.scope}/></label>
 <details><summary>Propose an allocation weight</summary><p>Leave blank for the selected level’s standard weight. An exception needs Partner approval and your signature.</p>
 <label className="cp-field"><span>Custom allocation weight</span><input name="allocationWeight" defaultValue={memo.allocationWeight?.custom?memo.allocationWeight.label:''}/></label>
 <label className="cp-field"><span>Reason for individual weight</span><textarea name="allocationReason" maxLength={2000} defaultValue={memo.allocationWeight?.reason||''}/></label></details>
 <label className="cp-field"><span>Reason for proposed edits</span><textarea name="reason" required maxLength={2000}/></label>
 <button disabled={busy}>Send edits for review</button></form></details>}
 {(app.memoEdits||[]).map((edit:any)=>{const base=app.memos.find((m:any)=>m.version===edit.baseVersion);return <section className="cp-panel" key={edit.id}><h4>Proposed edits to version {edit.baseVersion} · {edit.state}</h4><p>{edit.reason}</p>
 <div className="cp-memo-diff">{Object.entries(labels).filter(([key])=>display(key,base?.[key])!==display(key,edit.terms[key])).map(([key,title])=><div key={key}><strong>{title}</strong><p>Previous: {display(key,base?.[key])}</p><p>Proposed: {display(key,edit.terms[key])}</p></div>)}</div>
 {edit.terms.allocationWeight?.custom&&<p>Weight exception reason: {edit.terms.allocationWeight.reason}</p>}
 <small>Requested by {edit.requestedBy} · {edit.requestedAt}</small>
 {edit.reviewedBy&&<p>{edit.decisionReason} — reviewed by {edit.reviewedBy} on {edit.reviewedAt}{edit.acceptedVersion?` · New version ${edit.acceptedVersion} requires your signature.`:''}</p>}
 {actor.canIssue&&edit.state==='pending'&&edit.requestedBy!==actor.id&&<form onSubmit={e=>{e.preventDefault();const button=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement;change('review_memo_edit',{editId:edit.id,decision:button.value,...Object.fromEntries(new FormData(e.currentTarget))});}}><label className="cp-field"><span>Revised effective date</span><input type="date" name="start" required defaultValue={edit.terms.start<today?today:edit.terms.start}/></label><p>The accepted version will use this effective date and require a fresh contributor signature.</p><label className="cp-field"><span>Explanation for the contributor</span><textarea name="reason" required maxLength={2000}/></label><button disabled={busy} value="approve">Accept edits and prepare new version</button><button disabled={busy} value="reject">Decline edits</button></form>}
 {actor.canIssue&&edit.state==='pending'&&edit.requestedBy===actor.id&&<p>Another Partner must review your proposed edits.</p>}
 </section>;})}
 </>;
}
