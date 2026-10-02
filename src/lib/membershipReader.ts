import { BaseError, HttpRequestError, TimeoutError, createPublicClient, http, type Abi, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { ALCHEMY_API_KEY } from './alchemyConfig';
import { discoverMembershipPage } from './membershipDiscovery';
import membershipAbi from '@/lib/constants/membership.abi.json';
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
    let pageKey: string | undefined;
    const seen = new Set<string>(), ids = new Set<string>();
    for (let page = 0; ; page++) {
      check();
      if (page >= 10) throw new Error(MEMBERSHIP_UNAVAILABLE);
      const response = await discoverMembershipPage(ALCHEMY_API_KEY, owner, contract, readSignal, pageKey);
      check();
      for (const id of response.ids) ids.add(id);
      if (ids.size > 1_000) throw new Error(MEMBERSHIP_UNAVAILABLE);
      if (response.pageKey === undefined || response.pageKey === null || response.pageKey === '') break;
      if (typeof response.pageKey !== 'string' || response.pageKey.length > 4096 || seen.has(response.pageKey)) throw new Error(MEMBERSHIP_UNAVAILABLE);
      pageKey = response.pageKey;
      seen.add(pageKey);
    }
    if (!ids.size) return [];
    const client = createPublicClient({ chain: mainnet, transport: http(import.meta.env.VITE_MAINNET_RPC_URL || undefined, { timeout: 8_000, retryCount: 0, fetchOptions: { signal: readSignal } }) });
    const chainRead = async <T>(read: () => Promise<T>) => {
      try { const value = await read(); check(); return value; }
      catch (error) { check(); throw chainFailure(error); }
    };
    const blockNumber = await chainRead(() => client.getBlockNumber());
    const tokenIds = [...ids];
    const contracts = tokenIds.flatMap(id => [
      { address: contract, abi: membershipAbi as Abi, functionName: 'balanceOf', args: [owner, BigInt(id)] },
      { address: contract, abi: membershipAbi as Abi, functionName: 'isExpired', args: [BigInt(id)] },
      { address: contract, abi: membershipAbi as Abi, functionName: 'expirationTimestamps', args: [BigInt(id)] },
    ]);
    const results = await chainRead(() => client.multicall({ contracts, blockNumber }));
    // Multicall returns transport errors inside individual results by default.
    for (const result of results) if (result.status === 'failure') throw chainFailure(result.error);
    return verifiedMembershipTokens(tokenIds, results, Math.floor(Date.now() / 1000));
  }, signal);
}
