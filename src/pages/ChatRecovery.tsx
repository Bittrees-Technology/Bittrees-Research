import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link } from "react-router";
import { useAccount } from "wagmi";
import { ChatRecoveryExport } from "../components/ChatRecoveryExport";

export default function ChatRecovery() {
  const { isConnected } = useAccount();
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem", overflowWrap: "anywhere" }}>
    <p className="text-label">Bittrees Research</p>
    <h1 className="text-display">Recover local data</h1>
    <p style={{ margin: "1rem 0" }}>Export this browser’s saved contacts and local notes to Chat. Membership and messaging activation are not required. This page does not provide access to member conversations.</p>
    <ConnectButton chainStatus="icon" showBalance={false} />
    {isConnected ? <ChatRecoveryExport /> : <p style={{ margin: "1rem 0" }}>Connect the wallet whose local data you want to recover.</p>}
    <p style={{ marginTop: "1.5rem" }}><Link to="/chat">Return to Research messenger</Link></p>
  </main>;
}
