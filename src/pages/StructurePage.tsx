import { PageHeader } from "@/components/PageHeader";
import { TOKEN_STACK, ORG_ARMS, shortAddr } from "@/lib/research";

export default function StructurePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      <PageHeader
        label="Structure"
        title="Structure"
        intro="How Bittrees Research is organized — where the foundation sits and the on-chain token stack."
      />

      {/* Where Research sits */}
      <section>
        <h2 className="text-title" style={{ marginBottom: "1rem" }}>
          Where Research sits
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--color-ink-muted)", maxWidth: "65ch", marginBottom: "1.25rem" }}>
          Bittrees is a three-part organization. Research is the foundation — the
          Bitcoin-denominated capital intake that issues preferred stock (BNOTE) and the
          Index Token (BIT).
        </p>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {ORG_ARMS.map((arm) => {
            const inner = (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span className="text-label">{arm.here ? "You are here" : "Partner"}</span>
                  {arm.here && <span className="badge badge-member">Research</span>}
                </div>
                <h3 style={{ fontSize: "1.1rem", margin: "0.35rem 0 0.3rem" }}>{arm.name}</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)", margin: 0 }}>{arm.role}</p>
              </>
            );
            return arm.here ? (
              <div
                key={arm.name}
                className="card"
                style={{ borderColor: "var(--color-primary)", borderWidth: "1px", boxShadow: "0 1px 0 var(--color-primary)" }}
              >
                {inner}
              </div>
            ) : (
              <a key={arm.name} href={arm.href} className="card-link">
                {inner}
              </a>
            );
          })}
        </div>
      </section>

      {/* Token stack */}
      <section>
        <h2 className="text-title" style={{ marginBottom: "1rem" }}>
          The token stack
        </h2>
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Standard</th>
                <th>Chain</th>
                <th>Role</th>
                <th className="right">Contract</th>
              </tr>
            </thead>
            <tbody>
              {TOKEN_STACK.map((t) => (
                <tr key={t.key}>
                  <td>
                    <span className={`badge ${t.badgeClass}`}>{t.name}</span>
                  </td>
                  <td>{t.standard}</td>
                  <td>{t.chain}</td>
                  <td style={{ maxWidth: "30ch", color: "var(--color-ink-muted)" }}>{t.role}</td>
                  <td className="right">
                    <a
                      href={t.explorer}
                      target="_blank"
                      rel="noreferrer"
                      className="tabular"
                      style={{ color: "var(--color-ink-muted)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}
                    >
                      {shortAddr(t.address)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
