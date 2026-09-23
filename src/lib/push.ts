import { PushSessionChangedError, type GuardedPushClient } from "./pushSessionCore";
import type { Address } from "viem";

/**
 * Push Chat — token-gated members community group chats (the Telegram
 * replacement). Self-serve: a qualifying member calls `group.join()` from their
 * own wallet and Push enforces the gate by GETting our stateless endpoint
 * (`/api/gate/...` → 200/403). The SDK is loaded lazily (dynamic import) so its
 * Node-polyfilled bundle never weighs on other pages.
 *
 * Research rooms are gated by what a member holds (membership / BNOTE / BIT) and
 * the roles they've earned (Researcher); Announcements is open to all members and
 * stewards post.
 *
 * One-time org setup (then fill the VITE_PUSH_ROOM_* envs with each chatId):
 *   deploy /api/gate → an admin runs createGatedGroup() per room (see Chat → manage).
 */

// Research's on-chain gates (Ethereum mainnet).
const MEMBERSHIP_TOKEN = "0xc8121e650bd797d8b9dad00227a9a77ef603a84a" as Address;
const BNOTE_TOKEN = "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80" as Address;
const BIT_TOKEN = "0x57A447E4d5e18A9423408C365963A73F08B9d18C" as Address;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PushClient = GuardedPushClient;

/** A single access rule. */
export type RoomRule =
  | { kind: "bgov"; tier: number } // minimum BGOV voting power
  | { kind: "safe"; safe: Address; ens?: string } // Safe signers + proposers
  | { kind: "token"; standard: "erc20" | "erc721" | "erc1155"; token: Address; min: string; tokenId?: string } // min balance / NFT count; tokenId for ERC-1155 (default "0")
  | { kind: "ens"; name?: string } // a specific ENS name's address, or (no name) any ENS name
  | { kind: "role"; role: string }; // holders of an admin-assigned role

/** How a room decides who may join — one rule, or several combined (any/all). */
export type RoomGate = RoomRule | { kind: "multi"; combine: "any" | "all"; rules: RoomRule[] };

export interface PushRoom {
  key: string;
  name: string;
  blurb: string;
  gate: RoomGate;
  /** The VITE_PUSH_ROOM_* env var holding this room's chatId (built-in rooms only). */
  envKey?: string;
  chatId?: string; // set once the group exists (registry, or env fallback)
  /** Admin-set room avatar: an emoji, or an http(s) image URL (from the registry). */
  icon?: string;
}

/** A one-line description of a single rule. */
export function ruleLabel(rule: RoomRule): string {
  if (rule.kind === "bgov") return `≥${rule.tier} BGOV`;
  if (rule.kind === "safe") return `${rule.ens || "Safe"} signers & proposers`;
  if (rule.kind === "ens") return rule.name ? rule.name : "any ENS name";
  if (rule.kind === "role") return `${rule.role} role`;
  if (rule.standard === "erc1155") return rule.tokenId !== undefined ? `≥${rule.min} of ${rule.token.slice(0, 6)}… #${rule.tokenId}` : `≥${rule.min} of any ${rule.token.slice(0, 6)}…`;
  return rule.standard === "erc721" ? `≥${rule.min} NFT of ${rule.token.slice(0, 6)}…` : `holds ≥${rule.min} of ${rule.token.slice(0, 6)}…`;
}

/** A one-line description of a gate (single rule or a combination). */
export function gateLabel(gate: RoomGate): string {
  if (gate.kind === "multi") {
    const sep = gate.combine === "all" ? " + " : " / ";
    return gate.rules.map(ruleLabel).join(sep) || "custom";
  }
  return ruleLabel(gate);
}

