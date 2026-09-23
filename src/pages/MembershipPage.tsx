import { PageHeader } from "@/components/PageHeader";
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
  const { tokens, daysLeft, expiringSoon, activeExpiresAt, refetch, isLoading, sessionRevision } =
    useMembershipStatus();

  return (
    <div>
      <PageHeader
        center
        label="Membership"
        title="Your membership"
        intro="Membership is an on-chain pass — an ERC-1155 token on Ethereum, valid for 360 days. Renewing mints a fresh term; you keep access as long as any token is unexpired."
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
                  <tr key={t.tokenId}>
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
                        {t.isExpired ? "Expired" : "Active"}
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

        {/* Renew */}
        <div className="card">
          <h2 className="text-title" style={{ marginBottom: "0.35rem" }}>
            {expiringSoon ? "Renew now" : "Renew membership"}
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)", marginBottom: "1.1rem" }}>
            Mint a fresh 360-day term at any time. Terms stack — renewing early extends your
            furthest-out expiry.
          </p>
          <MembershipMint key={sessionRevision} mode="renew" onMinted={refetch} />
        </div>
      </div>
    </div>
  );
}
