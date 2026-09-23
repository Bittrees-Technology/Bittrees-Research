/** Portable application data only. Never pass storage snapshots or wallet credentials here. */
export interface RecoveryData {
  version: 1;
  source: 'chirpy' | 'governance' | 'research';
  wallet: string;
  createdAt: number;
  contacts: { address: string; label: string }[];
  notes: { id: string; text: string; sentAtMs: number }[];
  preferences: {
    blocked: string[];
    readReceiptsDefault: boolean;
    readReceiptOverrides: Record<string, boolean>;
  };
}

export const MAX_RECOVERY_BYTES = 512 * 1024;
export const MAX_RECOVERY_FILE_BYTES = 704 * 1024;
const ITERATIONS = 600_000;
const FORMAT = 'chat-recovery';
const AAD = new TextEncoder().encode('Chat recovery v1;AES-256-GCM;PBKDF2-SHA-256;600000');
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const encoder = new TextEncoder();

function invalid(): never { throw new Error('Invalid or unsupported recovery file'); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))) invalid();
  return record;
}
function address(value: unknown): string {
  if (typeof value !== 'string' || !ADDRESS.test(value)) invalid();
  return value.toLowerCase();
}
function string(value: unknown, max: number, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) invalid();
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) invalid();
  return value;
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > 1000) invalid();
  return value.map(parse);
}
function unique<T>(items: T[], key: (item: T) => string): T[] {
  if (new Set(items.map(key)).size !== items.length) invalid();
  return items;
}

/** Strict allowlist: unknown fields are rejected, never silently exported or discarded. */
export function validateRecoveryData(value: unknown): RecoveryData {
  const data = object(value, ['version', 'source', 'wallet', 'createdAt', 'contacts', 'notes', 'preferences']);
  if (data.version !== 1 || !['chirpy', 'governance', 'research'].includes(data.source as string)) invalid();
  const prefs = object(data.preferences, ['blocked', 'readReceiptsDefault', 'readReceiptOverrides']);
  if (typeof prefs.readReceiptsDefault !== 'boolean') invalid();
  const overrides = prefs.readReceiptOverrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
    || Object.getPrototypeOf(overrides) !== Object.prototype || Object.keys(overrides).length > 1000) invalid();
  for (const [key, on] of Object.entries(overrides)) {
    if (!/^(mock|xmtp):(dev|production):[a-zA-Z0-9_-]{1,256}$/.test(key) || typeof on !== 'boolean') invalid();
  }
  const result: RecoveryData = {
    version: 1, source: data.source as RecoveryData['source'], wallet: address(data.wallet), createdAt: timestamp(data.createdAt),
    contacts: unique(list(data.contacts, item => {
      const contact = object(item, ['address', 'label']);
      return { address: address(contact.address), label: string(contact.label, 200) };
    }), contact => contact.address),
    notes: unique(list(data.notes, item => {
      const note = object(item, ['id', 'text', 'sentAtMs']);
      return { id: string(note.id, 256, 1), text: string(note.text, 50_000), sentAtMs: timestamp(note.sentAtMs) };
    }), note => note.id),
    preferences: {
      blocked: unique(list(prefs.blocked, address), item => item),
      readReceiptsDefault: prefs.readReceiptsDefault,
      readReceiptOverrides: { ...overrides } as Record<string, boolean>,
    },
  };
  if (encoder.encode(JSON.stringify(result)).length > MAX_RECOVERY_BYTES) invalid();
  return result;
}

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: unknown, length?: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > MAX_RECOVERY_FILE_BYTES
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid();
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if ((length !== undefined && bytes.length !== length) || encode(bytes) !== value) invalid();
  return bytes;
}
function passwordBytes(password: string): Uint8Array<ArrayBuffer> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024 || !password.trim()) {
    throw new Error('Use a recovery passphrase of 12 to 1024 characters');
  }
  // Do not trim or normalize: every entered character contributes to the key.
  return encoder.encode(password);
}
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const bytes = passwordBytes(password);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally { bytes.fill(0); }
}

/** No storage writes, network calls or ownership claims. UI must verify ownership separately. */
export async function encryptRecoveryArchive(value: unknown, password: string): Promise<string> {
  const data = validateRecoveryData(value);
  passwordBytes(password).fill(0);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = encoder.encode(JSON.stringify(data));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, plaintext);
    return JSON.stringify({ format: FORMAT, version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256',
      iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) });
  } finally { plaintext.fill(0); }
}

/** expectedWallet must come from the caller's verified wallet session, never from the file. */
export async function decryptRecoveryArchive(raw: string, password: string, expectedWallet: string): Promise<RecoveryData> {
  const wallet = address(expectedWallet);
  if (typeof raw !== 'string' || raw.length > MAX_RECOVERY_FILE_BYTES
    || encoder.encode(raw).length > MAX_RECOVERY_FILE_BYTES) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { invalid(); }
  const file = object(parsed, ['format', 'version', 'cipher', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']);
  if (file.format !== FORMAT || file.version !== 1 || file.cipher !== 'AES-256-GCM'
    || file.kdf !== 'PBKDF2-SHA-256' || file.iterations !== ITERATIONS) invalid();
  const salt = decode(file.salt, 16);
  const iv = decode(file.iv, 12);
  const ciphertext = decode(file.ciphertext);
  if (ciphertext.length < 17 || ciphertext.length > MAX_RECOVERY_BYTES + 16) invalid();
  const key = await deriveKey(password, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD, tagLength: 128 }, key, ciphertext);
  } catch { throw new Error('Could not unlock recovery file: incorrect passphrase or damaged file'); }
  let data: RecoveryData;
  try { data = validateRecoveryData(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))); }
  catch { invalid(); }
  finally { new Uint8Array(plaintext).fill(0); }
  if (data.wallet !== wallet) throw new Error('Recovery file belongs to a different wallet');
  return data;
}
