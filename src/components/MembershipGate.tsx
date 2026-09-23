import { Link } from "react-router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { BittreesMark } from "@/components/Brand";
import { MembershipMint } from "@/components/membership/MembershipMint";
import { MembershipCard } from "@/components/membership/MembershipCard";
import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";
import { FAMILY_LINKS } from "@/lib/links";

/**
 * Full-screen membership gate. Everything on Bittrees Research is members-only.
 * On connect we check the wallet and route to the right action — enter (valid,
 * handled by Layout), mint a new membership (none), or extend an expired one.
 * A successful mint flips the app into the members area via onJoined().
 */
export function MembershipGate({ onJoined }: { onJoined: () => void }) {
  const { isConnected } = useAccount();
  const { isLoading, tokens } = useMembershipStatus();

  const hasExpired = tokens.length > 0; // reaching the gate while holding tokens ⇒ all expired
  const mode: "join" | "renew" = hasExpired ? "renew" : "join";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
      {/* Minimal top bar */}
      <header style={{ borderBottom: "1px solid var(--color-border)", background: "#fff" }}>
        <div
          style={{
            maxWidth: "1000px",
            margin: "0 auto",
            padding: "0 1.5rem",
            height: "56px",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <BittreesMark />
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "-0.01em" }}>
            Bittrees Research
          </span>
          <div style={{ marginLeft: "auto" }}>
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "760px",
          margin: "0 auto",
          padding: "3.5rem 1.5rem",
          textAlign: "center",
        }}
      >
        <span className="text-label" style={{ color: "var(--color-primary-hover)" }}>
          Members only
        </span>
        <h1 className="text-display" style={{ fontSize: "2.4rem", margin: "0.6rem 0 1.5rem" }}>
          Bittrees Research
        </h1>

        <div style={{ maxWidth: "62ch", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1rem", textAlign: "left" }}>
          <p style={{ fontSize: "1.0rem", color: "var(--color-ink-muted)", lineHeight: 1.7, margin: 0 }}>
            Bittrees Research is an organization focused on promoting research in emerging
            technologies, systems innovation, and related fields with a goal of creating new
            knowledge and tools whilst fostering innovation with a positive impact in the
            metaverse and beyond.
          </p>
          <p style={{ fontSize: "1.0rem", color: "var(--color-ink-muted)", lineHeight: 1.7, margin: 0 }}>
            By studying a wide range of topics, Bittrees Research generates insights that can
            inform policy, strategy, and decision-making processes, helping to advance society
            towards a better future.
          </p>
          <p style={{ fontSize: "1.0rem", color: "var(--color-ink-muted)", lineHeight: 1.7, margin: 0 }}>
            Bittrees Research places a strong emphasis on historical and contextual relevance,
            recognizing the importance of understanding past successes and failures in order to
            develop effective solutions for a more just and equitable society. Join the
            conversation on how emerging technologies and systems innovation can help create a
            more equitable and sustainable world.
          </p>
        </div>

        {/* Membership card */}
        <div style={{ margin: "2.5rem auto 0", maxWidth: "440px" }}>
          <MembershipCard />
        </div>

        {/* Action */}
        <div className="card" style={{ margin: "1.75rem auto 0", maxWidth: "440px", textAlign: "left" }}>
          {!isConnected ? (
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.85rem", alignItems: "center" }}>
              <h2 className="text-title">Connect to enter</h2>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)", margin: 0 }}>
                Connect your wallet — members go straight in; everyone else can join.
              </p>
              <ConnectButton chainStatus="icon" showBalance={false} />
            </div>
          ) : isLoading ? (
            <p style={{ textAlign: "center", fontSize: "0.9rem", color: "var(--color-ink-muted)", margin: 0 }}>
              Checking your membership&hellip;
            </p>
          ) : (
            <>
              <h2 className="text-title" style={{ marginBottom: "0.35rem" }}>
                {mode === "renew" ? "Your membership has expired" : "Join Bittrees Research"}
              </h2>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)", marginBottom: "1.1rem" }}>
                {mode === "renew"
                  ? "Extend your membership to return to the members area."
                  : "Membership is an on-chain pass (an ERC-1155 token on Ethereum) valid for 360 days."}
              </p>
              <MembershipMint mode={mode} onMinted={onJoined} />
            </>
          )}
        </div>
        <p style={{ marginTop: "1.5rem" }}><Link to="/chat-recovery">Recover local data for Chat</Link></p>
      </main>

      <footer style={{ borderTop: "1px solid var(--color-border)", background: "#fff" }}>
        <div
          style={{
            maxWidth: "1000px",
            margin: "0 auto",
            padding: "1rem 1.5rem",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="text-label">Bittrees</span>
          {FAMILY_LINKS.map((l) => (
            <a key={l.href} href={l.href} style={{ fontSize: "0.8rem", color: "var(--color-ink-muted)", textDecoration: "none" }}>
              {l.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
