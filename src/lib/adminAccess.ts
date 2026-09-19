import {useAuthorityAccess} from './authorityAccess';
import { useCommunity, useUserRoles } from "./community";

/**
 * Admin access tiers for Bittrees Research.
 *  - "full"       — the standing super-admin (executive) address, or anyone holding
 *                   the Executive role. Every Admin tab + write access.
 *  - "moderation" — holders of the Assistant role (Moderation tab only).
 *  - "none"       — no admin access.
 *
 * The same tiers are enforced server-side in api/community.js + api/rooms.js, so
 * the UI gating matches what actually saves.
 */
export const SUPER_ADMIN = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f"; // executive — always full access
const FULL_ROLE_RE = /^executive$/i;
const MOD_ROLE_RE = /^assistant$/i;

export type AdminLevel = "full" | "moderation" | "none";

export function useAdminAccess(address?: string): AdminLevel {
  const roles = useUserRoles(address);
  const { data: authority } = useCommunity();
  const policy=useAuthorityAccess(address);
  if (!address) return "none";
  if (authority?.authorizationMode === "root-policy" || authority?.authorizationMode === "controller-policy-on-activation") {
    if(policy.isError || !policy.data)return "none";
    if(policy.data.configured)return policy.data.permissions.includes('community.roles.manage')||policy.data.permissions.includes('rooms.manage')?'full':policy.data.permissions.includes('community.moderation.manage')?'moderation':'none';
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
