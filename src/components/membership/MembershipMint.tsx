import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";
import { useEffect, useRef, useState } from "react";
import { formatEther, type Abi } from "viem";
import { mainnet } from "wagmi/chains";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSimulateContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import membershipAbi from "@/lib/constants/membership.abi.json";
import { getContractAddress } from "@/lib/constants/contracts";

const MEMBERSHIP = getContractAddress("membership", mainnet.id);

interface Props {
  mode?: "join" | "renew";
  onMinted?: () => void;
}

/** Fresh mint only; renewal preserves the existing token and uses BIT. */
export function MembershipMint({ onMinted }: Props) {
  const { address } = useAccount();
  const { confirmMint } = useMembershipStatus();
  const replacementHash = useRef<string | null>(null);
  const replacementAllowed = useRef(true);
  const [replacementNotice, setReplacementNotice] = useState(false);
  const submission = useRef<((hash: string) => boolean) | null>(null);
  const chainId = useChainId();
  const onMainnet = chainId === mainnet.id;
  const { switchChain, isPending: switching } = useSwitchChain();

  const [confirmedHash, setConfirmedHash] = useState<string | null>(null);

  const { data: priceWei } = useReadContract({
    address: MEMBERSHIP,
    abi: membershipAbi as Abi,
    functionName: "mintPrice",
    chainId: mainnet.id,
  });
  const { data: termSec } = useReadContract({
    address: MEMBERSHIP,
    abi: membershipAbi as Abi,
    functionName: "expirationTimeframe",
    chainId: mainnet.id,
  });
  const basePrice = (priceWei as bigint | undefined) ?? 0n;
  const termDays = termSec ? Math.round(Number(termSec as bigint) / 86400) : 360;

  const total = basePrice;

  const { data: sim, error: simError } = useSimulateContract({
    address: MEMBERSHIP,
    abi: membershipAbi as Abi,
    functionName: "mintMembership",
    args: [address],
    value: total,
    chainId: mainnet.id,
    query: { enabled: Boolean(address) && onMainnet && typeof priceWei === "bigint" },
  });

  const { writeContract, reset, data: hash, isPending: writing } = useWriteContract();
  const { data: receipt, isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: mainnet.id,
    onReplaced: ({ reason, transactionReceipt }) => {
      if (reason === 'repriced') replacementHash.current = transactionReceipt.transactionHash;
      else { replacementAllowed.current = false; setReplacementNotice(true); }
    },
  });

  const notifiedHash = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isSuccess && receipt?.status === 'success' && hash && notifiedHash.current !== hash && submission.current) {
      const confirmedTransaction = receipt.transactionHash;
      if (typeof confirmedTransaction !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(confirmedTransaction) || !replacementAllowed.current
        || (confirmedTransaction.toLowerCase() !== hash.toLowerCase() && confirmedTransaction.toLowerCase() !== replacementHash.current?.toLowerCase())) {
        setReplacementNotice(true); return;
      }
      notifiedHash.current = hash;
      if (submission.current?.(receipt.transactionHash)) { setConfirmedHash(receipt.transactionHash); onMinted?.(); }
    }
  }, [isSuccess, receipt, hash, onMinted]);

  const verb = "Mint membership";

  if (replacementNotice) {
    return <section role="alert">
      <h2 className="text-title">Transaction changed</h2>
      <p>The original membership transaction was cancelled or replaced. Review your wallet’s transaction history before trying again.</p>
      <button className="btn-primary" onClick={() => { reset(); submission.current = null; replacementHash.current = null; replacementAllowed.current = true; notifiedHash.current = undefined; setReplacementNotice(false); }}>Return to membership options</button>
    </section>;
  }

  if (confirmedHash) {
    return (
      <div className="card-subtle" style={{ padding: "1.25rem", textAlign: "center" }}>
        <p className="text-title" style={{ marginBottom: "0.35rem" }}>
          Transaction confirmed
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
          Your transaction is confirmed. Checking current membership validity.
        </p>
      </div>
    );
  }

  if (!address) {
    return (
      <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
        Connect your wallet to {verb.toLowerCase()}.
      </p>
    );
  }

  if (!onMainnet) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
          Membership lives on Ethereum mainnet. Switch networks to continue.
        </p>
        <button className="btn-primary" disabled={switching} onClick={() => switchChain({ chainId: mainnet.id })}>
          {switching ? "Switching…" : "Switch to Ethereum"}
        </button>
      </div>
    );
  }

  const busy = writing || confirming;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <Row label="Mint price" value={typeof priceWei === "bigint" ? `${formatEther(basePrice)} ETH` : "Loading…"} />

      <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: "0.6rem" }}>
        <Row label="Mint payment" value={`${formatEther(total)} ETH`} strong />
      </div>

      <p style={{ fontSize: "0.78rem", color: "var(--color-ink-dim)", margin: 0 }}>
        Memberships are subject to an expiration {termDays} days from the date of mint. Paid in
        ETH on Ethereum mainnet.
      </p>

      {simError && <p style={{ fontSize: "0.8rem", color: "#b42318" }}>{simError.message.split("\n")[0]}</p>}

      <button className="btn-primary" disabled={!sim?.request || busy} onClick={() => { if (sim?.request && !busy) { submission.current = confirmMint; replacementHash.current = null; replacementAllowed.current = true; writeContract(sim.request); } }}>
        {busy ? (confirming ? "Confirming…" : "Check wallet…") : `${verb} — ${formatEther(total)} ETH`}
      </button>
    </div>
  );
}

function Row({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem", fontSize: "0.875rem" }}>
      <span style={{ color: "var(--color-ink-muted)", fontWeight: strong ? 700 : 400 }}>
        {label}
        {hint && <span style={{ color: "var(--color-ink-dim)", fontWeight: 400 }}> · {hint}</span>}
      </span>
      <span className="tabular" style={{ fontWeight: strong ? 700 : 500 }}>
        {value}
      </span>
    </div>
  );
}
