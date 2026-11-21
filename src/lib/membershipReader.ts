import { mainnetTransport } from '../../shared/mainnet-rpc.mjs';
import { BaseError, HttpRequestError, TimeoutError, createPublicClient, type Abi, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import membershipAbi from '@/lib/constants/membership.abi.json';
import type { MembershipToken } from './membershipVerification';
import { boundedMembershipRead, MEMBERSHIP_UNAVAILABLE, MembershipReadError } from './membershipVerification';

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
    const client = createPublicClient({ chain: mainnet, transport: mainnetTransport(import.meta.env.VITE_MAINNET_RPC_URL, { fetchOptions: { signal: readSignal } }) });
    const chainRead = async <T>(read: () => Promise<T>) => {
      try { const value = await read(); check(); return value; }
      catch (error) { check(); throw chainFailure(error); }
    };
    if (await chainRead(() => client.getChainId()) !== 1) throw new MembershipReadError('Ethereum mainnet is required.');
    const block = await chainRead(() => client.getBlock({ blockTag: 'latest' }));
    if (Math.abs(Date.now() - Number(block.timestamp) * 1000) > 60_000) throw new MembershipReadError('Current membership evidence is unavailable.', true);
    const blockNumber = block.number;
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
    const canonical = await chainRead(() => client.getBlock({ blockNumber }));
    if (canonical.hash !== block.hash || Math.abs(Date.now() - Number(block.timestamp) * 1000) > 60_000) throw new MembershipReadError('Membership evidence changed. Please try again.', true);
    return currentTokens;
  }, signal);
}
