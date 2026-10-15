import {useEffect,useState} from 'react';
import {usePublicClient} from 'wagmi';
import {mainnet} from 'viem/chains';
import {readEnsProfile,type SharedEnsProfile} from '../../shared/ens-profile.mjs';
export function SharedProfileDetails({address}:{address:string}){
 const [open,setOpen]=useState(false);
 return <details onToggle={e=>setOpen(e.currentTarget.open)} style={{fontSize:'0.8rem'}}><summary style={{cursor:'pointer'}}>Shared profile</summary>{open&&<Profile address={address}/>}</details>;
}
function Profile({address}:{address:string}){
 const client=usePublicClient({chainId:mainnet.id}),[data,setData]=useState<SharedEnsProfile|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true,generation=0;const load=async()=>{const current=++generation;setData(null);setFailed(false);if(!client||document.hidden)return;try{const result=await readEnsProfile(address.toLowerCase(),client);if(active&&generation===current)setData(result);}catch{if(active&&generation===current)setFailed(true);}};void load();const timer=setInterval(()=>void load(),45000);const refresh=()=>void load();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{active=false;++generation;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[address,client]);
 return <div style={{width:'min(300px,70vw)',padding:'12px 0',whiteSpace:'normal',overflowWrap:'anywhere'}}>{!data?<p role="status">{failed?'Profile unavailable.':'Checking public profile…'}</p>:data.status==='current'?<><strong>{data.name}</strong><p>{data.bio||'No public bio set.'}</p>{data.website&&<p><a href={data.website} target="_blank" rel="noopener noreferrer">{data.website}</a></p>}<a href={data.editUrl} target="_blank" rel="noopener noreferrer">View profile in ENS</a><p>Public ENS records shared by this wallet. Profile details never grant permissions.</p></>:<p>No verified ENS profile for this wallet.</p>}<small>{address}</small></div>;
}
