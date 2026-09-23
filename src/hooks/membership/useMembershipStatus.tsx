import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { getContractAddress } from '@/lib/constants/contracts';
import { membershipScope, membershipSession, membershipMintReceipts } from '@/lib/membershipSession';
import { readMembership } from '@/lib/membershipReader';
import { MEMBERSHIP_FRESHNESS, MEMBERSHIP_REFRESH, MEMBERSHIP_UNAVAILABLE, type MembershipToken } from '@/lib/membershipVerification';
import type { PendingMembershipMint } from '@/lib/membershipMintReceipt';
export type { MembershipToken } from '@/lib/membershipVerification';

export interface MembershipStatus {
  isConnected: boolean; address?: string; isLoading: boolean; tokens: MembershipToken[];
  hasValidMembership: boolean; activeExpiresAt?: number; daysLeft?: number;
  expiringSoon: boolean; error: Error | null; refetch: () => void; sessionRevision: number;
  pendingMint: PendingMembershipMint | null; isChecking: boolean; confirmMint: (hash: string) => boolean;
}
export const RENEWAL_WINDOW_DAYS = 30;

/** Fresh network evidence only. Neither browser display caches nor a mint receipt grant access. */
export function useMembershipStatus(): MembershipStatus {
  const { address, isConnected } = useAccount();
  const session = useSyncExternalStore(membershipSession.subscribe, membershipSession.getSnapshot);
  const savedMint = useSyncExternalStore(membershipMintReceipts.subscribe, membershipMintReceipts.getSnapshot);
  const current = isConnected && !!address && session.scope !== null && session.scope === membershipScope()
    && session.scope.startsWith(`${address.toLowerCase()}:`);
  const pendingMint = current && savedMint?.scope === session.scope && savedMint.revision === session.revision ? savedMint : null;
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const query = useQuery({
    queryKey: ['membership', 'verified', session.scope, session.revision],
    queryFn: async ({ signal }) => {
      const checkSession = () => {
        if (!current || membershipSession.getSnapshot() !== session || membershipScope() !== session.scope) throw new Error(MEMBERSHIP_UNAVAILABLE);
      };
      checkSession();
      const tokens = await readMembership(address!, getContractAddress('membership', mainnet.id), signal, checkSession);
      checkSession(); return { tokens, verifiedAt: Date.now() };
    },
    enabled: current, networkMode: 'always', retry: false, retryOnMount: false, staleTime: MEMBERSHIP_REFRESH, gcTime: 0,
    refetchInterval: query => query.state.status === 'error' ? false : MEMBERSHIP_REFRESH,
    refetchOnMount: query => query.state.status !== 'error',
    refetchOnWindowFocus: query => query.state.status !== 'error',
  });
  const confirmMint = useCallback((hash: string) => membershipMintReceipts.record(session, hash, query.data?.tokens), [session, query.data]);
  const fresh = !!query.data && now - query.data.verifiedAt < MEMBERSHIP_FRESHNESS;
  const usable = current && query.isSuccess && fresh;
  const tokens = usable ? query.data!.tokens.map(t => ({ ...t, isExpired: t.isExpired || t.expiresAt <= Math.floor(now / 1000) })) : [];
  const active = tokens.filter(t => !t.isExpired);
  const activeExpiresAt = active.length ? Math.max(...active.map(t => t.expiresAt)) : undefined;
  const daysLeft = activeExpiresAt ? Math.max(0, Math.ceil((activeExpiresAt - now / 1000) / 86400)) : undefined;
  useEffect(() => {
    if (current && active.length > 0 && query.data) membershipMintReceipts.verified(session, query.data.verifiedAt, tokens);
  }, [current, active.length, session, query.data, pendingMint]);
  const refetch = useCallback(() => { void query.refetch(); }, [query.refetch]);
  return { isConnected, address, tokens, hasValidMembership: active.length > 0, activeExpiresAt, daysLeft,
    expiringSoon: active.length > 0 && daysLeft !== undefined && daysLeft <= RENEWAL_WINDOW_DAYS,
    isLoading: current && query.isFetching && !usable,
    error: current && (query.isError || (query.data && !fresh && !query.isFetching)) ? new Error(MEMBERSHIP_UNAVAILABLE) : null,
    refetch, sessionRevision: session.revision, pendingMint, confirmMint, isChecking: current && query.isFetching };
}
