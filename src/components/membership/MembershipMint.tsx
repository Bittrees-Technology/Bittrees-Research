import { useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEther, type Abi } from "viem";
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

/**
 * Join (mint) or Renew (re-mint) a Bittrees Research membership. Both call the
 * same on-chain action — mintMembership — which is payable in ETH; the minimum is
 * read live from the contract (mintPrice) and an optional donation rides on top.
 * Renewing mints a fresh term, whose length is the contract's expirationTimeframe.
 */
export function MembershipMint({ mode = "join", onMinted }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const onMainnet = chainId === mainnet.id;
  const { switchChain, isPending: switching } = useSwitchChain();

  const [donation, setDonation] = useState("");

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

  const donationWei = useMemo(() => {
    try {
      return donation ? parseEther(donation) : 0n;
    } catch {
      return 0n;
    }
  }, [donation]);
  const total = basePrice + donationWei;

  const { data: sim, error: simError } = useSimulateContract({
    address: MEMBERSHIP,
    abi: membershipAbi as Abi,
    functionName: "mintMembership",
    args: [address],
    value: total,
    chainId: mainnet.id,
    query: { enabled: Boolean(address) && onMainnet },
  });

  const { writeContract, data: hash, isPending: writing } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash, chainId: mainnet.id });

  const notifiedHash = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isSuccess && hash && notifiedHash.current !== hash) { notifiedHash.current = hash; onMinted?.(); }
  }, [isSuccess, hash, onMinted]);

  const verb = mode === "renew" ? "Renew" : "Join";

  if (isSuccess) {
    return (
      <div className="card-subtle" style={{ padding: "1.25rem", textAlign: "center" }}>
        <p className="text-title" style={{ marginBottom: "0.35rem" }}>
          {mode === "renew" ? "Membership renewed" : "Welcome to Bittrees Research"}
        </p>
        <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
          Your transaction is confirmed. Checking current ownership and expiry before opening the members area.
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
      <Row label="Minimum donation" value={`${formatEther(basePrice)} ETH`} />

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.45rem 1rem", alignItems: "center", fontSize: "0.875rem" }}>
        <span style={{ color: "var(--color-ink-muted)" }}>Add additional donation</span>
        <span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={donation}
            onChange={(e) => setDonation(e.target.value)}
            style={{
              width: "7rem",
              padding: "0.3rem 0.5rem",
              border: "1px solid var(--color-border)",
              borderRadius: "2px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.85rem",
            }}
          />{" "}
          ETH
        </span>
      </div>

      {mode === "renew" && (
        <Row label="Extends membership by" value={`${termDays} days`} hint="set by the contract" />
      )}

      <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: "0.6rem" }}>
        <Row label="Total contribution" value={`${formatEther(total)} ETH`} strong />
      </div>

      <p style={{ fontSize: "0.78rem", color: "var(--color-ink-dim)", margin: 0 }}>
        Memberships are subject to an expiration {termDays} days from the date of mint. Paid in
        ETH on Ethereum mainnet.
      </p>

      {simError && <p style={{ fontSize: "0.8rem", color: "#b42318" }}>{simError.message.split("\n")[0]}</p>}

      <button className="btn-primary" disabled={!sim?.request || busy} onClick={() => sim?.request && writeContract(sim.request)}>
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
