import { actionMessage } from "../../shared/signed-action.mjs";
import { useQuery } from "@tanstack/react-query";
import type { WalletClient } from "viem";

/**
 * Community registry client — admin-assigned roles/tags + moderation flags
 * (/api/community, Vercel KV). Roles show as badges; flags hide content pending a
 * moderator's review. One query feeds everything. Research has no voting-power
 * tiers — every role is assigned, and the on-chain badges (Member / Preferred /
 * Index) are derived separately from holdings.
 */

const URL = "/api/community";
export const FLAG_HIDE_THRESHOLD = 2;

export interface Role { label: string; color?: string }
export type RolesMap = Record<string, Role[]>;
/** A role in the catalog — an admin-created, reusable, selectable definition. */
export interface RoleDef { label: string; color?: string; description?: string; locked?: boolean }
export interface FlagRecord { by: string[]; mod: "approved" | "removed" | null; surface?: string; preview?: string }
export type FlagsMap = Record<string, FlagRecord>;
export type EncKeysMap = Record<string, string>; // addrLower -> x25519 pubkey hex
export interface CommunityData { authorizationMode?: "legacy" | "root-policy"; roles: RolesMap; flags: FlagsMap; enckeys: EncKeysMap; roledefs: RoleDef[]; threshold: number }

export async function fetchCommunity(): Promise<CommunityData> {
  try {
    const r = await fetch(URL);
    if (!r.ok) return { roles: {}, flags: {}, enckeys: {}, roledefs: [], threshold: FLAG_HIDE_THRESHOLD };
    const j = await r.json();
    return { roles: j?.roles ?? {}, flags: j?.flags ?? {}, enckeys: j?.enckeys ?? {}, roledefs: j?.roledefs ?? [], threshold: j?.threshold ?? FLAG_HIDE_THRESHOLD };
  } catch {
    return { roles: {}, flags: {}, enckeys: {}, roledefs: [], threshold: FLAG_HIDE_THRESHOLD };
  }
}

export function useCommunity() {
  return useQuery({ queryKey: ["community"], staleTime: 60_000, queryFn: fetchCommunity });
}

/** Addresses (lowercase) who can review contributor applications — Executives. */
export function opsHolders(roles: RolesMap): string[] {
  return Object.entries(roles ?? {})
    .filter(([, list]) => list.some((r) => /^executive$/i.test(r.label)))
    .map(([addr]) => addr.toLowerCase());
}

// ── Roles ──────────────────────────────────────────────────────────────────
export function useRoles(): { data: RolesMap | undefined } {
  const { data } = useCommunity();
  return { data: data?.roles };
}

export function useUserRoles(address?: string): Role[] {
  const { data } = useRoles();
  if (!address) return [];
  return data?.[address.toLowerCase()] ?? [];
}

// ── Role catalog (admin-created definitions) ─────────────────────────────────
export function useRoleDefs(): { data: RoleDef[] | undefined } {
  const { data } = useCommunity();
  return { data: data?.roledefs };
}

/**
 * Every role available to assign, in dropdown order: the built-in powers roles
 * (Executive / Assistant) and built-in assignable roles
 * (Researcher / Steward) first, then admin-created roles. A created role with the
 * same label as a built-in overrides its color/description but stays locked.
 */
export function selectableRoles(defs: RoleDef[] | undefined): RoleDef[] {
  const byLabel = new Map<string, RoleDef>();
  for (const k of KNOWN_ROLES) byLabel.set(k.label.toLowerCase(), { label: k.label, color: k.color, description: k.grants, locked: true });
  for (const t of ASSIGNABLE_ROLES) byLabel.set(t.label.toLowerCase(), { label: t.label, color: t.color, description: t.description, locked: true });
  for (const d of defs ?? []) {
    const key = String(d.label || "").toLowerCase();
    if (!key) continue;
    const prior = byLabel.get(key);
    byLabel.set(key, { ...prior, ...d, label: d.label, locked: prior?.locked });
  }
  return Array.from(byLabel.values());
}

// ── Flags / moderation ───────────────────────────────────────────────────────
export interface ItemModeration { flagCount: number; hidden: boolean; mine: boolean; mod: "approved" | "removed" | null }

/** Moderation state for one item (post/reply/message) for the connected wallet. */
export function useItemModeration(id: string | undefined, myAddress?: string): ItemModeration {
  const { data } = useCommunity();
  const rec = id ? data?.flags?.[id] : undefined;
  const by = rec?.by ?? [];
  const mod = rec?.mod ?? null;
  const threshold = data?.threshold ?? FLAG_HIDE_THRESHOLD;
  const hidden = mod === "removed" || (mod !== "approved" && by.length >= threshold);
  const mine = !!myAddress && by.includes(myAddress.toLowerCase());
  return { flagCount: by.length, hidden, mine, mod };
}

