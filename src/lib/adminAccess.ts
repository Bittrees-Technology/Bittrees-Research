import {useAuthorityAccess} from './authorityAccess';
import { useUserRoles } from "./community";

/** Current Roles permissions gate each admin workflow; legacy access applies only before enrollment. */
export const SUPER_ADMIN = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f"; // executive — always full access
const FULL_ROLE_RE = /^executive$/i;
const MOD_ROLE_RE = /^assistant$/i;

export type AdminLevel = "full" | "moderation" | "credentials" | "none";

export function useAdminAccess(address?: string): AdminLevel {
  const roles = useUserRoles(address);
  const policy=useAuthorityAccess(address);
  if (!address) return "none";
  {
    if(policy.isError || !policy.data || (policy.data.configured && (policy.data.expiresAt??0)<=Date.now()))return "none";
    if(policy.data.configured)return policy.data.permissions.includes('community.roles.manage')||policy.data.permissions.includes('rooms.manage')?'full':policy.data.permissions.includes('community.moderation.manage')?'moderation':policy.data.permissions.some(p=>['research.credentials.define','research.credentials.assign'].includes(p))?'credentials':'none';
  }
  if (address.toLowerCase() === SUPER_ADMIN || roles.some((r) => FULL_ROLE_RE.test(r.label))) return "full";
  if (roles.some((r) => MOD_ROLE_RE.test(r.label))) return "moderation";
  return "none";
}

export function useIsAdmin(address?: string): boolean {
  return useAdminAccess(address) === "full";
}

/** Any connected member may propose a community room (admins approve). */
export function useCanProposeRoom(address?: string): boolean {
  const policy=useAuthorityAccess(address);
  if(policy.data?.configured)return policy.data.permissions.includes("rooms.propose");
  if(policy.isError)return false;
  return !!address;
}
