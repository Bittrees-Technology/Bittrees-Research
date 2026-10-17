import {useCommunity,createCredentialDefinition,type CredentialDefinition} from '@/lib/community';
import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAccount,useChainId,usePublicClient,useSendTransaction,useWalletClient} from 'wagmi';
import {isAddress,keccak256,toBytes,type Address} from 'viem';
import {useMembershipStatus} from '@/hooks/membership/useMembershipStatus';
import {AUTHORITIES,RESEARCHER_TYPE,credentialReceiptMatches,prepareCredential,readManagedCredentials,safeCredentialBatch,type CredentialAction,type CredentialPlan} from '@/lib/researchCredentialManagement';

/** Preparing a call grants nothing. Only the authorized Safe can execute it. */
export function ResearchCredentialRoles() {
 const [flow,setFlow]=useState<'create'|'assign'>('assign');
 const {data:catalog}=useCommunity();
 const definitions:CredentialDefinition[]=[{label:'Researcher',identifier:'research.role.researcher.v1',credentialType:RESEARCHER_TYPE,metadataURI:'https://research.bittrees.org/credentials/researcher.json'},...(catalog?.credentialdefs||[])];
 const [selected,setSelected]=useState('research.role.researcher.v1');
 const definition=definitions.find(d=>d.identifier===selected)||definitions[0];
 const catalogReady=Array.isArray(catalog?.credentialdefs),selectionExists=definitions.some(d=>d.identifier===selected);
 const {address}=useAccount(),chainId=useChainId(),client=usePublicClient({chainId:1});
 const {sendTransactionAsync}=useSendTransaction(),qc=useQueryClient();const {sessionRevision}=useMembershipStatus();
 const [member,setMember]=useState(''),[parentId,setParent]=useState(''),[uri,setURI]=useState('https://research.bittrees.org/credentials/researcher.json'),[until,setUntil]=useState('');
 const [authority,setAuthority]=useState<Address>(AUTHORITIES[0]),[plan,setPlan]=useState<CredentialPlan|null>(null),[action,setAction]=useState<CredentialAction|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[hash,setHash]=useState('');
 const scope=JSON.stringify([address,chainId,sessionRevision,member,parentId,uri,until,authority,flow,definition.credentialType,catalogReady,selectionExists]);const current=useRef(scope);current.current=scope;
 useEffect(()=>{setPlan(null);setAction(null);setMessage('');setHash('');},[scope]);
 const target=member.trim();
 const query=useQuery({queryKey:['managed-research-credentials',target],enabled:!!client&&isAddress(target),retry:false,refetchInterval:30000,queryFn:()=>readManagedCredentials(client!,target)});
 async function prepare(next:CredentialAction){
  if(!client||busy||(next.kind==='issue'&&(!catalogReady||!selectionExists)))return;const captured=scope;setBusy(true);setMessage('Verifying membership, credential and Safe authority…');setPlan(null);setHash('');
  try{const prepared=await prepareCredential(client,next,authority);if(current.current!==captured)return;setPlan(prepared);setAction(next);setMessage('Transaction prepared. Role eligibility changes only after Safe execution and a successful Roles verification.');}
  catch(e){if(current.current===captured)setMessage(e instanceof Error && !e.message.includes('\n') && !e.message.includes('http')?e.message:'Could not prepare the credential transaction. Check the wallet, membership and current chain data.');}
  finally{setBusy(false);}
 }
 function download(){if(!plan)return;const url=URL.createObjectURL(new Blob([JSON.stringify(safeCredentialBatch(plan),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='research-credential-safe-transaction.json';a.click();URL.revokeObjectURL(url);}
 async function execute(){
  if(!client||!plan||!action||busy||(action.kind==='issue'&&(!catalogReady||!selectionExists))||chainId!==1||address?.toLowerCase()!==authority.toLowerCase())return;
  const captured=scope;setBusy(true);setMessage('Rechecking the prepared transaction…');
  try{
   const fresh=await prepareCredential(client,action,authority);if(current.current!==captured)throw Error('Session changed');
   if(fresh.data!==plan.data)throw Error('Transaction changed');
   const tx=await sendTransactionAsync({to:fresh.to,data:fresh.data,value:0n,chainId:1});if(current.current!==captured)return;
   setHash(tx);setMessage('Waiting for the Safe transaction to confirm.');
   const receipt=await client.waitForTransactionReceipt({hash:tx,timeout:120000});if(current.current!==captured)return;
   if(!credentialReceiptMatches(fresh,receipt))throw Error('Credential execution was not confirmed');
   setPlan(null);setAction(null);await query.refetch();
   await Promise.all([qc.invalidateQueries({queryKey:['controller-authority']}),qc.invalidateQueries({queryKey:['community']}),qc.invalidateQueries({queryKey:['research-credentials']})]);
   setMessage('Transaction confirmed. Current chain records refreshed below. Open Roles and refresh its credential-derived assignments to verify effective access.');
  }catch{if(current.current===captured)setMessage('Execution was not confirmed. Check the Safe transaction history before retrying.');}
  finally{setBusy(false);}
 }
 const rolesURL='https://roles.bittrees.org/role-management?project=research';
 return <section className="card" style={{display:'grid',gap:'1rem'}} aria-label="Credential-backed Research roles">
  <h2>Credential-backed Research roles</h2>
  <p>Create a reusable role credential definition, then assign it to an active membership. Roles checks that credential and its parent membership for current eligibility. Existing independently approved role grants stay separate.</p>
  <p><a href={rolesURL} target="_blank" rel="noreferrer">Manage and verify roles in Roles ↗</a></p>
  <nav aria-label="Credential workflows" style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   <button disabled={busy} aria-pressed={flow==='create'} onClick={()=>setFlow('create')}>Create a role credential</button>
   <button disabled={busy} aria-pressed={flow==='assign'} onClick={()=>setFlow('assign')}>Assign a role credential</button>
  </nav>
  {flow==='create'?<CredentialDefinitionForm onCreated={()=>{void qc.invalidateQueries({queryKey:['community']});setFlow('assign');}}/>:<section aria-label="Assign a role credential" style={{display:'grid',gap:'1rem'}}>
  <h3>Assign a role credential</h3>
  {(!catalogReady||!selectionExists)&&<p role="alert">Credential catalog unavailable or the selected definition is missing. Refresh before assigning.</p>}
  <p>Select an existing definition and the member who should receive it. Assignment creates a new credential token through the authorized Safe.</p>
  <label>Role credential<select style={field} value={definition.identifier} disabled={busy} onChange={e=>{const d=definitions.find(d=>d.identifier===e.target.value)!;setSelected(d.identifier);setURI(d.metadataURI);}}>{definitions.map(d=><option key={d.identifier} value={d.identifier}>{d.label}</option>)}</select></label>
  <p>{definition.credentialType===RESEARCHER_TYPE?'Researcher is mapped in Roles.':'This type has no approved Roles permission mapping. Issuing it does not automatically grant access.'}</p>
  <details><summary>Credential definition</summary><p>{definition.identifier}</p><code style={{overflowWrap:'anywhere'}}>{definition.credentialType}</code></details>
  <label>Member wallet<input style={field} value={member} disabled={busy} onChange={e=>setMember(e.target.value)} placeholder="0x…" autoComplete="off"/></label>
  {isAddress(target)&&<div>
   <h3>Current credential assignments</h3>
   {query.isPending?<p>Checking current credentials…</p>:query.isError?<p role="alert">Credential verification unavailable. No role state can be confirmed.</p>:<>
    <p>Read at block {query.data?.blockNumber}. {query.data?.records.length===0?'No credentials found.':''}</p>
    <ul>{query.data?.records.map(r=><li key={r.id} style={{marginBottom:'0.75rem'}}>#{r.id} · Membership #{r.parentId} · {r.role||definitions.find(d=>d.credentialType===r.type)?.label||'Unmapped credential'} · {r.burned?'Burned':r.revoked?'Revoked':r.valid?'Valid':'Inactive'}
     {!r.burned&&<div><button disabled={busy} onClick={()=>void prepare({kind:r.revoked?'restore':'revoke',member:target,credentialId:r.id,credentialType:r.type as `0x${string}`})}>Prepare {r.revoked?'restoration':'revocation'}</button></div>}
    </li>)}</ul>
   </>}
   <button disabled={query.isFetching||busy} onClick={()=>void query.refetch()}>Refresh credential status</button>
  </div>}
  <h3>Assignment details</h3>
  <label>Active membership token ID<input style={field} inputMode="numeric" value={parentId} disabled={busy} onChange={e=>setParent(e.target.value)}/></label>
  <label>Public credential metadata URL<input style={field} type="url" placeholder="https://…" value={uri} disabled={busy} onChange={e=>setURI(e.target.value)}/></label>
  <p>Metadata is public and descriptive. It does not grant permissions.</p>
  <label>Credential expiry (optional, your local time)<input style={field} type="datetime-local" value={until} disabled={busy} onChange={e=>setUntil(e.target.value)}/></label>
  <p>Without a separate expiry, validity still requires an active membership. Revocation, burning and membership expiry remove credential-derived eligibility.</p>
  <label>Issuing Safe<select style={field} value={authority} disabled={busy} onChange={e=>setAuthority(e.target.value as Address)}><option value={AUTHORITIES[0]}>research.bittrees.eth</option><option value={AUTHORITIES[1]}>bittrees.eth</option></select></label>
  <button className="btn-primary" disabled={busy||!catalogReady||!selectionExists||!isAddress(target)||!parentId||!uri} onClick={()=>void prepare({kind:'issue',member:target,parentId,metadataURI:uri.trim(),validUntil:until,credentialType:definition.credentialType})}>Prepare credential issuance</button>
  {plan&&<section style={{display:'grid',gap:12}} aria-label="Prepared credential transaction">
   <h3>Review Safe transaction</h3><p>{plan.summary}</p><p>Ethereum · 0 ETH · CALL · Safe {plan.authority}</p>
   <button onClick={download} disabled={busy}>Download Safe transaction</button>
   <a href="https://tld.bittrees.org" target="_blank" rel="noreferrer">Open TLD for Safe approval ↗</a>
   <details><summary>Transaction destination and calldata</summary><p style={{overflowWrap:'anywhere'}}>{plan.to}</p><code style={{overflowWrap:'anywhere'}}>{plan.data}</code></details>
   {address?.toLowerCase()===authority.toLowerCase()&&chainId===1?<button className="btn-primary" disabled={busy} onClick={()=>void execute()}>Submit with connected Safe</button>:<p>Use the selected Safe in TLD, or connect that Safe on Ethereum here. A signer wallet alone cannot execute as the Safe.</p>}
  </section>}
  </section>}
  {message&&<p role="status">{message}</p>}{hash&&<a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
 </section>;
}
const field={display:'block',width:'100%',boxSizing:'border-box' as const,padding:'0.6rem',marginTop:'0.4rem',border:'1px solid var(--color-border)',borderRadius:2,background:'var(--color-bg)'};

function CredentialDefinitionForm({onCreated}:{onCreated:()=>void}){
 const {address}=useAccount(),{data:walletClient}=useWalletClient();
 const [label,setLabel]=useState(''),[identifier,setIdentifier]=useState(''),[uri,setURI]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const valid=/^research\.role\.[a-z][a-z0-9-]{0,63}\.v[1-9][0-9]{0,3}$/.test(identifier);
 async function save(e:React.FormEvent){e.preventDefault();if(!address||!walletClient||busy||!valid)return;setBusy(true);setError('');
  try{await createCredentialDefinition({walletClient,account:address,label:label.trim(),identifier,metadataURI:uri.trim()});onCreated();}
  catch(e){setError(e instanceof Error?e.message:'Definition could not be saved.');}finally{setBusy(false);}
 }
 return <form onSubmit={save} aria-label="Create a role credential" style={{display:'grid',gap:'1rem'}}>
  <h3>Create a role credential</h3>
  <p>Save a reusable definition in Research’s shared catalog. This requires an authorized wallet signature, not an Ethereum transaction. It does not issue a token or grant Roles permissions.</p>
  <label>Credential name<input style={field} required maxLength={80} value={label} disabled={busy} onChange={e=>setLabel(e.target.value)}/></label>
  <label>Credential identifier<input style={field} required value={identifier} disabled={busy} placeholder="research.role.editor.v1" onChange={e=>setIdentifier(e.target.value.trim())}/></label>
  <p>Use a unique versioned identifier such as research.role.editor.v1. Definitions cannot replace an existing type.</p>
  {valid&&<code style={{overflowWrap:'anywhere'}}>{keccak256(toBytes(identifier))}</code>}
  <label>Definition metadata URL<input style={field} required type="url" value={uri} disabled={busy} placeholder="https://…" onChange={e=>setURI(e.target.value)}/></label>
  <p>Provide a publicly hosted HTTPS JSON metadata URL. This step saves its reference; it does not upload or publish a document.</p>
  <button className="btn-primary" disabled={busy||!address||!walletClient||!valid||!label.trim()||!uri.trim()}>{busy?'Saving definition…':'Create credential definition'}</button>
  {error&&<p role="alert">{error}</p>}
 </form>;
}