/** URL-safe base64 of a gate object (rules travel in the gate URL, no DB needed). */
function encodeGate(gate: object): string {
  return btoa(JSON.stringify(gate)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The built-in Bittrees Research rooms. Gates:
 *  - Members Commons / Announcements — any active member (holds the membership NFT).
 *  - Preferred Stockholders — holds BNOTE (preferred stock).
 *  - Index Holders — holds BIT (the index token).
 *  - Research Guild — the admin-assigned "Researcher" role.
 * Announcements is open to all members; stewards (room admins) post.
 */
export const BUILTIN_ROOMS: PushRoom[] = [
  { key: "members", name: "Members Commons", blurb: "All active members", gate: { kind: "token", standard: "erc1155", token: MEMBERSHIP_TOKEN, min: "1" }, envKey: "VITE_PUSH_ROOM_MEMBERS", chatId: import.meta.env.VITE_PUSH_ROOM_MEMBERS as string | undefined },
  { key: "preferred", name: "Preferred Stockholders", blurb: "BNOTE holders", gate: { kind: "token", standard: "erc1155", token: BNOTE_TOKEN, min: "1" }, envKey: "VITE_PUSH_ROOM_PREFERRED", chatId: import.meta.env.VITE_PUSH_ROOM_PREFERRED as string | undefined },
  { key: "index", name: "Index Holders", blurb: "BIT holders", gate: { kind: "token", standard: "erc20", token: BIT_TOKEN, min: "1" }, envKey: "VITE_PUSH_ROOM_INDEX", chatId: import.meta.env.VITE_PUSH_ROOM_INDEX as string | undefined },
  { key: "guild", name: "Research Guild", blurb: "Researchers & contributors", gate: { kind: "role", role: "Researcher" }, envKey: "VITE_PUSH_ROOM_GUILD", chatId: import.meta.env.VITE_PUSH_ROOM_GUILD as string | undefined },
  { key: "announcements", name: "Announcements", blurb: "All members · stewards post", gate: { kind: "token", standard: "erc1155", token: MEMBERSHIP_TOKEN, min: "1" }, envKey: "VITE_PUSH_ROOM_ANNOUNCEMENTS", chatId: import.meta.env.VITE_PUSH_ROOM_ANNOUNCEMENTS as string | undefined },
];

export const GATE_BASE_URL = (import.meta.env.VITE_GATE_URL as string) || "https://research.bittrees.org/api/gate";

/**
 * The CustomEndpoint URL Push GETs to enforce a room's gate. Push REQUIRES the
 * literal `{{user_address}}` template in the URL — it substitutes the requester's
 * address there before calling. The gate handler reads that address segment and
 * the trailing `/checkAccess` matches its documented path contract.
 */
const USER = "{{user_address}}";
export function gateUrl(room: PushRoom): string {
  const g = room.gate;
  // Multiple rules (or a single ENS rule) ride along in the URL, base64-encoded.
  if (g.kind === "multi") return `${GATE_BASE_URL}/multi/${encodeGate(g)}/${USER}/checkAccess`;
  // ENS + role (registry/resolver) and ERC-1155 (needs a tokenId) ride in the base64 multi gate.
  if (g.kind === "ens" || g.kind === "role" || (g.kind === "token" && g.standard === "erc1155")) return `${GATE_BASE_URL}/multi/${encodeGate({ kind: "multi", combine: "any", rules: [g] })}/${USER}/checkAccess`;
  if (g.kind === "safe") return `${GATE_BASE_URL}/safe/${g.safe}/${USER}/checkAccess`;
  if (g.kind === "token") return `${GATE_BASE_URL}/token/${g.standard}/${g.token}/${g.min}/${USER}/checkAccess`;
  return `${GATE_BASE_URL}/${g.tier}/${USER}/checkAccess`;
}

export interface PushMessage { id: string; from: string; text: string; mine: boolean; ts?: number }

function normalize(raw: any[], myAddr: string): PushMessage[] {
  const me = myAddr.toLowerCase();
  return (raw || []).map((m, i) => {
    const from = String(m?.fromDID || m?.fromCAIP10 || "").split(":").pop()?.toLowerCase() || "";
    const text = typeof m?.messageContent === "string" ? m.messageContent : (m?.messageObj?.content ?? "(unsupported)");
    return { id: m?.cid || String(m?.timestamp ?? i), from, text: String(text), mine: from === me, ts: Number(m?.timestamp) || undefined };
  });
}

export async function joinRoom(push: PushClient, chatId: string) {
  return push.chat.group.join(chatId);
}

/** Leave a room the wallet has joined (removes the caller from the Push group). */
export async function leaveRoom(push: PushClient, chatId: string) {
  return push.chat.group.leave(chatId);
}

/** Timestamp (ms) of a room's most recent message — for the unread flag. 0 if none. */
export async function roomLatestTs(push: PushClient, chatId: string): Promise<number> {
  try {
    const raw = await push.chat.history(chatId, { limit: 1 });
    return Number((raw as any[])?.[0]?.timestamp) || 0;
  } catch (error) {
    if (error instanceof PushSessionChangedError) throw error;
    return 0;
  }
}

/** The chats the user has JOINED → their last-message timestamp (ms). Used to mark
 *  rooms as joined and flag unread. Push caps `limit` at 30, so page through (bounded)
 *  for wallets in many chats. Best-effort — returns whatever it gathered on failure. */
export async function joinedChats(push: PushClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    for (let page = 1; page <= 5; page++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feeds: any[] = await push.chat.list("CHATS", { page, limit: 30 });
      const arr = Array.isArray(feeds) ? feeds : [];
      for (const f of arr) {
        if (f?.chatId) out[String(f.chatId)] = Number(f?.msg?.timestamp) || 0;
      }
      if (arr.length < 30) break; // last page reached
    }
  } catch (error) {
    if (error instanceof PushSessionChangedError) throw error;
    // keep whatever pages succeeded
  }
  return out;
}

/** A page of room history (oldest→newest) + a cursor to fetch the NEXT older page
 *  ("Load older messages"), undefined when there's no more history. */
export interface RoomHistoryPage { messages: PushMessage[]; cursor?: string }

const ROOM_PAGE = 30; // Push caps `limit` at 30 — paginate with `reference` for more.

function roomPage(raw: any[], myAddr: string): RoomHistoryPage {
  const arr = Array.isArray(raw) ? raw : [];
  // Push returns newest-first, so the LAST item is the oldest in this page. If we got
  // a full page there's likely more; its link/cid is the cursor for the next batch.
  const oldest = arr[arr.length - 1];
  const cursor = arr.length >= ROOM_PAGE ? (oldest?.link || oldest?.cid || undefined) : undefined;
  return { messages: normalize(arr, myAddr).reverse(), cursor };
}

export async function roomHistory(push: PushClient, chatId: string, myAddr: string): Promise<RoomHistoryPage> {
  const raw = await push.chat.history(chatId, { limit: ROOM_PAGE });
  return roomPage(raw, myAddr);
}

/** Fetch the next OLDER page, starting from a cursor returned by a prior call. */
export async function roomHistoryOlder(
  push: PushClient,
  chatId: string,
  before: string,
  myAddr: string
): Promise<RoomHistoryPage> {
  const raw = await push.chat.history(chatId, { reference: before, limit: ROOM_PAGE });
  return roomPage(raw, myAddr);
}

export async function sendRoom(push: PushClient, chatId: string, content: string) {
  return push.chat.send(chatId, { content, type: "Text" });
}

/**
 * Addresses auto-granted ADMIN on every community room at creation, so they can
 * manage members + roles regardless of who clicked "Create" (gov space admins).
 */
export const ROOM_ADMINS: string[] = [
  "0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f",
];

// Push's API validates that groupImage is a NON-EMPTY string (a data URI) — it
// rejects null/empty. We don't surface group avatars in-app, so a minimal valid
// 1×1 PNG satisfies the requirement.
const GROUP_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Admin one-time: create a tiered/Safe-gated group; returns its chatId to configure. */
export async function createGatedGroup(push: PushClient, room: PushRoom, creator?: string): Promise<string> {
  const gate = {
    type: "PUSH",
    category: "CustomEndpoint",
    subcategory: "GET",
    data: { url: gateUrl(room) },
  };
  // The creator is the group owner/admin automatically; add the standing room
  // admins too (minus the creator — Push rejects adding yourself).
  const admins = ROOM_ADMINS.filter((a) => a.toLowerCase() !== (creator ?? "").toLowerCase());
  const g = await push.chat.group.create(`Bittrees ${room.name}`, {
    description: room.blurb,
    image: GROUP_IMAGE,
    members: [],
    admins,
    private: true,
    rules: { entry: { conditions: [gate] } },
  });
  return g?.chatId || g?.groupId || "";
}

// ── Roles / membership (chat) ─────────────────────────────────────────────
export type RoomRole = "ADMIN" | "MEMBER";

export interface RoomMember { wallet: string; role: RoomRole }

/** Members of a room with their role (best-effort; shape varies by SDK version). */
export async function roomMembers(push: PushClient, chatId: string): Promise<RoomMember[]> {
  try {
    const info = await push.chat.group.info(chatId);
    const list: any[] = info?.members ?? info?.groupMembers ?? [];
    return list.map((m) => {
      const wallet = String(m?.wallet || m?.address || "").split(":").pop()?.toLowerCase() || "";
      return { wallet, role: (m?.isAdmin || m?.role === "ADMIN" ? "ADMIN" : "MEMBER") as RoomRole };
    }).filter((m) => m.wallet);
  } catch (error) {
    if (error instanceof PushSessionChangedError) throw error;
    return [];
  }
}

/** Assign a role (add/promote) to wallets in a room — room admins only (Push enforces). */
export async function setRoomRole(push: PushClient, chatId: string, wallets: string[], role: RoomRole) {
  return push.chat.group.add(chatId, { role, accounts: wallets });
}

/** Remove wallets (or demote a role) from a room — room admins only. */
export async function removeFromRoom(push: PushClient, chatId: string, wallets: string[], role: RoomRole = "MEMBER") {
  return push.chat.group.remove(chatId, { role, accounts: wallets });
}
