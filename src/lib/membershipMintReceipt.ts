import type { MembershipToken } from './membershipVerification.ts';
export interface MembershipSessionIdentity { scope: string | null; revision: number }
export interface PendingMembershipMint {
  hash: `0x${string}`;
  scope: string;
  revision: number;
  confirmedAt: number;
  previousTokens: ReadonlyArray<{ tokenId: string; expiresAt: number }>;
}
const sameSession = (a: MembershipSessionIdentity, b: MembershipSessionIdentity) =>
  a.scope !== null && a.scope === b.scope && a.revision === b.revision;

/** In-memory purchase notice only. This store never establishes membership authority. */
export function createMembershipMintReceipts(readSession: () => MembershipSessionIdentity, now = Date.now) {
  let pending: PendingMembershipMint | null = null;
  const listeners = new Set<() => void>();
  const publish = (value: PendingMembershipMint | null) => { pending = value; listeners.forEach(fn => fn()); };
  return {
    getSnapshot: () => pending,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    record(session: MembershipSessionIdentity, hash: string, previousTokens: ReadonlyArray<MembershipToken> = []) {
      if (!sameSession(session, readSession()) || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return false;
      if (pending?.hash.toLowerCase() === hash.toLowerCase() && sameSession(pending, session)) return false;
      publish({ hash: hash as `0x${string}`, scope: session.scope!, revision: session.revision, confirmedAt: now(),
        previousTokens: previousTokens.map(({ tokenId, expiresAt }) => ({ tokenId, expiresAt })) });
      return true;
    },
    observe() { if (pending && !sameSession(pending, readSession())) publish(null); },
    verified(session: MembershipSessionIdentity, verifiedAt: number, tokens: ReadonlyArray<MembershipToken>) {
      if (pending && sameSession(session, readSession()) && sameSession(pending, session)
        && Number.isFinite(verifiedAt) && verifiedAt > pending.confirmedAt) {
        const previous = new Map(pending.previousTokens.map(token => [token.tokenId, token.expiresAt]));
        if (tokens.some(token => !token.isExpired && token.expiresAt > now() / 1000
          && (!previous.has(token.tokenId) || token.expiresAt > previous.get(token.tokenId)!))) publish(null);
      }
    },
  };
}
