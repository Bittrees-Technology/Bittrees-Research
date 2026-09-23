export interface MembershipToken { tokenId: string; expiresAt: number; isExpired: boolean }
export const MEMBERSHIP_CHECK_TIMEOUT = 15_000;
export const MEMBERSHIP_FRESHNESS = 60_000;
export const MEMBERSHIP_REFRESH = 30_000;
export const MEMBERSHIP_UNAVAILABLE = 'Membership could not be verified. Try again; your existing membership is unchanged.';

export function candidateTokenIds(nfts: unknown, contract: string): string[] {
  if (!Array.isArray(nfts) || nfts.length > 1_000) throw new Error(MEMBERSHIP_UNAVAILABLE);
  const ids = new Set<string>();
  for (const nft of nfts) {
    if (!nft || typeof nft.tokenId !== 'string' || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(nft.tokenId)
      || nft.tokenId.length > 80 || nft.contract?.address?.toLowerCase() !== contract.toLowerCase()) throw new Error(MEMBERSHIP_UNAVAILABLE);
    const id = BigInt(nft.tokenId);
    if (id < 0n || id >= 2n ** 256n) throw new Error(MEMBERSHIP_UNAVAILABLE);
    ids.add(id.toString());
  }
  return [...ids];
}

/** Each candidate needs a positive current-owner balance and two successful expiry reads. */
export function verifiedMembershipTokens(ids: string[], results: readonly unknown[], nowSec: number): MembershipToken[] {
  if (results.length !== ids.length * 3) throw new Error(MEMBERSHIP_UNAVAILABLE);
  const tokens: MembershipToken[] = [];
  ids.forEach((tokenId, index) => {
    const values = results.slice(index * 3, index * 3 + 3) as { status?: unknown; result?: unknown }[];
    if (values.some(value => !value || value.status !== 'success')) throw new Error(MEMBERSHIP_UNAVAILABLE);
    const [balance, expired, stamp] = values.map(value => value.result);
    if (typeof balance !== 'bigint' || balance < 0n || typeof expired !== 'boolean'
      || typeof stamp !== 'bigint' || stamp < 0n || stamp > 8_640_000_000_000n) throw new Error(MEMBERSHIP_UNAVAILABLE);
    if (balance > 0n) tokens.push({ tokenId, expiresAt: Number(stamp), isExpired: expired || stamp <= BigInt(nowSec) });
  });
  return tokens;
}

/** SDKs may ignore cancellation. Settle the caller promptly and reject every late result. */
export async function boundedMembershipRead<T>(read: (ensureCurrent: () => void) => Promise<T>, signal: AbortSignal, timeout = MEMBERSHIP_CHECK_TIMEOUT): Promise<T> {
  let stopped = signal.aborted;
  let timer: ReturnType<typeof setTimeout>;
  let abort = () => {};
  const ensureCurrent = () => { if (stopped || signal.aborted) throw new Error(MEMBERSHIP_UNAVAILABLE); };
  const stop = new Promise<never>((_, reject) => {
    abort = () => { stopped = true; reject(new Error(MEMBERSHIP_UNAVAILABLE)); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(abort, timeout);
  });
  try {
    return await Promise.race([stop, Promise.resolve().then(async () => {
      ensureCurrent(); const value = await read(ensureCurrent); ensureCurrent(); return value;
    })]);
  } finally { stopped = true; clearTimeout(timer!); signal.removeEventListener('abort', abort); }
}

/** A reconnect to the same wallet is a new verification session. */
export function createMembershipSession(readScope: () => string | null) {
  let snapshot = { scope: readScope(), revision: 0 };
  const listeners = new Set<() => void>();
  const invalidate = () => { snapshot = { scope: readScope(), revision: snapshot.revision + 1 }; listeners.forEach(fn => fn()); };
  return { getSnapshot: () => snapshot, invalidate,
    observe: () => { if (snapshot.scope !== readScope()) invalidate(); },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