// ── Signed writes ────────────────────────────────────────────────────────────
async function postSigned(
  walletClient: WalletClient,
  account: `0x${string}`,
  message: string,
  payload: Record<string, unknown>
): Promise<void> {
  const snapshot = await fetch(URL, { cache: "no-store" });
  if (!snapshot.ok) throw new Error("Registry unavailable. Try again later.");
  const { revision } = await snapshot.json();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  // Serialize once to remove optional undefined fields before signing.
  const envelope = { version: 2, audience: window.location.origin, chainId: 1, endpoint: URL, address: account,
    timestamp: Date.now(), nonce, expectedRevision: revision, payload: JSON.parse(JSON.stringify(payload)) };
  void message; // Human-readable legacy summary; the complete envelope is now signed.
  const signature = await walletClient.signMessage({ account, message: actionMessage(envelope) });
  const r = await fetch(URL, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...envelope, signature})});
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || `Request failed (HTTP ${r.status})`);
  }
}

export async function assignRole(opts: { walletClient: WalletClient; account: `0x${string}`; target: string; label: string; color?: string }): Promise<void> {
  const t = opts.target.toLowerCase();
  await postSigned(opts.walletClient, opts.account, `Bittrees roles\nassign ${opts.label} -> ${t}`, { assignRole: { target: opts.target, label: opts.label, color: opts.color } });
}

export async function unassignRole(opts: { walletClient: WalletClient; account: `0x${string}`; target: string; label: string }): Promise<void> {
  const t = opts.target.toLowerCase();
  await postSigned(opts.walletClient, opts.account, `Bittrees roles\nunassign ${opts.label} -> ${t}`, { unassignRole: { target: opts.target, label: opts.label } });
}

/** Create (or recolor) a role in the catalog — admin-signed. */
export async function createRole(opts: { walletClient: WalletClient; account: `0x${string}`; label: string; color?: string; description?: string }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees roledef\ncreate ${opts.label}`, { createRole: { label: opts.label, color: opts.color, description: opts.description } });
}

/** Delete a role from the catalog — admin-signed. Also strips it from everyone it was assigned to. */
export async function deleteRole(opts: { walletClient: WalletClient; account: `0x${string}`; label: string }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees roledef\ndelete ${opts.label}`, { deleteRole: { label: opts.label } });
}

/** Publish your X25519 public key so applications can be encrypted to you. */
export async function publishEncKey(opts: { walletClient: WalletClient; account: `0x${string}`; pubkey: string }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees enckey\n${opts.pubkey}`, { publishKey: { pubkey: opts.pubkey } });
}

export async function flagItem(opts: { walletClient: WalletClient; account: `0x${string}`; id: string; surface: string; preview?: string }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees flag\n${opts.surface}:${opts.id}`, { flag: { id: opts.id, surface: opts.surface, preview: opts.preview } });
}

export async function unflagItem(opts: { walletClient: WalletClient; account: `0x${string}`; id: string }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees unflag\n${opts.id}`, { unflag: { id: opts.id } });
}

export async function moderateItem(opts: { walletClient: WalletClient; account: `0x${string}`; id: string; action: "approve" | "remove" | "clear" }): Promise<void> {
  await postSigned(opts.walletClient, opts.account, `Bittrees moderate\n${opts.action} ${opts.id}`, { moderate: { id: opts.id, action: opts.action } });
}

// ── Research roles ───────────────────────────────────────────────────────────

/**
 * Built-in roles that carry POWERS (assign the exact label in Admin → Roles).
 * Executive = full admin (auto-granted to the super-admin) and reviews contributor
 * applications; Assistant moderates flagged content.
 */
export const KNOWN_ROLES: { label: string; grants: string; color: string }[] = [
  { label: "Executive", grants: "Full administration — manage roles, rooms, moderation, and review contributor applications.", color: "#1A1A1A" },
  { label: "Assistant", grants: "Moderate community-flagged posts & messages (approve / remove).", color: "#7C3AED" },
];

/**
 * Built-in assignable roles with no special powers — display badges that also gate
 * rooms (Researcher gates the Research Guild). Admins may add more in the catalog.
 */
export const ASSIGNABLE_ROLES: { label: string; color: string; description: string }[] = [
  { label: "Researcher", color: "#2F8F5B", description: "Contributor — gates the Research Guild room." },
  { label: "Steward", color: "#B8860B", description: "Community steward — a governance badge." },
];
