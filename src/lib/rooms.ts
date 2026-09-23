import { assertPushWalletCurrent } from "./pushSessionWallet";
import { actionMessage } from "../../shared/signed-action.mjs";
import { useQuery } from "@tanstack/react-query";
import type { WalletClient } from "viem";
import type { PushRoom, RoomGate } from "./push";

/** A pending room request submitted by a role-holder, awaiting admin approval. */
export interface RoomProposal { id: string; name: string; blurb: string; gate: RoomGate; by: string; at: number }

/**
 * Community-room registry client. The deployed `/api/rooms` (Vercel KV) stores
 * each built-in room's chatId AND any admin-created custom rooms (each with its
 * own gate), so a room created in the Admin console goes live for everyone with
 * no redeploy. The runtime registry wins over build-time env vars; if the
 * registry isn't configured (e.g. local dev), env-var rooms still work.
 */

const ROOMS_URL = "/api/rooms";

export type RoomRegistry = Record<string, string>; // roomKey -> chatId
export interface RegistryData {
  chatIds: RoomRegistry;
  custom: PushRoom[];
  proposals: RoomProposal[];
  icons: Record<string, string>; // roomKey -> emoji or image URL (admin-set)
}

export function useRoomRegistry() {
  return useQuery({
    queryKey: ["room-registry"],
    staleTime: 60_000,
    queryFn: async (): Promise<RegistryData> => {
      try {
        const r = await fetch(ROOMS_URL);
        if (!r.ok) return { chatIds: {}, custom: [], proposals: [], icons: {} };
        const j = await r.json();
        return {
          chatIds: (j?.rooms ?? {}) as RoomRegistry,
          custom: (j?.custom ?? []) as PushRoom[],
          proposals: (j?.proposals ?? []) as RoomProposal[],
          icons: (j?.icons ?? {}) as Record<string, string>,
        };
      } catch {
        return { chatIds: {}, custom: [], proposals: [], icons: {} };
      }
    },
  });
}

async function postSigned(
  walletClient: WalletClient,
  account: `0x${string}`,
  message: string,
  payload: Record<string, unknown>
): Promise<void> {
  assertPushWalletCurrent(walletClient);
  const snapshot = await fetch(ROOMS_URL, { cache: "no-store" });
  if (!snapshot.ok) throw new Error("Registry unavailable. Try again later.");
  const { revision } = await snapshot.json();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  // Serialize once to remove optional undefined fields before signing.
  const envelope = { version: 2, audience: window.location.origin, chainId: 1, endpoint: ROOMS_URL, address: account,
    timestamp: Date.now(), nonce, expectedRevision: revision, payload: JSON.parse(JSON.stringify(payload)) };
  void message; // Human-readable legacy summary; the complete envelope is now signed.
  const signature = await walletClient.signMessage({ account, message: actionMessage(envelope) });
  assertPushWalletCurrent(walletClient);
  const r = await fetch(ROOMS_URL, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({...envelope, signature})});
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.error || `Registry write failed (HTTP ${r.status})`);
  }
}

/** Admin: save a built-in room's chatId to the registry, signed by a space admin. */
export async function saveRoomChatId(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  roomKey: string;
  chatId: string;
}): Promise<void> {
  const { walletClient, account, roomKey, chatId } = opts;
  await postSigned(walletClient, account, `Bittrees rooms registry\nset ${roomKey} = ${chatId}`, { roomKey, chatId });
}

/** Admin: set (or clear) a room's avatar — an emoji or http(s) image URL. */
export async function setRoomIcon(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  roomKey: string;
  icon: string;
}): Promise<void> {
  const { walletClient, account, roomKey, icon } = opts;
  await postSigned(walletClient, account, `Bittrees rooms registry\nicon ${roomKey} = ${icon}`, { icon: { key: roomKey, value: icon } });
}

/** Admin: add (or replace) a custom room with its own gate. */
export async function saveCustomRoom(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  room: PushRoom;
}): Promise<void> {
  const { walletClient, account, room } = opts;
  await postSigned(walletClient, account, `Bittrees rooms registry\ncustom ${room.key}`, { custom: room });
}

/** Admin: remove a custom room. */
export async function deleteCustomRoom(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  key: string;
}): Promise<void> {
  const { walletClient, account, key } = opts;
  await postSigned(walletClient, account, `Bittrees rooms registry\ndelete-custom ${key}`, { deleteCustom: key });
}

/** Role-holder: propose a room (name + gate) for an admin to approve. */
export async function proposeRoom(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  name: string;
  blurb: string;
  gate: RoomGate;
}): Promise<void> {
  const { walletClient, account, name, blurb, gate } = opts;
  await postSigned(walletClient, account, `Bittrees room proposal\n${name}`, { proposal: { name, blurb, gate } });
}

/** Admin: approve a proposal — pass the created room (with its Push chatId). */
export async function approveRoomProposal(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  proposalId: string;
  room: PushRoom;
}): Promise<void> {
  const { walletClient, account, proposalId, room } = opts;
  await postSigned(walletClient, account, `Bittrees room approve\n${proposalId}`, { approve: { proposalId, room } });
}

/** Admin: reject (drop) a proposal. */
export async function rejectRoomProposal(opts: {
  walletClient: WalletClient;
  account: `0x${string}`;
  proposalId: string;
}): Promise<void> {
  const { walletClient, account, proposalId } = opts;
  await postSigned(walletClient, account, `Bittrees room reject\n${proposalId}`, { reject: proposalId });
}
