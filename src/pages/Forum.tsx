import { useState } from "react";
import { useAccount } from "wagmi";
import { useTopics, PROPOSAL_COMMUNITY } from "../lib/forum";
import { Composer, PostCard } from "../components/forum";
import { PageHeader } from "@/components/PageHeader";
import { useIsAdmin } from "@/lib/adminAccess";

export default function Forum() {
  const { address } = useAccount();
  const isExecutive = useIsAdmin(address);
  const [showPropose, setShowPropose] = useState(false);
  const { data: topics, isLoading, isError } = useTopics();
  const { data: proposals } = useTopics(PROPOSAL_COMMUNITY);

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      <PageHeader
        label="Community"
        title="Forum"
        intro="A members' forum. Every post is signed by your wallet and recorded on-chain as an EAS attestation on Base — permanent, verifiable, and yours."
      />

      {/* Starting a discussion is Executive-only; any member can propose one. */}
      {isExecutive ? (
        <Composer />
      ) : (
        <div className="card">
          <p style={{ fontFamily: "var(--font-serif)", fontSize: "1rem", color: "var(--color-ink)", margin: 0 }}>
            Only Executives can start a new discussion.
          </p>
          <p style={{ ...dim, margin: "0.4rem 0 0" }}>
            Have an idea? Propose a discussion or research proposal below — an Executive can promote it into a discussion.
          </p>
        </div>
      )}

      {/* Member proposal form — any member, gated behind a button to keep it tidy. */}
      <section style={{ textAlign: "center" }}>
        {showPropose ? (
          <Composer proposal community={PROPOSAL_COMMUNITY} onPosted={() => setShowPropose(false)} />
        ) : (
          <button data-insights="propose-a-discussion-or-research-proposal" className="btn-ghost" onClick={() => setShowPropose(true)}>
            Propose a discussion or research proposal
          </button>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p className="text-label">Discussions</p>
        {isLoading && <p style={dim}>Loading discussions…</p>}
        {isError && (
          <p style={dim}>Couldn't reach the EASSCAN indexer. Posts are safe on-chain — try again shortly.</p>
        )}
        {topics && topics.length === 0 && (
          <div className="card">
            <p style={{ fontFamily: "var(--font-serif)", fontSize: "1rem", color: "var(--color-ink)", margin: 0 }}>
              No discussions yet.
            </p>
            <p style={{ ...dim, margin: "0.4rem 0 0" }}>
              {isExecutive
                ? "Start one above. It's recorded on Base and visible to every member."
                : "Once an Executive starts one, it appears here for every member."}
            </p>
          </div>
        )}
        {topics?.map((p) => (
          <PostCard key={p.id} post={p} linkToThread />
        ))}
      </section>

      {/* Member proposals awaiting review */}
      {proposals && proposals.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p className="text-label">Member proposals</p>
          {proposals.map((p) => (
            <PostCard key={p.id} post={p} linkToThread />
          ))}
        </section>
      )}
    </div>
  );
}

const dim = { fontFamily: "var(--font-sans)", fontSize: "0.875rem", color: "var(--color-ink-dim)" } as const;
