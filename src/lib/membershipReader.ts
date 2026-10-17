import { BaseError, HttpRequestError, TimeoutError, createPublicClient, http, type Abi, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { ALCHEMY_API_KEY } from './alchemyConfig';
import { discoverMembershipPage } from './membershipDiscovery';
import membershipAbi from '@/lib/constants/membership.abi.json';
import legacyAbi from '@/lib/constants/legacy-membership.abi.json';
import type { MembershipToken } from './membershipVerification';
export const LEGACY_MEMBERSHIP = '0xc8121e650bd797d8b9dad00227a9a77ef603a84a' as Address;
import { boundedMembershipRead, verifiedMembershipTokens, MEMBERSHIP_UNAVAILABLE, MembershipReadError } from './membershipVerification';

function chainFailure(error: unknown) {
  const transport = error instanceof BaseError
    ? error.walk(cause => cause instanceof HttpRequestError || cause instanceof TimeoutError) : undefined;
  const status = transport instanceof HttpRequestError ? transport.status : undefined;
  if (status === 401 || status === 403) {
    return new MembershipReadError('The Ethereum service denied access. The site operator needs to check its API configuration.');
  }
  const retryable = transport instanceof TimeoutError || (transport instanceof HttpRequestError
    && (status === undefined || status === 408 || status === 429 || status >= 500));
  return new MembershipReadError('The Ethereum membership check is unavailable. Please try again.', retryable);
}

export function readMembership(owner: Address, contract: Address, signal: AbortSignal, checkSession: () => void) {
  return boundedMembershipRead(async (checkDeadline, readSignal) => {
    const check = () => { checkDeadline(); checkSession(); };
    check();
    const client = createPublicClient({ chain: mainnet, transport: http(import.meta.env.VITE_MAINNET_RPC_URL || undefined, { timeout: 8_000, retryCount: 0, fetchOptions: { signal: readSignal } }) });
    const chainRead = async <T>(read: () => Promise<T>) => {
      try { const value = await read(); check(); return value; }
      catch (error) { check(); throw chainFailure(error); }
    };
    const blockNumber = await chainRead(() => client.getBlockNumber());
    const blocked = await chainRead(() => client.readContract({ address: contract, abi: membershipAbi as Abi, functionName: 'blockedWallets', args: [owner], blockNumber }));
    if (blocked !== false) throw new MembershipReadError('This wallet is blocked from Research membership.');
    const last = await chainRead(() => client.readContract({ address: contract, abi: membershipAbi as Abi, functionName: 'lastTokenId', blockNumber })) as bigint;
    if (typeof last !== 'bigint' || last < 0n || last > 10000n) throw new MembershipReadError('Membership enumeration needs an indexer update.');
    const currentTokens: MembershipToken[] = [];
    // Direct chain enumeration avoids NFT-indexer lag immediately after minting.
    for (let start = 1n; start <= last; start += 100n) {
      const batchIds = Array.from({ length: Number(last-start+1n < 100n ? last-start+1n : 100n) }, (_, i) => start+BigInt(i));
      const reads = batchIds.flatMap(id => [
        { address: contract, abi: membershipAbi as Abi, functionName: 'balanceOf', args: [owner,id] },
        { address: contract, abi: membershipAbi as Abi, functionName: 'isActiveMember', args: [owner,id] },
        { address: contract, abi: membershipAbi as Abi, functionName: 'expirationTimestamps', args: [id] },
        { address: contract, abi: membershipAbi as Abi, functionName: 'revokedMemberships', args: [id] },
      ]);
      const results = await chainRead(() => client.multicall({ contracts: reads, blockNumber, allowFailure: false }));
      for (let i=0; i<batchIds.length; i++) {
        const [balance, active, expiry, revoked] = results.slice(i*4,i*4+4);
        if (typeof balance !== 'bigint' || typeof active !== 'boolean' || typeof expiry !== 'bigint' || typeof revoked !== 'boolean') throw new Error(MEMBERSHIP_UNAVAILABLE);
        if (balance > 0n) currentTokens.push({ tokenId: batchIds[i].toString(), version: 'v2', expiresAt: Number(expiry), isExpired: expiry <= BigInt(Math.floor(Date.now()/1000)), active, revoked });
      }
    }
    // Legacy passes retain access, but cannot bypass the new wallet block above.
    // A valid v2 pass does not depend on the legacy NFT indexer's availability.
    if (currentTokens.some(t => t.active)) return currentTokens;
    let pageKey: string | undefined;
    const seen = new Set<string>(), ids = new Set<string>();
    for (let page = 0; ; page++) {
      check();
      if (page >= 10) throw new Error(MEMBERSHIP_UNAVAILABLE);
      const response = await discoverMembershipPage(ALCHEMY_API_KEY, owner, LEGACY_MEMBERSHIP, readSignal, pageKey);
      check();
      for (const id of response.ids) ids.add(id);
      if (ids.size > 1_000) throw new Error(MEMBERSHIP_UNAVAILABLE);
      if (response.pageKey === undefined || response.pageKey === null || response.pageKey === '') break;
      if (typeof response.pageKey !== 'string' || response.pageKey.length > 4096 || seen.has(response.pageKey)) throw new Error(MEMBERSHIP_UNAVAILABLE);
      pageKey = response.pageKey;
      seen.add(pageKey);
    }
    if (!ids.size) return currentTokens;
    const tokenIds = [...ids];
    const contracts = tokenIds.flatMap(id => [
      { address: LEGACY_MEMBERSHIP, abi: legacyAbi as Abi, functionName: 'balanceOf', args: [owner, BigInt(id)] },
      { address: LEGACY_MEMBERSHIP, abi: legacyAbi as Abi, functionName: 'isExpired', args: [BigInt(id)] },
      { address: LEGACY_MEMBERSHIP, abi: legacyAbi as Abi, functionName: 'expirationTimestamps', args: [BigInt(id)] },
    ]);
    const results = await chainRead(() => client.multicall({ contracts, blockNumber }));
    // Multicall returns transport errors inside individual results by default.
    for (const result of results) if (result.status === 'failure') throw chainFailure(result.error);
    return [...currentTokens, ...verifiedMembershipTokens(tokenIds, results, Math.floor(Date.now() / 1000)).map(t => ({ ...t, version: 'legacy' as const }))];
  }, signal);
}
