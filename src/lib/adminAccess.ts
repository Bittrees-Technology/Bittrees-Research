import {useAuthorityAccess} from './authorityAccess';


/** Only current server-verified policy and native credentials authorize controls. */
export type AdminLevel = "full" | "moderation" | "credentials" | "none";

export function useAdminAccess(address?: string): AdminLevel {
  const policy=useAuthorityAccess(address);
  if (!address) return "none";
  {
    if(policy.isError || !policy.data?.configured || (policy.data.expiresAt??0)<=Date.now())return "none";
    if(policy.data.configured)return policy.data.permissions.includes('community.roles.manage')||policy.data.permissions.includes('rooms.manage')?'full':policy.data.permissions.includes('community.moderation.manage')?'moderation':policy.data.permissions.some(p=>['research.credentials.define','research.credentials.assign'].includes(p))?'credentials':'none';
  }
  return "none";
}

export function useIsAdmin(address?: string): boolean {
  return useAdminAccess(address) === "full";
}

/** Any connected member may propose a community room (admins approve). */
export function useCanProposeRoom(address?: string): boolean {
  const policy=useAuthorityAccess(address);
  return !policy.isError&&policy.data?.configured===true&&(policy.data.expiresAt??0)>Date.now()&&policy.data.permissions.includes("rooms.propose");
}
