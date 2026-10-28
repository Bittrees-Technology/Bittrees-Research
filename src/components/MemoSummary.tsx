export function memoNextStep(app:any){
 const memo=app.memos?.at(-1);
 if(app.chainOperation?.status==='prepared')return 'Confirm transaction';
 if(app.memoEdits?.some((e:any)=>e.state==='pending'))return 'Review proposed edits';
 if(!memo)return 'Prepare memorandum';
 if(memo.status==='issued')return 'Issued';
 if(app.walletVerification!=='verified')return 'Verify contributor wallet';
 return memo.consent?'Issue credential':'Contributor acknowledgment';
}
export default function MemoSummary({app,memo,own,actor,busy,signMemo,executeChain}:any){
 const expiring=Number(memo.consent?.typedData?.message?.deadline||memo.consent?.message?.deadline||0)>0;
 const pending=app.memoEdits?.some((e:any)=>e.state==='pending'),inFlight=app.chainOperation?.status==='prepared';
 const signable=own&&!pending&&!inFlight&&memo.status==='draft'&&app.walletVerification==='verified';
 return <section className="cp-panel cp-memo-summary" aria-label="Current memorandum">
  <h3>Memorandum of contribution</h3><p className="cp-memo-caption">Version {memo.version} · {memo.status==='issued'?'Issued':memo.consent?'Accepted by contributor':'Ready for contributor review'}</p>
  <dl><div><dt>Contribution level</dt><dd>{memo.level}</dd></div><div><dt>Recognition rank</dt><dd>{memo.rank}</dd></div><div><dt>Term</dt><dd>{memo.start} to {memo.end||'ongoing (no end date)'}</dd></div><div><dt>Recipient wallet</dt><dd className="cp-hash">{memo.wallet||'Not linked yet'}</dd></div></dl>
  <h4>Responsibilities</h4><p className="cp-responsibilities">{memo.scope}</p>
  {memo.allocationWeight&&<><p>Allocation weight: {memo.allocationWeight.label} of the Full Time baseline{memo.allocationWeight.custom?' (individual agreement)':''}.</p>{memo.allocationWeight.custom&&<p>{memo.allocationWeight.reason}</p>}<p>{memo.allocationNotice||'This earlier memorandum needs revised allocation terms before issuance.'}</p></>}
  {memo.historicalServiceStart&&<p>Historical service since {memo.historicalServiceStart}. Credential validity begins with the memorandum term.</p>}

  {memo.status==='draft'&&memo.consent&&<p>Already signed. Issue and confirm this version before preparing an amendment. {expiring?'You may also recover this draft after signature expiry is verified at Ethereum finality.':'Editing a draft cannot cancel a valid signature.'}</p>}
  {signable&&!memo.consent&&<p>Review the terms above, then sign to accept and authorize issuance. This authorization expires after 24 hours. You can propose changes below before signing.</p>}
  {!own&&!memo.consent&&!pending&&!inFlight&&memo.status==='draft'&&<p role="status">Waiting for the contributor to review and sign this memorandum.</p>}
  {actor.canIssue&&memo.consent&&!pending&&!inFlight&&memo.status==='draft'&&<p>The contributor has accepted this memorandum.</p>}
  {signable&&!memo.consent&&<button className="cp-primary" disabled={busy} onClick={signMemo}>Sign memorandum with wallet</button>}
  {actor.canIssue&&!pending&&!inFlight&&memo.consent&&memo.status==='draft'&&<button className="cp-primary" disabled={busy} onClick={()=>executeChain(!app.credential?'issue':['ended','revoked'].includes(app.credential.standing)?'replace':'amend')}>Issue Memorandum of Contribution</button>}
  <details><summary>Signature and verification details</summary><p>Prepared / approved by {memo.issuer}</p><small className="cp-hash">Document fingerprint: {memo.hash}</small>{memo.acknowledgedAt&&<p>Acknowledged on {memo.acknowledgedAt}.</p>}{app.credential&&<p>Issued by {app.credential.issuedBy||'See transaction record'} · <a href={`https://etherscan.io/tx/${app.credential.transactionHash}`} target="_blank" rel="noreferrer">Issuance receipt</a></p>}</details>
  {signable&&memo.consent&&<details><summary>Renew signed acknowledgment</summary><p>Renew only if requested before issuance. The renewed authorization expires after 24 hours; the agreed terms stay the same.</p><button disabled={busy} onClick={signMemo}>Renew memorandum signature</button></details>}
 </section>;
}
