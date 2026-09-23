import { createPublicClient, http, type Abi, type Address } from 'viem';
import { mainnet } from 'viem/chains';
import { createAlchemyClient } from '@/hooks/alchemy/useAlchemyNFTs';
import membershipAbi from '@/lib/constants/membership.abi.json';
import { boundedMembershipRead, candidateTokenIds, verifiedMembershipTokens, MEMBERSHIP_UNAVAILABLE } from './membershipVerification';

export function readMembership(owner: Address, contract: Address, signal: AbortSignal, checkSession: () => void) {
  return boundedMembershipRead(async checkDeadline => {
    const check = () => { checkDeadline(); checkSession(); };
    check();
    const alchemy = createAlchemyClient(mainnet.id, true);
    let pageKey: string | undefined;
    const seen = new Set<string>(), ids = new Set<string>();
    for (let page = 0; ; page++) {
      check();
      if (page >= 10) throw new Error(MEMBERSHIP_UNAVAILABLE);
      const response = await alchemy.nft.getNftsForOwner(owner, { contractAddresses: [contract], ...(pageKey ? { pageKey } : {}) });
      check();
      for (const id of candidateTokenIds(response.ownedNfts, contract)) ids.add(id);
      if (ids.size > 1_000) throw new Error(MEMBERSHIP_UNAVAILABLE);
      pageKey = response.pageKey;
      if (!pageKey) break;
      if (typeof pageKey !== 'string' || pageKey.length > 4096 || seen.has(pageKey)) throw new Error(MEMBERSHIP_UNAVAILABLE);
      seen.add(pageKey);
    }
    if (!ids.size) return [];
    const client = createPublicClient({ chain: mainnet, transport: http(import.meta.env.VITE_MAINNET_RPC_URL || undefined, { timeout: 8_000, retryCount: 0 }) });
    const blockNumber = await client.getBlockNumber(); check();
    const tokenIds = [...ids];
    const contracts = tokenIds.flatMap(id => [
      { address: contract, abi: membershipAbi as Abi, functionName: 'balanceOf', args: [owner, BigInt(id)] },
      { address: contract, abi: membershipAbi as Abi, functionName: 'isExpired', args: [BigInt(id)] },
      { address: contract, abi: membershipAbi as Abi, functionName: 'expirationTimestamps', args: [BigInt(id)] },
    ]);
    const results = await client.multicall({ contracts, blockNumber }); check();
    return verifiedMembershipTokens(tokenIds, results, Math.floor(Date.now() / 1000));
  }, signal);
}
