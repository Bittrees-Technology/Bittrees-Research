import { useQuery } from '@tanstack/react-query';
import {Alchemy, OwnedNft} from 'alchemy-sdk';
import type { ChainId } from '@/lib/constants/contracts';
import {CHAIN_TO_ALCHEMY_NETWORK} from "@/lib/constants/chains.ts";

import { ALCHEMY_API_KEY } from '@/lib/alchemyConfig';

/**
 * Generic hook to get NFTs for specific contracts on any supported chain
 */
// Last result is mirrored to localStorage so a reload can paint instantly from
// cache while the network refetch runs in the background (see initialData below).
const nftsCacheKey = (owner: string, contracts: string[], chainId: ChainId) =>
    `br_nfts_${chainId}_${owner.toLowerCase()}_${contracts.join(",").toLowerCase()}`;
function readNftsCache(key: string): OwnedNft[] | undefined {
    try { const c = JSON.parse(localStorage.getItem(key) || "null"); return Array.isArray(c) ? c : undefined; }
    catch { return undefined; }
}

export function useAlchemyNFTs(
    ownerAddress: string | undefined,
    contractAddresses: string[],
    chainId: ChainId
) {
    const cacheKey = ownerAddress && contractAddresses.length
        ? nftsCacheKey(ownerAddress, contractAddresses, chainId)
        : undefined;
    return useQuery({
        queryKey: ['alchemy', 'nfts', ownerAddress, contractAddresses, chainId],
        queryFn: async (): Promise<OwnedNft[]> => {
            if (!ownerAddress || !contractAddresses.length) return [];

            const alchemyNetwork = CHAIN_TO_ALCHEMY_NETWORK[chainId];
            if (!alchemyNetwork) {
                throw new Error(`Alchemy not supported for chain ${chainId}`);
            }

            // Create client for this specific network (lightweight operation)
            const alchemy = new Alchemy({
                apiKey: ALCHEMY_API_KEY,
                network: alchemyNetwork,
            });

            let pagingToken: string | undefined = undefined;
            const ownedNfts: OwnedNft[] = [];
            do {
                const opts: { contractAddresses: string[]; pageKey?: string } = { contractAddresses };
                if (pagingToken) opts.pageKey = pagingToken;
                const response = await alchemy.nft.getNftsForOwner(ownerAddress, opts);

                ownedNfts.push(...response.ownedNfts);
                pagingToken = response.pageKey;
            } while (pagingToken)

            try { if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(ownedNfts)); } catch { /* quota */ }
            return ownedNfts;
        },
        enabled: Boolean(ownerAddress && contractAddresses.length > 0),
        staleTime: 5 * 60_000,
        // Seed from the last cached result so the membership gate/page renders
        // immediately on reload; updatedAt 0 marks it stale so it still revalidates.
        initialData: cacheKey ? () => readNftsCache(cacheKey) : undefined,
        initialDataUpdatedAt: 0,
    });
}