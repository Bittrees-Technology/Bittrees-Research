import {useQuery} from '@tanstack/react-query';
import {useAccount} from 'wagmi';

type Session={wallet:string;expiresAt:number};

/** A connected wallet and client-side membership display are not server proof. */
export function useResearchRegistrySession(){
 const {address}=useAccount(),wallet=address?.toLowerCase();
 const query=useQuery({
  queryKey:['research-registry-session',wallet],enabled:!!wallet,gcTime:0,staleTime:0,retry:false,
  refetchInterval:30000,refetchIntervalInBackground:false,refetchOnWindowFocus:'always',
  queryFn:async({signal})=>{
   const response=await fetch('/api/contributors',{cache:'no-store',signal}),data=await response.json();
   if(!response.ok)throw Error(data.error||'Research session could not be checked.');
   const session=data.session as Session|null;
   return session&&session.wallet?.toLowerCase()===wallet&&Number.isFinite(session.expiresAt)&&session.expiresAt>Date.now()?session:null;
  },
 });
 const ready=!!wallet&&query.isSuccess&&!query.isError&&query.data?.wallet?.toLowerCase()===wallet&&query.data.expiresAt>Date.now();
 return {...query,wallet,ready};
}

export async function fetchResearchRegistry(url:string,wallet:string,signal?:AbortSignal){
 const response=await fetch(url,{cache:'no-store',signal,headers:{'x-research-wallet':wallet.toLowerCase()}});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Research member data could not be verified.');
 return data;
}
