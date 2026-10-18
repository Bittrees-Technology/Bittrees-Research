import {useQuery} from '@tanstack/react-query';

type AuthorityAccess = {configured:boolean;reviewer?:boolean;permissions:string[];roles?:{label:string}[];expiresAt?:number};

/** Navigation is only a hint. Protected controls keep their existing fresh reads.
 * Both observers share a wallet-scoped query, including mutation invalidation. */
export function useAuthorityAccess(address?:string, purpose:'access'|'navigation'='access') {
  const navigation = purpose === 'navigation';
  return useQuery({
    queryKey:['controller-authority',address?.toLowerCase()],
    enabled:!!address,
    staleTime:navigation ? 60000 : 0,
    refetchInterval:navigation ? 60000 : 5000,
    refetchIntervalInBackground:false,
    refetchOnWindowFocus:'always',
    retry:false,
    queryFn:async({signal})=>{
      const r=await fetch('/api/authority-access?address='+address,{signal});
      if(!r.ok)throw Error('Controller authority unavailable');
      return r.json() as Promise<AuthorityAccess>;
    },
  });
}
