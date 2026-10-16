import { x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { WalletClient } from "viem";

/**
 * Client-side encryption for contributor applications. The application is stored
 * ON-CHAIN (EAS on Base) but ENCRYPTED: a random symmetric key encrypts the data
 * (XChaCha20-Poly1305), and that key is wrapped to each recipient's X25519 public
 * key (the submitter + every reviewer who holds the application-access role and
 * has published a key). Each party derives its X25519 keypair deterministically
 * from a wallet signature, so it can always re-derive and decrypt. Audited @noble
 * primitives only — no custom crypto, no third-party network.
 *
 * Accepted limitation: a reviewer added AFTER an application is written can't
 * decrypt that older (immutable) ciphertext — only applications submitted while
 * they were a published reviewer.
 */

const KEY_MESSAGE =
  "Bittrees — application encryption key (v1)\n\nSign to derive your private decryption key for contributor applications. No gas; this only proves wallet ownership.";
const WRAP_INFO = utf8ToBytes("bittrees-app-wrap-v1");

export interface Application {
  name: string;
  roles: string[];
  region: string[];
  languages: string[];
  specialty: string;
  heardFrom: string;
  email: string;
  twitter: string;
  telegram: string;
  wallet: string;
  referrer: string;
}

export interface EncKeypair { secretKey: Uint8Array; publicKey: Uint8Array }
export interface Recipient { addr: string; pub: Uint8Array }
export interface Envelope {
  v: 1;
  alg: "x25519-xchacha20poly1305";
  nonce: string;
  ciphertext: string;
  recipients: { addr: string; epk: string; n: string; k: string }[];
}

/** Deterministic X25519 keypair from a wallet signature (no gas, re-derivable). */
export async function deriveEncKeypair(walletClient: WalletClient, account: `0x${string}`): Promise<EncKeypair> {
  const sig = await walletClient.signMessage({ account, message: KEY_MESSAGE });
  const secretKey = sha256(hexToBytes(sig.replace(/^0x/, "")));
  const publicKey = x25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

function wrap(recipientPub: Uint8Array, symKey: Uint8Array) {
  const ephSk = randomBytes(32); // valid X25519 scalar (clamped internally)
  const ephPk = x25519.getPublicKey(ephSk);
  const shared = x25519.getSharedSecret(ephSk, recipientPub);
  const wk = hkdf(sha256, shared, undefined, WRAP_INFO, 32);
  const n = randomBytes(24);
  const k = xchacha20poly1305(wk, n).encrypt(symKey);
  return { epk: bytesToHex(ephPk), n: bytesToHex(n), k: bytesToHex(k) };
}

/** Encrypt a plaintext string to a set of recipients (envelope encryption). */
export function encryptApplication(plaintext: string, recipients: Recipient[]): Envelope {
  const symKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(symKey, nonce).encrypt(utf8ToBytes(plaintext));
  return {
    v: 1,
    alg: "x25519-xchacha20poly1305",
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ct),
    recipients: recipients.map((r) => ({ addr: r.addr.toLowerCase(), ...wrap(r.pub, symKey) })),
  };
}

/** Decrypt an envelope with my keypair; null if I'm not a recipient or it fails. */
export function decryptApplication(env: Envelope, account: `0x${string}`, secretKey: Uint8Array): string | null {
  try {
    if (env?.alg !== "x25519-xchacha20poly1305") return null;
    const entry = env.recipients.find((r) => r.addr === account.toLowerCase());
    if (!entry) return null;
    const shared = x25519.getSharedSecret(secretKey, hexToBytes(entry.epk));
    const wk = hkdf(sha256, shared, undefined, WRAP_INFO, 32);
    const symKey = xchacha20poly1305(wk, hexToBytes(entry.n)).decrypt(hexToBytes(entry.k));
    const pt = xchacha20poly1305(symKey, hexToBytes(env.nonce)).decrypt(hexToBytes(env.ciphertext));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export const pubKeyHex = (pub: Uint8Array): string => bytesToHex(pub);
export const pubKeyFromHex = (hex: string): Uint8Array => hexToBytes(hex);

/** Share only this document's random key with the private contributor service. */
export function applicationContentKey(env: Envelope, account: `0x${string}`, secretKey: Uint8Array): string {
  const entry = env.recipients.find(r => r.addr.toLowerCase() === account.toLowerCase());
  if (!entry || env.v !== 1 || env.alg !== 'x25519-xchacha20poly1305') throw Error('This wallet cannot unlock the application.');
  const shared = x25519.getSharedSecret(secretKey, hexToBytes(entry.epk));
  const wk = hkdf(sha256, shared, undefined, WRAP_INFO, 32);
  return bytesToHex(xchacha20poly1305(wk, hexToBytes(entry.n)).decrypt(hexToBytes(entry.k)));
}
