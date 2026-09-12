import { useCallback, useEffect, useState } from "react";
import { Address, formatUnits } from "viem";
import { useAccount, useChainId } from "wagmi";
import { base, baseSepolia, mainnet, sepolia } from "wagmi/chains";
import { BNoteAmountPicker } from "@/components/bit/BNoteAmountPicker.tsx";
import { useBITInformation } from "@/hooks/bit/useBITInformation";
import {
    useBNoteApproval,
    useBITMint,
    useBITRedeem,
    useBITCalculations,
} from "@/hooks/bit/useBITOperations";

const BIT_CONTRACT_CONFIGS = {
    [mainnet.id]: {
        BIT: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        BNOTE: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        EXPLORER: "etherscan.io",
    },
    [sepolia.id]: {
        BIT: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        BNOTE: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        EXPLORER: "sepolia.etherscan.io",
    },
    [baseSepolia.id]: {
        BIT: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        BNOTE: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        EXPLORER: "sepolia.basescan.org",
    },
    [base.id]: {
        BIT: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
        BNOTE: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
        EXPLORER: "basescan.org",
    },
} as const;

type BNoteAmounts = {
    [key: number]: bigint;
};

export function MintBIT() {
    const [mode, setMode] = useState<"mint" | "redeem">("mint");
    const [selectedAmounts, setSelectedAmounts] = useState<BNoteAmounts>({
        1: BigInt(0),
        10: BigInt(0),
        100: BigInt(0),
    });
    const [transactionComplete, setTransactionComplete] = useState(false);
    const [transactionHash, setTransactionHash] = useState<Address | undefined>();
    const [approvalInProgress, setApprovalInProgress] = useState(false);
    const [operationInProgress, setOperationInProgress] = useState(false);

    const chainId = useChainId();
    const { address } = useAccount();

    const isSupported = chainId in BIT_CONTRACT_CONFIGS;
    const config = isSupported
        ? BIT_CONTRACT_CONFIGS[chainId as keyof typeof BIT_CONTRACT_CONFIGS]
        : BIT_CONTRACT_CONFIGS[1]; // Default to mainnet config

    const explorerDomain = config.EXPLORER;

    const {
        bitBalance,
        bnoteBalances,
        isApprovedForAll,
        bitContractBnoteBalances,
        totalUserBnoteValue,
        displayValues,
        isLoading: isLoadingInfo,
        refetch: refetchInfo,
    } = useBITInformation({
        walletAddress: address,
        bitContractAddress: config.BIT,
        bnoteContractAddress: config.BNOTE,
    });

    const { sendApproval, approvalTransactionResult } = useBNoteApproval({
        bnoteContractAddress: config.BNOTE,
        bitContractAddress: config.BIT,
        chainId,
    });

    // Convert amounts to arrays for contract calls
    const { bnoteIds, bnoteAmounts } = convertAmountsToArrays(selectedAmounts);

    const { mintAmount, totalRedeemBits, baseBits, premiumBits, isLoading: isLoadingCalculations } =
        useBITCalculations({
            bitContractAddress: config.BIT,
            bnoteIds,
            bnoteAmounts,
        });

    const { mintBIT, isSuccessfulMint, txData: mintTxData } = useBITMint({
        bitContractAddress: config.BIT,
        bnoteIds,
        bnoteAmounts,
    });

    const { redeemBIT, isSuccessfulRedeem, txData: redeemTxData } = useBITRedeem({
        bitContractAddress: config.BIT,
        bnoteIds,
        bnoteAmounts,
    });

    // Handle approval completion
    useEffect(() => {
        if (approvalTransactionResult?.status === "success") {
            setApprovalInProgress(false);
            refetchInfo(); // Refresh approval status
        }
    }, [approvalTransactionResult?.status, refetchInfo]);

    // Handle transaction completion
    useEffect(() => {
        if (isSuccessfulMint) {
            setTransactionComplete(true);
            setTransactionHash(mintTxData);
            setOperationInProgress(false);
            refetchInfo();
        }
    }, [isSuccessfulMint, mintTxData, refetchInfo]);

    useEffect(() => {
        if (isSuccessfulRedeem) {
            setTransactionComplete(true);
            setTransactionHash(redeemTxData);
            setOperationInProgress(false);
            refetchInfo();
        }
    }, [isSuccessfulRedeem, redeemTxData, refetchInfo]);

    const handleOperation = useCallback(() => {
        if (!isApprovedForAll && mode === "mint") {
            setApprovalInProgress(true);
            sendApproval();
            return;
        }

        setOperationInProgress(true);
        if (mode === "mint") {
            mintBIT();
        } else {
            redeemBIT();
        }
    }, [mode, isApprovedForAll, sendApproval, mintBIT, redeemBIT]);

    const hasSelectedAmounts = Object.values(selectedAmounts).some(amount => amount > BigInt(0));
    const canProceed = hasSelectedAmounts && !operationInProgress && !approvalInProgress;

    const needsApproval = mode === "mint" && !isApprovedForAll;
    const insufficientBitBalance = mode === "redeem" && bitBalance < totalRedeemBits;

    if (!address) {
        return (
            <div className="text-center p-8">
                <p className="text-lg">Please connect your wallet to interact with BIT tokens.</p>
            </div>
        );
    }

    if (!isSupported) {
        return (
            <div className="text-center p-8">
                <p className="text-lg text-red-500">
                    BIT contract is not deployed on this network.
                </p>
            </div>
        );
    }

    if (transactionComplete) {
        return (
            <div className="max-w-2xl mx-auto p-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <h2 className="text-2xl font-bold text-green-800 mb-4">
                        {mode === "mint" ? "BIT Minting" : "BIT Redemption"} Completed!
                    </h2>
                    <p className="text-green-700 mb-4">
                        Your transaction has been successfully completed.
                    </p>
                    {transactionHash && (
                        <p className="mb-4">
                            <a
                                href={`https://${explorerDomain}/tx/${transactionHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline hover:text-blue-800"
                            >
                                View transaction on explorer
                            </a>
                        </p>
                    )}
                    <button data-insights="make-another-transaction"
                        onClick={() => {
                            setTransactionComplete(false);
                            setTransactionHash(undefined);
                            setSelectedAmounts({ 1: BigInt(0), 10: BigInt(0), 100: BigInt(0) });
                        }}
                        className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                    >
                        Make Another Transaction
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            {/* Mode Toggle */}
            <div className="mb-8">
                <div className="flex justify-center">
                    <div className="bg-gray-100 rounded-lg p-1">
                        <button data-insights="mint-bit"
                            onClick={() => setMode("mint")}
                            className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                                mode === "mint"
                                    ? "bg-white text-primary shadow-sm"
                                    : "text-gray-600 hover:text-gray-800"
                            }`}
                        >
                            Mint BIT
                        </button>
                        <button data-insights="redeem-bit"
                            onClick={() => setMode("redeem")}
                            className={`px-6 py-2 rounded-md font-semibold transition-colors ${
                                mode === "redeem"
                                    ? "bg-white text-primary shadow-sm"
                                    : "text-gray-600 hover:text-gray-800"
                            }`}
                        >
                            Redeem BIT
                        </button>
                    </div>
                </div>
            </div>

            {/* Balances Display */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Your Balances</h3>
                    {isLoadingInfo ? (
                        <div>Loading...</div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span>BIT Tokens:</span>
                                <span className="font-semibold">{displayValues.bitBalance}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>BNOTE-1:</span>
                                <span>{bnoteBalances[1].toString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>BNOTE-10:</span>
                                <span>{bnoteBalances[10].toString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>BNOTE-100:</span>
                                <span>{bnoteBalances[100].toString()}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-semibold">
                                <span>Total BNOTE Value:</span>
                                <span>{totalUserBnoteValue.toString()}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Contract Information</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span>Contract BNOTE-1:</span>
                            <span>{bitContractBnoteBalances[1].toString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Contract BNOTE-10:</span>
                            <span>{bitContractBnoteBalances[10].toString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Contract BNOTE-100:</span>
                            <span>{bitContractBnoteBalances[100].toString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Amount Picker */}
            <BNoteAmountPicker
                userBalances={bnoteBalances}
                contractBalances={mode === "redeem" ? bitContractBnoteBalances : undefined}
                onAmountsChange={setSelectedAmounts}
                mode={mode}
            />

            {/* Calculation Display */}
            {hasSelectedAmounts && (
                <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4">
                        {mode === "mint" ? "Mint Preview" : "Redeem Preview"}
                    </h3>
                    {isLoadingCalculations ? (
                        <div>Calculating...</div>
                    ) : (
                        <div className="space-y-2">
                            {mode === "mint" ? (
                                <div className="flex justify-between font-semibold">
                                    <span>BIT Tokens to Receive:</span>
                                    <span>{formatUnits(mintAmount, 18)}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between">
                                        <span>Base BIT Required:</span>
                                        <span>{formatUnits(baseBits, 18)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Premium BIT Required:</span>
                                        <span>{formatUnits(premiumBits, 18)}</span>
                                    </div>
                                    <div className="flex justify-between font-semibold border-t pt-2">
                                        <span>Total BIT Required:</span>
                                        <span>{formatUnits(totalRedeemBits, 18)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Action Button */}
            <div className="mt-8">
                <button
                    onClick={handleOperation}
                    disabled={
                        !canProceed ||
                        !hasSelectedAmounts ||
                        (mode === "redeem" && insufficientBitBalance)
                    }
                    className="w-full bg-primary text-black font-semibold py-4 px-6 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {approvalInProgress
                        ? "Approving BNOTE Transfer..."
                        : operationInProgress
                            ? mode === "mint"
                                ? "Minting BIT..."
                                : "Redeeming BIT..."
                            : needsApproval
                                ? "Approve BNOTE Transfer"
                                : insufficientBitBalance
                                    ? "Insufficient BIT Balance"
                                    : mode === "mint"
                                        ? "Mint BIT Tokens"
                                        : "Redeem BIT Tokens"}
                </button>

                {needsApproval && (
                    <p className="text-sm text-gray-600 mt-2 text-center">
                        You need to approve the BIT contract to transfer your BNOTE tokens first.
                    </p>
                )}
            </div>
        </div>
    );
}

function convertAmountsToArrays(amounts: BNoteAmounts): {
    bnoteIds: bigint[];
    bnoteAmounts: bigint[];
} {
    const bnoteIds: bigint[] = [];
    const bnoteAmounts: bigint[] = [];

    Object.entries(amounts).forEach(([id, amount]) => {
        if (amount > BigInt(0)) {
            bnoteIds.push(BigInt(id));
            bnoteAmounts.push(amount);
        }
    });

    return { bnoteIds, bnoteAmounts };
}