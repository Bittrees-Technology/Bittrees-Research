import {useAuthorityAccess} from './authorityAccess';


/** Only current server-verified policy and native credentials authorize controls. */
export type AdminLevel = "full" | "moderation" | "credentials" | "none";

function adminLevel(permissions: string[]): AdminLevel {
  return permissions.includes('community.roles.manage') || permissions.includes('rooms.manage') ? 'full'
    : permissions.includes('community.moderation.manage') ? 'moderation'
    : permissions.some(p => ['research.credentials.define', 'research.credentials.assign'].includes(p)) ? 'credentials' : 'none';
}

/** Navigation only: retain the last verified link while refreshing. A new denial
 * removes it. This must never authorize controls, reads, or writes. Wallet-specific
 * query keys prevent carrying the link into another account. */
export function useAdminNavigation(address?: string): boolean {
  const policy = useAuthorityAccess(address, 'navigation');
  return !!address && policy.data?.configured === true && adminLevel(policy.data.permissions) !== 'none';
}

export function useAdminAccess(address?: string): AdminLevel {
  const policy=useAuthorityAccess(address);
  if (!address) return "none";
  {
    if(policy.isError || !policy.data?.configured || (policy.data.expiresAt??0)<=Date.now())return "none";
    if(policy.data.configured)return adminLevel(policy.data.permissions);
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
