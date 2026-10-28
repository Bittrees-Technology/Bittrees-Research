import {usePublicClient} from 'wagmi';
import {useQuery} from '@tanstack/react-query';
import {isAddress} from 'viem';
import {readManagedCredentials} from '../lib/researchCredentialManagement';
import {RESEARCH_ROLE_NAMES} from '../../shared/research-role-credentials.mjs';

/** Only current published Research contracts establish credential status. */
export function NativeRoleStatus({wallet}:{wallet:string}){
 const client=usePublicClient({chainId:1});
 const query=useQuery({queryKey:['research-credentials',wallet],enabled:!!client&&isAddress(wallet),retry:false,staleTime:30000,queryFn:()=>readManagedCredentials(client!,wallet)});
 return <section className="cp-panel" aria-label="Research role credentials"><h3>Research role credentials</h3>
 <p>{RESEARCH_ROLE_NAMES.join(' · ')}. Executive is the Research admin role.</p>
 {query.isPending?<p>Checking current role credentials…</p>:query.isError?<p role="alert">Credential verification unavailable. No role state can be confirmed.</p>:<><p>Checked at Ethereum block {query.data?.blockNumber}. Validity includes the parent membership.</p><ul>{query.data?.records.filter(r=>r.role).map(r=><li key={r.id}>{r.role} #{r.id} · Membership #{r.parentId} · {r.burned?'Burned':r.revoked?'Revoked':r.valid?'Active':'Inactive'}</li>)}</ul>{!query.data?.records.some(r=>r.role)&&<p>No Research role credentials found.</p>}</>}
 <button disabled={query.isFetching||!client||!isAddress(wallet)} onClick={()=>void query.refetch()}>Refresh role credentials</button>
 </section>;
}
