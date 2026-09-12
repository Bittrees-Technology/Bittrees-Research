import { useState, useEffect } from "react";

type BNoteAmounts = {
    [key: number]: bigint;
};

export function BNoteAmountPicker({
                                      userBalances,
                                      contractBalances,
                                      onAmountsChange,
                                      mode,
                                  }: {
    userBalances: BNoteAmounts;
    contractBalances?: BNoteAmounts;
    onAmountsChange: (amounts: BNoteAmounts) => void;
    mode: "mint" | "redeem";
}) {
    const [amounts, setAmounts] = useState<BNoteAmounts>({
        1: BigInt(0),
        10: BigInt(0),
        100: BigInt(0),
    });

    useEffect(() => {
        onAmountsChange(amounts);
    }, [amounts, onAmountsChange]);

    const updateAmount = (denomination: number, value: string) => {
        const numValue = value === "" ? BigInt(0) : BigInt(Math.max(0, parseInt(value, 10)));
        setAmounts(prev => ({ ...prev, [denomination]: numValue }));
    };

    const getMaxAmount = (denomination: number) => {
        if (mode === "mint") {
            return userBalances[denomination];
        } else {
            // For redeem, use the minimum of user's BIT-equivalent amount and contract's BNOTE balance
            return contractBalances ? contractBalances[denomination] : BigInt(0);
        }
    };

    const setMaxAmount = (denomination: number) => {
        const maxAmount = getMaxAmount(denomination);
        setAmounts(prev => ({ ...prev, [denomination]: maxAmount }));
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="mb-6">
                <label className="block text-lg font-semibold text-primary mb-3">
                    Select BNOTE Amounts to {mode === "mint" ? "Lock" : "Redeem"}
                </label>

                <div className="space-y-4">
                    {[1, 10, 100].map((denomination) => {
                        const maxAmount = getMaxAmount(denomination);
                        const currentAmount = amounts[denomination];

                        return (
                            <div key={denomination} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center font-bold">
                                        {denomination}
                                    </div>
                                    <div>
                                        <div className="font-semibold">BNOTE-{denomination}</div>
                                        <div className="text-sm text-gray-600">
                                            {mode === "mint" ? "Available" : "Redeemable"}: {maxAmount.toString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max={maxAmount.toString()}
                                        value={currentAmount === BigInt(0) ? "" : currentAmount.toString()}
                                        onChange={(e) => updateAmount(denomination, e.target.value)}
                                        className="w-24 px-3 py-2 border border-gray-300 rounded-md text-right"
                                        placeholder="0"
                                    />
                                    <button data-insights="max"
                                        onClick={() => setMaxAmount(denomination)}
                                        className="px-3 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 text-sm"
                                        disabled={maxAmount === BigInt(0)}
                                    >
                                        Max
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-800">
                        <strong>Total BNOTE Value:</strong>{" "}
                        {(amounts[1] + amounts[10] * BigInt(10) + amounts[100] * BigInt(100)).toString()}
                    </div>
                </div>
            </div>
        </div>
    );
}