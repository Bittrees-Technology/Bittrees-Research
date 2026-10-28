import { useEffect, useRef, useState } from "react";
import { createSyncVault } from "./sync-vault.mjs";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes, utf8ToBytes, hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import type { WalletClient } from "viem";
import {
  useDmPrefs, useDmSettings, useBlocked,
  getAllPrefs, replaceAllPrefs, getSettingsSnapshot, replaceSettings, getBlockedList, replaceBlocked,
  type DmPrefs, type DmSettings,
} from "./dmPrefs";
import { useSavedMessages, getNotes, replaceNotes, type SavedMessage } from "./savedMessages";

/** Encrypted Messenger sync keeps its existing cipher and key message. The
 * encryption signature lives only in this tab; fresh scoped wallet proof creates
 * a separate, one-hour HttpOnly server session. Native app roles are unchanged. */

export const SYNC_MESSAGE =
  "Bittrees Messenger — sync key (v1)\n\nSign to sync and encrypt your saved messages and preferences across your devices. No gas; this only proves wallet ownership.";

const SYNC_URL = "/api/usersync";
const vault = createSyncVault({message: SYNC_MESSAGE, validate: (signature: string, blob: string) => {
  const data = decryptBlob(keyFromSig(signature), blob) as SyncBlob;
  if (!data || !Array.isArray(data.savedMessages) || !data.prefs || !data.settings || !Array.isArray(data.blocked)) throw Error("Encrypted sync data could not be verified. Nothing was changed.");
  return data;
}});
export const hasLegacySyncCredential = (addr?: string): boolean => vault.hasLegacy(addr);

interface SyncBlob { savedMessages: SavedMessage[]; prefs: DmPrefs; settings: DmSettings; blocked: string[] }

export function getCachedSig(addr?: string): string | null { return vault.signature(addr); }

/**
 * Signature-free probe: does the store already hold an (encrypted) blob for this
 * wallet? `source: "gov"` means it carried over from gov.bittrees.org. Lets the UI
 * offer "restore your messages" before asking the user to sign.
 */
export async function hasRemoteSync(addr?: string): Promise<{ exists: boolean; source?: string }> {
  if (!addr) return { exists: false };
  try {
    const r = await fetch(`${SYNC_URL}?address=${addr}`);
    if (!r.ok) return { exists: false };
    const j = await r.json();
    return { exists: !!j?.blob, source: j?.source };
  } catch {
    return { exists: false };
  }
}
export function isSyncEnabled(addr?: string): boolean {
  return !!getCachedSig(addr);
}
export function disableSync(addr: string) { void vault.disconnect(addr); }

/** User-initiated unlock; existing ciphertext is verified before any migration. */
export async function enableSync(walletClient: WalletClient, addr: `0x${string}`): Promise<void> {
  const result = await vault.connect(addr, (message: string) => walletClient.signMessage({account: addr, message}));
  if (result.remote) mergeRemote(addr, result.remote as SyncBlob);
  if (!result.legacyCleared) throw Error("Messages are unlocked in this tab, but the browser blocked removal of the older sync credential. The security migration remains incomplete.");
  await pushNow(addr);
}

function keyFromSig(sig: string): Uint8Array {
  return sha256(utf8ToBytes(sig)); // 32-byte symmetric key, deterministic per wallet
}
function encryptBlob(key: Uint8Array, obj: unknown): string {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(JSON.stringify(obj)));
  return `${bytesToHex(nonce)}:${bytesToHex(ct)}`;
}
function decryptBlob(key: Uint8Array, blob: string): unknown {
  const [n, c] = blob.split(":");
  const pt = xchacha20poly1305(key, hexToBytes(n)).decrypt(hexToBytes(c));
  return JSON.parse(new TextDecoder().decode(pt));
}

/** Fetch + decrypt the remote blob and merge it into the local stores. */
export async function pullAndMerge(addr: string): Promise<boolean> {
  if (!getCachedSig(addr)) return false;
  try {
    const remote = await vault.read(addr);
    if (remote) mergeRemote(addr, remote as SyncBlob);
    return true;
  } catch { vault.lock(addr); return false; }
}

function mergeRemote(addr: string, remote: SyncBlob) {
  // Notes: union by id (never lose a note), oldest→newest.
  const byId = new Map<string, SavedMessage>();
  [...(remote.savedMessages ?? []), ...getNotes(addr)].forEach((m) => { if (m?.id) byId.set(m.id, m); });
  replaceNotes(addr, [...byId.values()].sort((a, b) => a.sentAtMs - b.sentAtMs));
  // Blocked: union.
  replaceBlocked([...new Set([...(remote.blocked ?? []), ...getBlockedList()].map((x) => String(x).toLowerCase()))]);
  // Prefs + settings: adopt remote (keep local-only conv keys).
  if (remote.prefs) replaceAllPrefs({ ...getAllPrefs(), ...remote.prefs });
  if (remote.settings) replaceSettings(remote.settings);
}

/** Encrypt the current local state and push it (signed) to the remote store. */
export async function pushNow(addr: string): Promise<void> {
  const sig = getCachedSig(addr);
  if (!sig) return;
  const blobObj: SyncBlob = { savedMessages: getNotes(addr), prefs: getAllPrefs(), settings: getSettingsSnapshot(), blocked: getBlockedList() };
  const blob = encryptBlob(keyFromSig(sig), blobObj);
  await vault.write(addr, blob);
}

/**
 * Drive sync for the connected wallet: pull+merge once when enabled, then push
 * (debounced) whenever Saved Messages or preferences change. No-op when sync is off.
 */
export function useUserSync(addr?: string) {
  const [, refresh] = useState(0);
  useEffect(() => vault.subscribe(() => refresh(n => n + 1)), []);
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => { if (previous.current && previous.current !== addr) vault.lock(previous.current); previous.current = addr; }, [addr]);
  const prefs = useDmPrefs(), settings = useDmSettings(), blocked = useBlocked(), saved = useSavedMessages(addr);
  const enabled = isSyncEnabled(addr);
  const pulled = useRef<string>("");
  useEffect(() => {
    let active = true;
    pulled.current = "";
    if (!addr || !enabled) return;
    pullAndMerge(addr).then(ok => { if (ok && active) pulled.current = addr; }).catch(() => {});
    return () => { active = false; };
  }, [addr, enabled]);
  useEffect(() => {
    if (!addr || !enabled) return;
    const timer = setTimeout(() => { if (pulled.current === addr) void pushNow(addr).catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, [addr, enabled, prefs, settings, blocked, saved]);
}
