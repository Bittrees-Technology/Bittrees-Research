import {mainnet, base, sepolia, baseSepolia, Chain} from "wagmi/chains";
import {type Address} from "viem";

export type ChainId = Chain['id'];

export type ContractsConfig = {
    membership: Record<ChainId, Address>;
    bnote: Record<ChainId, Address>;
    bit: Record<ChainId, Address>;
    btree: Record<ChainId, Address>;
}

export type ContractName = keyof ContractsConfig;

// Production contracts (mainnet, base)
export const productionContracts: ContractsConfig = {
    membership: {
        [mainnet.id]: "0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335",
    },
    bnote: {
        [mainnet.id]: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        [base.id]: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
    },
    bit: {
        [mainnet.id]: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        [base.id]: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
    },
    btree: {

    }
};

// Testnet contracts (sepolia, baseSepolia)
export const testnetContracts: ContractsConfig = {
    membership: {
        [sepolia.id]: "0x0000000000000000000000000000000000000000", // TODO: Deploy to Sepolia
    },
    bnote: {
        [sepolia.id]: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        [baseSepolia.id]: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
    },
    bit: {
        [sepolia.id]: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        [baseSepolia.id]: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
    },
    btree: {
        
    }
};

// Combined contracts for all chains
export const contracts: ContractsConfig = {
    membership: {
        ...productionContracts.membership,
        ...testnetContracts.membership,
    },
    bnote: {
        ...productionContracts.bnote,
        ...testnetContracts.bnote,
    },
    bit: {
        ...productionContracts.bit,
        ...testnetContracts.bit,
    },
    btree: {
        ...productionContracts.btree,
        ...testnetContracts.btree,
    },
};

export function getContractAddress<T extends ContractName>(
    contractName: T,
    chainId: ChainId
): Address {
    const contract = contracts[contractName];
    const address = contract[chainId];

    if (!address || address === "0x0000000000000000000000000000000000000000") {
        throw new Error(`Contract ${contractName} not configured for chain ${chainId}`);
    }

    return address;
}

export function isContractConfiguredForChain<T extends ContractName>(
    contractName: T,
    chainId: ChainId
): boolean {
    const address = contracts[contractName][chainId];
    return Boolean(address && address !== "0x0000000000000000000000000000000000000000");
}