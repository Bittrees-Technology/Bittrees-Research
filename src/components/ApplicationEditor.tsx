export default function ApplicationEditor({app,busy,change}:any){
 const lists:Record<string,string[]>={region:['EMEA','APAC','LATAM','NORAM']};
 return <details className="cp-panel"><summary>Edit my application</summary><p>Update your application details here. The original signed Base submission is retained. These edits do not change an accepted memorandum, credential, wallet or assigned roles.</p>
 <form key={app.version} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),v:any=Object.fromEntries(f);for(const k of Object.keys(lists))v[k]=f.getAll(k);v.languages=String(v.languages||'').split(',').map(x=>x.trim()).filter(Boolean);change('edit_application',v);}}>
 <label className="cp-field"><span>Name</span><input name="name" required maxLength={120} defaultValue={app.name}/></label>
 {Object.entries(lists).map(([k,options])=><fieldset key={k}><legend>{k==='expertise'?'Expertise':'Region'}</legend>{options.map(value=><label key={value}><input type="checkbox" name={k} value={value} defaultChecked={app[k]?.includes(value)}/> {value} </label>)}</fieldset>)}
 <label className="cp-field"><span>Contribution interests</span><textarea name="specialty" required maxLength={2000} defaultValue={app.specialty}/></label>
 {Object.entries({languages:'Languages (comma-separated)',heardFrom:'How did you hear about Bittrees?',twitter:'X / Twitter',telegram:'Telegram',referrer:'Referrer'}).map(([k,label])=><label className="cp-field" key={k}><span>{label}</span><input name={k} required={k==='heardFrom'} maxLength={k==='expertField'?1000:k==='referrer'?120:160} defaultValue={Array.isArray(app[k])?app[k].join(', '):app[k]||''}/></label>)}
 <button className="cp-primary" disabled={busy}>Save application changes</button></form>
 {app.applicationEdits?.length>0&&<p>Last updated {new Date(app.applicationEdits.at(-1).at).toLocaleString()}.</p>}
 </details>;
}
