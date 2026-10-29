import { Link } from "react-router";
import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";
import { RESEARCH_LINKS, ROUTES } from "@/lib/links";

const VISION: string[] = [
  "At Bittrees Research, we are a purpose-driven organization that exists to advance society towards a more just and equitable future by funding public goods and promoting research in emerging technologies and systems innovation. We recognize the importance of historical and contextual relevance in our work, and strive to create new knowledge, tools, and systems that have a positive impact in the metaverse and beyond.",
  "Our organization is made up of a diverse group of individuals who are passionate about using their expertise and resources to create a better world. We bring together researchers, innovators, creatives, and community members to collaborate on cutting-edge projects that contribute to our shared vision of a more equitable and sustainable society.",
  "Our goals are to generate insights that can inform policy, strategy, and decision-making processes, to fund public goods that benefit humankind, and to foster innovation with a human-centric focus. We are committed to staying true to our values of transparency, accountability, and community-driven decision making in all aspects of our work.",
  "If you share our vision and want to be a part of this important work, we invite you to join us. Together, we can make a meaningful difference in the world.",
];

export default function Home() {
  const { daysLeft, expiringSoon } = useMembershipStatus();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {/* Hero + status */}
      <section style={{ textAlign: "center" }}>
        <span className="text-label" style={{ color: "var(--color-primary-hover)" }}>Members area</span>
        <h1 className="text-display" style={{ fontSize: "2.25rem", margin: "0.4rem 0 0.75rem" }}>
          Welcome to Bittrees Research
        </h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <span className="badge badge-member">Member</span>
          {daysLeft !== undefined && (
            <span style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)" }}>
              {expiringSoon ? "Expires in" : "Active for"}{" "}
              <strong style={{ color: expiringSoon ? "#B54708" : "var(--color-ink)" }}>{daysLeft} days</strong>
            </span>
          )}
          <Link to="/membership" className={expiringSoon ? "btn-primary" : "btn-ghost"} style={{ fontSize: "0.78rem", padding: "0.35rem 0.9rem" }}>
            {expiringSoon ? "Renew membership" : "Manage membership"}
          </Link>
        </div>
      </section>

      {/* Vision statement */}
      <section style={{ maxWidth: "720px", margin: "0 auto", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <span className="text-label" style={{ color: "var(--color-primary-hover)" }}>Our vision</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {VISION.map((p, i) => (
            <p key={i} style={{ fontFamily: "var(--font-serif)", fontSize: "1.0625rem", lineHeight: 1.7, color: "var(--color-ink-muted)", margin: 0 }}>
              {p}
            </p>
          ))}
        </div>
      </section>

      <hr className="gold-rule" style={{ maxWidth: "720px", margin: "0 auto", width: "100%" }} />

      {/* Contributor application */}
      <section style={{ textAlign: "center" }}>
        <Link to={ROUTES.contribute} className="btn-primary">
          Apply to contribute
        </Link>
      </section>

      {/* Secondary links */}
      <section style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", justifyContent: "center", paddingTop: "0.5rem" }}>
        {[
          { to: "/ethics", label: "Code of Ethics", external: false as const },
          { to: RESEARCH_LINKS.snapshot, label: "Snapshot ↗", external: true as const },
        ].map((l) =>
          l.external ? (
            <a key={l.to} href={l.to} target="_blank" rel="noreferrer" style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)", textDecoration: "none" }}>
              {l.label}
            </a>
          ) : (
            <Link key={l.to} to={l.to} style={{ fontSize: "0.85rem", color: "var(--color-ink-muted)", textDecoration: "none" }}>
              {l.label}
            </Link>
          )
        )}
      </section>
    </div>
  );
}
