import { useState } from "react";
import { Link } from "react-router";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { base } from "viem/chains";
import { wagmiConfig } from "../lib/wagmi";
import { getWalletClient } from "@wagmi/core";
import { publishPost, useSchemaRegistered, EASSCAN_VIEW, FORUM_PUBLICATION_ENABLED, FORUM_PRIVACY_MESSAGE, type ForumPost } from "../lib/forum";
import { relativeTime, ROUTES } from "../lib/links";
import { UserBadges } from "./badges";
import { AddressName } from "./AddressName";
import { FlagButton, HiddenNotice } from "./moderation";
import { useItemModeration } from "../lib/community";

function humanError(e: unknown): string {
  const a = e as { shortMessage?: string; message?: string };
  return a?.shortMessage || a?.message || "Transaction failed";
}

/** Preserve line breaks + linkify URLs (XSS-safe React nodes). */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-sans)", fontSize: "0.9rem", lineHeight: 1.65, color: "var(--color-ink-muted)" }}>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary-hover)" }}>{p}</a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </div>
  );
}

export function PostCard({ post, linkToThread, replyCount }: { post: ForumPost; linkToThread?: boolean; replyCount?: number }) {
  const { address } = useAccount();
  const mod = useItemModeration(post.id, address);
  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        {post.title && (
          <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.02rem", fontWeight: 700, color: "var(--color-ink)" }}>
            {post.title}
          </span>
        )}
        <UserBadges address={post.attester} />
        {replyCount !== undefined && (
          <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "var(--color-ink-dim)" }}>
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </span>
        )}
      </div>
      <div style={{ marginTop: post.title ? "0.4rem" : 0 }}>
        {mod.hidden ? <HiddenNotice /> : post.body ? <LinkifiedText text={post.body} /> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", margin: "0.6rem 0 0", flexWrap: "wrap" }}>
        <a href={`${EASSCAN_VIEW}${post.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--color-ink-dim)", textDecoration: "none", fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
          <AddressName address={post.attester} />
        </a>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "var(--color-ink-dim)" }}>{relativeTime(post.time)}</span>
        <FlagButton id={post.id} surface="forum" preview={post.title || post.body} />
      </div>
    </>
  );

  if (linkToThread) {
    return (
      <Link to={`${ROUTES.forum}/${post.id}`} className="card" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return <div className="card">{inner}</div>;
}

const PROPOSAL_KINDS = ["Discussion", "Research proposal"] as const;
type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/**
 * Wallet-signed composer. `refUID` set → reply mode (body only). `proposal` set →
 * member-proposal mode (adds a Discussion/Research-proposal type selector and tags
 * the title). Otherwise it's a new top-level discussion (Executive-gated by the
 * caller). BGOV holders get the shareholder chip.
 */
export function Composer(props:Parameters<typeof ActiveComposer>[0]) {
  return FORUM_PUBLICATION_ENABLED ? <ActiveComposer {...props}/> : <div className="card" role="status"><p>{FORUM_PRIVACY_MESSAGE}</p><p>Existing blockchain records, if any, remain publicly readable outside this app.</p></div>;
}

function ActiveComposer({
  refUID,
  community,
  proposal,
  onPosted,
}: {
  refUID?: `0x${string}`;
  community?: string;
  proposal?: boolean;
  onPosted?: () => void;
}) {
  const isReply = !!refUID;
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { data: schemaReady } = useSchemaRegistered();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<ProposalKind>("Discussion");
  const [status, setStatus] = useState<"idle" | "posting" | "error">("idle");
  const [error, setError] = useState<string>();

  const canPost = body.trim().length > 0 && (isReply || title.trim().length > 0);

  async function submit() {
    if (!walletClient || !address || !canPost) return;
    setStatus("posting");
    setError(undefined);
    try {
      // Switch to Base only now (at submit), then use a fresh client for that chain.
      let wc = walletClient;
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
        wc = (await getWalletClient(wagmiConfig, { chainId: base.id })) ?? walletClient;
      }
      const outTitle = isReply ? "" : proposal ? `[${kind}] ${title.trim()}` : title.trim();
      await publishPost({
        walletClient: wc,
        account: address,
        title: outTitle,
        body: body.trim(),
        refUID,
        community,
      });
      setTitle("");
      setBody("");
      setStatus("idle");
      if (isReply) qc.invalidateQueries({ queryKey: ["forum-thread", refUID] });
      else qc.invalidateQueries({ queryKey: ["forum-topics"] });
      qc.invalidateQueries({ queryKey: ["forum-schema-registered"] });
      onPosted?.();
    } catch (e) {
      setStatus("error");
      setError(humanError(e));
    }
  }

  if (!isConnected) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <p style={{ ...dim, margin: 0 }}>
          {isReply ? "Connect a wallet to reply." : proposal ? "Connect a wallet to submit a proposal." : "Connect a wallet to start a discussion."}
        </p>
        <ConnectButton chainStatus="none" showBalance={false} />
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <p className="text-label" style={{ margin: 0 }}>{isReply ? "Reply" : proposal ? "Propose a topic" : "New discussion"}</p>
        <UserBadges address={address} />
      </div>
      {proposal && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {PROPOSAL_KINDS.map((k) => {
            const active = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={active ? "btn-primary" : "btn-ghost"}
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.8rem", opacity: active ? 1 : 0.8 }}
              >
                {k}
              </button>
            );
          })}
        </div>
      )}
      {!isReply && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={120}
          style={inputStyle}
        />
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isReply ? "Write a reply…" : proposal ? (kind === "Research proposal" ? "Outline the research proposal — question, scope, and why it matters." : "Describe the discussion you'd like to see started.") : "What would you like to discuss?"}
        rows={isReply ? 3 : 5}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexWrap: "wrap" }}>
        <button
          className="btn-primary"
          disabled={!canPost || status === "posting"}
          onClick={submit}
          style={{ opacity: !canPost || status === "posting" ? 0.55 : 1 }}
        >
          {status === "posting" ? "Confirm in wallet…" : isReply ? "Post reply" : proposal ? "Submit proposal" : "Post discussion"}
        </button>
        <span style={dim}>
          {proposal ? "Submitted to the Executives for review · " : ""}Signed by your wallet · on-chain on Base{schemaReady === false ? " · first post also registers the forum (one-time)" : ""}
        </span>
      </div>
      {status === "error" && (
        <p role="alert" style={{ fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink)", margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "0.55rem 0.7rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.9rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
const dim = { fontFamily: "var(--font-sans)", fontSize: "0.76rem", color: "var(--color-ink-dim)" } as const;
