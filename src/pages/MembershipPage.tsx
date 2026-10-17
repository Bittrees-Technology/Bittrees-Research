import { MembershipGift } from "@/components/membership/MembershipGift";
import { MembershipRenew } from "@/components/membership/MembershipRenew";
import { MembershipCredentials } from "@/components/membership/MembershipCredentials";
import { PageHeader } from "@/components/PageHeader";
import { MembershipVerificationWait } from "@/components/membership/MembershipVerificationWait";
import { MembershipMint } from "@/components/membership/MembershipMint";
import { MembershipCard } from "@/components/membership/MembershipCard";
import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";
import { EXPLORERS } from "@/lib/links";

function fmtDate(unixSec: number): string {
  if (!unixSec) return "—";
  return new Date(unixSec * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MembershipPage() {
  const { tokens, daysLeft, expiringSoon, activeExpiresAt, refetch, isLoading, sessionRevision, pendingMint, isChecking, error } =
    useMembershipStatus();

  return (
    <div>
      <PageHeader
        center
        label="Membership"
        title="Your membership"
        intro="Nontransferable membership on Ethereum. New mints last 360 days; BIT renewal extends the same token and preserves its attached credentials."
      />

      <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "1fr", maxWidth: "640px", margin: "0 auto" }}>
        {/* Membership card */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: "420px", width: "100%" }}>
            <MembershipCard />
          </div>
        </div>

        {/* Status */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <span className="badge badge-member">Member</span>
            {daysLeft !== undefined && (
              <span style={{ fontSize: "0.875rem", color: expiringSoon ? "#B54708" : "var(--color-ink-muted)" }}>
                {expiringSoon ? "Expires in " : "Active for "}
                <strong>{daysLeft} days</strong>
                {activeExpiresAt ? ` · ${fmtDate(activeExpiresAt)}` : ""}
              </span>
            )}
          </div>

          {isLoading ? (
            <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>Loading tokens…</p>
          ) : tokens.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Expires</th>
                  <th className="right">Status</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={`${t.version}:${t.tokenId}`}>
                    <td className="tabular">#{t.tokenId}</td>
                    <td>{fmtDate(t.expiresAt)}</td>
                    <td className="right">
                      <span
                        className="badge"
                        style={
                          t.isExpired
                            ? { borderColor: "#B42318", color: "#B42318", background: "#FEF3F2" }
                            : { borderColor: "var(--color-secondary)", color: "var(--color-secondary-hover)", background: "#F0F6F2" }
                        }
                      >
                        {t.revoked ? "Revoked" : t.isExpired ? "Expired" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
              No membership tokens found for this wallet.
            </p>
          )}

          <p style={{ fontSize: "0.78rem", color: "var(--color-ink-dim)", marginTop: "0.9rem" }}>
            <a href={EXPLORERS.membership} target="_blank" rel="noreferrer" style={{ color: "var(--color-ink-muted)" }}>
              Membership contract ↗
            </a>
          </p>
        </div>

        <MembershipCredentials tokens={tokens} onChanged={refetch} />

        {/* Existing-token renewal is separate from fresh minting. */}
        {tokens.some(t=>t.version==="v2"&&!t.revoked&&!t.blocked) && <section className="card" aria-label="Renew or extend membership">
          <h2 className="text-title" style={{ marginBottom: "0.35rem" }}>
            Renew or extend membership
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)", marginBottom: "1.1rem" }}>
            Keep your existing token and attached credentials. Pay with BIT for the number of days you choose.
          </p>
          <MembershipRenew />
        </section>}
        <section className="card" aria-label="Mint a fresh membership">
          <h2 className="text-title">Mint a fresh membership</h2>
          <p>Create a separate membership token with ETH at the current mint price. Its term does not extend any existing membership.</p>
          {pendingMint ? <MembershipVerificationWait receipt={pendingMint} checking={isChecking} error={error} onRetry={refetch} />
            : <MembershipMint key={sessionRevision} mode="join" onMinted={refetch} />}
          <MembershipGift />
        </section>
      </div>
    </div>
  );
}
