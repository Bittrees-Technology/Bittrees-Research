import { validateRecoveryData, MAX_RECOVERY_BYTES, type RecoveryData } from './chatRecoveryArchive.ts';

type Reader = Pick<Storage, 'getItem'>;
export interface ExportReview { data: RecoveryData; raw: Record<string, string | null>; sharedPreferences: boolean }
function fail(): never { throw new Error('Local data could not be safely exported. The original records have not been changed.'); }
function parse(raw: string | null, fallback: unknown): unknown {
  if (raw === null) return fallback;
  if (raw.length > MAX_RECOVERY_BYTES || new TextEncoder().encode(raw).length > MAX_RECOVERY_BYTES) fail();
  try { return JSON.parse(raw); } catch { return fail(); }
}
function record(value: unknown, allowed?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (allowed && Object.keys(value).some(key => !allowed.includes(key)))) fail();
  return value as Record<string, unknown>;
}
/** Read only the allowlisted application data. No cache, credential or bulk-storage access. */
export function reviewChatExport(storage: Reader, wallet: string, sharedPreferences: boolean, source: 'governance' | 'research', now = Date.now()): ExportReview {
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) fail();
  const owner = wallet.toLowerCase(); const raw: Record<string, string | null> = {};
  const read = (key: string, fallback: unknown) => { raw[key] = storage.getItem(key); return parse(raw[key], fallback); };
  const contacts = read(`bittrees.contacts.${owner}`, []);
  const notes = read(`bittrees.dm.saved.${owner}`, []);
  if (!Array.isArray(contacts) || !Array.isArray(notes)) fail();
  const preferences: RecoveryData['preferences'] = { blocked: [], readReceiptsDefault: false, readReceiptOverrides: {} };
  if (sharedPreferences) {
    const settings = record(read('bittrees.dm.settings', {}), ['readReceipts']);
    if (settings.readReceipts !== undefined && typeof settings.readReceipts !== 'boolean') fail();
    preferences.readReceiptsDefault = settings.readReceipts !== false; // Legacy default is ON; explicitly reviewed.
    preferences.blocked = read('bittrees.dm.blocked', []) as string[];
    const prefs = record(read('bittrees.dm.prefs', {}));
    if (Object.keys(prefs).length > 1000) fail();
    for (const [id, entry] of Object.entries(prefs)) {
      // Push room pins/read positions share this store with XMTP preferences.
      // Validate them, but never reinterpret a Push room key as an XMTP conversation.
      const room = /^room:[^\u0000-\u001f\u007f]{1,256}$/.test(id);
      if (!room && (!/^[a-zA-Z0-9_-]{1,256}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id))) fail();
      const item = record(entry, ['pinned', 'archived', 'order', 'lastReadAt', 'readReceipts']);
      for (const key of ['pinned', 'archived', 'readReceipts']) if (item[key] !== undefined && typeof item[key] !== 'boolean') fail();
      for (const key of ['order', 'lastReadAt']) if (item[key] !== undefined && (!Number.isSafeInteger(item[key]) || (item[key] as number) < 0)) fail();
      if (!room && typeof item.readReceipts === 'boolean') preferences.readReceiptOverrides[`xmtp:production:${id}`] = item.readReceipts;
    }
  }
  const data = validateRecoveryData({ version: 1, source, wallet: owner, createdAt: now,
    contacts: contacts.map(value => { const c = record(value, ['address', 'label']); return { address: c.address, label: c.label === undefined ? '' : c.label }; }),
    notes, preferences });
  return { data, raw, sharedPreferences };
}
export function assertExportUnchanged(storage: Reader, review: ExportReview): void {
  if (Object.entries(review.raw).some(([key, value]) => storage.getItem(key) !== value)) throw new Error('Local data changed. Review a fresh export before downloading.');
}

export interface ExportWallet {
  getAddresses(): Promise<readonly string[]>;
  getChainId(): Promise<number>;
  signMessage(args: { account: `0x${string}`; message: string }): Promise<`0x${string}`>;
}
/** Fresh, non-reusable export proof. Verification is supplied by the connected chain's verifier. */
export async function proveExportWallet(wallet: ExportWallet, owner: string, origin: string, ensureCurrent: () => void,
  verify: (args: { address: `0x${string}`; message: string; signature: `0x${string}` }, chain: number) => Promise<boolean>) {
  const expires = Date.now() + 120_000;
  const chain = await wallet.getChainId();
  const check = async () => {
    ensureCurrent();
    const [addresses, currentChain] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    ensureCurrent();
    if (Date.now() > expires || addresses[0]?.toLowerCase() !== owner.toLowerCase() || currentChain !== chain) throw new Error('Wallet session changed or expired. Review and try again.');
  };
  await check();
  const message = `Chat local data export\nOrigin: ${origin}\nWallet: ${owner.toLowerCase()}\nChain: ${chain}\nNonce: ${crypto.randomUUID()}\nExpires: ${expires}\nThis proof authorizes only this local encrypted export. It grants no messaging, sync or spending authority.`;
  const signature = await wallet.signMessage({ account: owner as `0x${string}`, message });
  await check();
  if (!(await verify({ address: owner as `0x${string}`, message, signature }, chain))) throw new Error('Wallet ownership could not be verified.');
  await check();
  return check;
}
