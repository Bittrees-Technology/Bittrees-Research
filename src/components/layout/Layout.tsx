import { Link, Outlet } from "react-router";
import { useAccount } from "wagmi";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { MembershipGate } from "@/components/MembershipGate";
import { BittreesMark } from "@/components/Brand";
import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";

export default function Layout() {
  const { isConnected, isConnecting } = useAccount();
  const { hasValidMembership, isLoading, pendingMint } = useMembershipStatus();

  // DEV-only preview bypass for screenshotting the members area without a
  // member wallet. `import.meta.env.DEV` is false in production builds, so this
  // whole branch is dead code (tree-shaken) when deployed.
  const devPreview =
    import.meta.env.DEV &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("br_preview") === "1";

  const member = (isConnected && hasValidMembership) || devPreview;

  // Still resolving wallet / membership for a connected user.
  if (isConnecting || (isConnected && isLoading && !pendingMint)) {
    return <FullScreenLoading />;
  }

  // Non-member (or disconnected): the gate.
  if (!member) {
    return (
      <MembershipGate />
    );
  }

  // Member: the full app.
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
      <Header />
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "1140px",
          margin: "0 auto",
          padding: "2.5rem 1.5rem 1rem",
        }}
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function FullScreenLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        background: "var(--color-bg)",
      }}
    >
      <div style={{ opacity: 0.85 }}>
        <BittreesMark size={44} />
      </div>
      <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>
        Verifying membership&hellip;
      </p>
      <Link to="/chat-recovery">Recover local data for Chat</Link>
    </div>
  );
}
