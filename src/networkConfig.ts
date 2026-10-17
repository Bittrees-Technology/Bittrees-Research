import { mainnet, base, sepolia, baseSepolia } from "wagmi/chains";

export const PRODUCTION_CHAINS = [mainnet, base] as const;
export const TESTNET_CHAINS = [sepolia, baseSepolia] as const;
export const ALL_CHAINS = [...PRODUCTION_CHAINS, ...TESTNET_CHAINS] as const;

export type SupportedChain = typeof ALL_CHAINS[number];

export const getChainConfig = (enableTestnets: boolean) => {
    return enableTestnets ? ALL_CHAINS : PRODUCTION_CHAINS;
};

// Membership contract addresses by network
export const MEMBERSHIP_CONTRACTS = {
    [mainnet.id]: "0xcecd807193cf79b59e9c849b9cccba10dd6f8335",
} as const;

// Determine which network to check for membership based on current network
export const getMembershipCheckNetwork = (currentChainId: number): number => {
    // If connected to testnet, check Sepolia for membership (when available)
    // For now, always check mainnet as membership NFTs need to be deployed to Sepolia
    if (TESTNET_CHAINS.some(chain => chain.id === currentChainId)) {
        return mainnet.id; // Change to sepolia.id when membership contract is deployed there
    }

    // If connected to mainnet chains, check mainnet
    return mainnet.id;
};