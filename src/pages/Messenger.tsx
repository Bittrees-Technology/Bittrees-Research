import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useEnsName, useEnsAvatar, useWalletClient, useSwitchChain } from "wagmi";
import { getAddress, isAddress, formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useXmtp, type ConvSummary, type ChatMessage, type ReplyRef } from "../lib/xmtp";
import {
  useDmPrefs,
  useBlocked,
  useDmSettings,
  setReadReceipts,
  setConvReceipts,
  togglePin,
  setArchived,
  markRead,
  setPinnedOrder,
  blockAddr,
  unblockAddr,
} from "../lib/dmPrefs";
import { addContact } from "../lib/contacts";
import { ensAvailable, ensYearPriceWei, ensLabel, ensAppUrl, ETH_REGISTRAR_CONTROLLER, REGISTRAR_WRITE_ABI, PUBLIC_RESOLVER, REGISTRATION_DURATION, ensRegisterData, ensMinCommitmentAge } from "../lib/ens";
import { useSavedMessages, addSavedMessage, deleteSavedMessage } from "../lib/savedMessages";
import { useUserSync, isSyncEnabled, enableSync, disableSync, hasRemoteSync } from "../lib/userSync";
import {
  BUILTIN_ROOMS,
  joinRoom,
  leaveRoom,
  roomHistory,
  roomHistoryOlder,
  sendRoom,
  roomMembers,
  setRoomRole,
  removeFromRoom,
  joinedChats,
  type PushRoom,
  type PushMessage,
  type PushClient,
  type RoomMember,
  type RoomRole,
} from "../lib/push";
import { usePush } from "../lib/usePush";
import { useRoomRegistry, setRoomIcon } from "../lib/rooms";
import { useCanProposeRoom } from "../lib/adminAccess";
import { ProposeRoom } from "../components/ProposeRoom";
import { AddressName } from "../components/AddressName";
import { PeoplePanel, ContactsView } from "../components/PeoplePanel";
import { getEnsAddress, getWalletClient } from "@wagmi/core";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { wagmiConfig } from "../lib/wagmi";
import { UserBadges } from "../components/badges";
import { FlagButton, HiddenNotice } from "../components/moderation";
import { useItemModeration } from "../lib/community";

function humanError(e: unknown): string {
  const a = e as { shortMessage?: string; message?: string };
  return a?.shortMessage || a?.message || "Something went wrong";
}

/**
 * Turn a Push (@pushprotocol/restapi) error into something actionable. Push wraps
 * backend failures in a ValidationError whose `.message` IS the real reason for
 * well-formed errors (e.g. "groupImage must be a string") — surface that. But a bare
 * HTTP failure comes through only as axios's "Request failed with status code N" with
 * no server body; the common one is a 403 when a gated room won't admit an address
 * that doesn't meet its rule. Spell that out instead of echoing the raw status.
 */
function describePushError(e: unknown): string {
  const x = e as { message?: string; details?: string };
  const msg = String(x?.message || x?.details || "");
  const code = msg.match(/status code (\d{3})/i)?.[1];
  if (code === "403") {
    return "Push refused this (403 Forbidden) without a detailed reason. Most likely the address hasn't activated Push messaging yet — to join or be added to a room it must first open the messenger, connect, and enable messages once (a free, no-gas signature). Once activated, if it holds the required role/tokens it can Join the room itself. (If it's already activated, re-check that it meets the room's gate and that your wallet is an admin here.)";
  }
  if (code === "401") return "Push rejected the request (401) — your messaging session may have expired. Reload the page and re-enable messaging.";
  if (code) return `Push request failed (HTTP ${code}). ${msg}`;
  return msg || "Failed";
}

export default function Messenger() {
  const { isConnected } = useAccount();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <header style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.5rem" }}>
        <p className="text-label">Community</p>
        <h1 className="text-display">Members Chat</h1>
      </header>

      {!isConnected ? (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <p style={{ ...dim, margin: 0 }}>Connect a wallet to message.</p>
          <ConnectButton chainStatus="none" showBalance={false} />
        </div>
      ) : (
        <DirectMessages />
      )}
    </div>
  );
}

/* ── Direct messages (XMTP) ─────────────────────────────────────────────── */
function DirectMessages() {
  const xmtp = useXmtp();

  if (xmtp.status !== "ready") {
    return (
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxWidth: "560px" }}>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", color: "var(--color-ink-muted)", lineHeight: 1.6, margin: 0 }}>
          Turning on DMs asks your wallet for a one-time signature to create your encrypted XMTP
          inbox. No gas, no transaction.
        </p>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-ink-dim)", lineHeight: 1.55, margin: 0 }}>
          Already use Bittrees messaging on another app with this wallet? After enabling, open
          <strong> Settings → Sync across devices</strong> to restore your saved messages and preferences.
        </p>
        <div>
          <button className="btn-primary" onClick={xmtp.enable} disabled={xmtp.status === "enabling"} style={{ opacity: xmtp.status === "enabling" ? 0.6 : 1 }}>
            {xmtp.status === "enabling" ? "Confirm in wallet…" : "Enable direct messages"}
          </button>
        </div>
        {xmtp.status === "error" && xmtp.error && (
          <p role="alert" style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-ink)", margin: 0 }}>{xmtp.error}</p>
        )}
      </div>
    );
  }
  return <MessengerHome xmtp={xmtp} />;
}

/* ── Messenger shell — Telegram-style: 4-button toolbar + full-screen chats ── */
type ShellView = "search" | "contacts" | "chat" | "settings";

function MessengerHome({ xmtp }: { xmtp: ReturnType<typeof useXmtp> }) {
  const { address } = useAccount();
  useUserSync(address); // cross-device sync of Saved Messages + prefs (when enabled)
  const [view, setView] = useState<ShellView>("chat");
  const [openSaved, setOpenSaved] = useState(false);
  const [roomsOpen, setRoomsOpen] = useState(false);

  // Back from ANY full-screen view always returns to the Chat list.
  const backToChats = () => { xmtp.clearError(); setRoomsOpen(false); setOpenSaved(false); xmtp.closeConversation(); setView("chat"); };
  // Saved Messages = a real DM with your own wallet when XMTP allows it; otherwise a
  // device-local notes store. Try the self-DM first, fall back to local notes.
  const openSavedMessages = async () => { xmtp.clearError(); if (!(await xmtp.startSelfDm())) setOpenSaved(true); };
  const openRooms = () => { xmtp.clearError(); setRoomsOpen(true); };

  // Full-screen views (Telegram-style: the list is replaced, a back arrow returns).
  if (roomsOpen) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button data-insights="all-chats" onClick={backToChats} style={{ ...linkBtn, alignSelf: "flex-start", fontSize: "0.85rem", color: "var(--color-primary-hover)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <IconBack /> All chats
        </button>
        <CommunityGroups />
      </div>
    );
  }
  if (openSaved) return <SavedChatView owner={address} onBack={backToChats} />;
  if (xmtp.activeId) return <DmChatView xmtp={xmtp} onBack={backToChats} />;

  return (
    <div className="card msg-shell" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <MessengerToolbar view={view} setView={(v) => { xmtp.clearError(); setView(v); }} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {view === "chat" && <ChatListView xmtp={xmtp} onOpenSaved={openSavedMessages} onOpenRooms={openRooms} />}
        {view === "contacts" && <ContactsView onMessage={(addr) => { void xmtp.startDm(addr); }} />}
        {view === "search" && <SearchView xmtp={xmtp} />}
        {view === "settings" && <SettingsView xmtp={xmtp} />}
      </div>
      {xmtp.error && (
        <p role="alert" style={{ fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink)", padding: "0 0.85rem 0.85rem", margin: 0 }}>{xmtp.error}</p>
      )}
    </div>
  );
}

function MessengerToolbar({ view, setView }: { view: ShellView; setView: (v: ShellView) => void }) {
  const items: { key: ShellView; label: string; icon: React.ReactNode }[] = [
    { key: "search", label: "Search", icon: <IconSearch /> },
    { key: "contacts", label: "Contacts", icon: <IconContacts /> },
    { key: "chat", label: "Chat", icon: <IconChat /> },
    { key: "settings", label: "Settings", icon: <IconGear /> },
  ];
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)" }}>
      {items.map((it) => {
        const active = view === it.key;
        return (
          <button
            key={it.key}
            onClick={() => setView(it.key)}
            aria-current={active}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.18rem", padding: "0.55rem 0.3rem", background: active ? "var(--color-bg-subtle)" : "transparent", border: "none", borderBottom: `2px solid ${active ? "var(--color-primary)" : "transparent"}`, marginBottom: "-1px", cursor: "pointer", color: active ? "var(--color-primary-hover)" : "var(--color-ink-muted)" }}
          >
            {it.icon}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.66rem", fontWeight: active ? 700 : 500 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* The conversation list (Telegram-style): Archived (top) · Saved Messages · Requests
   · Pinned · recent DMs · a Community-rooms entry. */
function ChatListView({ xmtp, onOpenSaved, onOpenRooms }: { xmtp: ReturnType<typeof useXmtp>; onOpenSaved: () => void; onOpenRooms: () => void }) {
  const prefs = useDmPrefs();
  const blocked = useBlocked();
  const [menuId, setMenuId] = useState<string>();
  const [showArchived, setShowArchived] = useState(false);
  const [showRequests, setShowRequests] = useState(true);

  const { pinned, recent, archived, requests } = useMemo(() => {
    const blk = new Set(blocked);
    const self = xmtp.selfAddress;
    // Hide blocked peers, and the self-DM (it's shown as the Saved Messages row).
    const notBlocked = xmtp.conversations.filter(
      (c) => !(c.kind === "dm" && c.peerAddress && (blk.has(c.peerAddress.toLowerCase()) || c.peerAddress.toLowerCase() === self))
    );
    const isRequest = (c: ConvSummary) => c.kind === "dm" && c.consent === "unknown" && !c.lastFromMe;
    const visible = notBlocked.filter((c) => c.consent !== "denied" && !isRequest(c));
    const reqs = notBlocked.filter(isRequest).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
    const arch = visible.filter((c) => prefs[c.id]?.archived);
    const live = visible.filter((c) => !prefs[c.id]?.archived);
    const pin = live.filter((c) => prefs[c.id]?.pinned).sort((a, b) => (prefs[a.id]?.order ?? 0) - (prefs[b.id]?.order ?? 0));
    const rec = live.filter((c) => !prefs[c.id]?.pinned).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));
    return { pinned: pin, recent: rec, archived: arch, requests: reqs };
  }, [xmtp.conversations, prefs, blocked, xmtp.selfAddress]);

  function move(id: string, dir: "up" | "down") {
    const ids = pinned.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPinnedOrder(ids);
  }
  async function blockConv(c: ConvSummary) {
    if (!c.peerAddress) return;
    setMenuId(undefined);
    blockAddr(c.peerAddress);
    await xmtp.setPeerConsent(c.peerAddress, false);
  }
  const isUnread = (c: ConvSummary) => !!c.lastAt && !c.lastFromMe && c.lastAt > (prefs[c.id]?.lastReadAt ?? 0);
  const rowProps = (c: ConvSummary) => ({
    c,
    active: false,
    unread: isUnread(c),
    pinned: !!prefs[c.id]?.pinned,
    menuOpen: menuId === c.id,
    onOpen: () => { setMenuId(undefined); xmtp.openConversation(c.id); },
    onMenu: () => setMenuId((m) => (m === c.id ? undefined : c.id)),
    onPin: () => togglePin(c.id),
    onArchive: () => { setArchived(c.id, true); setMenuId(undefined); },
    onUnarchive: () => setArchived(c.id, false),
    onBlock: () => blockConv(c),
  });

  const noChats = pinned.length === 0 && recent.length === 0 && requests.length === 0;

  return (
    <div>
      {/* Community rooms — a single entry pinned above everything; opens the full list */}
      <SpecialRow icon="🏛" title="Community rooms" subtitle="Token-gated group chat" onClick={onOpenRooms} />

      {/* Archived */}
      {archived.length > 0 && (
        <>
          <button onClick={() => setShowArchived((v) => !v)} style={discloseStyle}>
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived && archived.map((c) => <ConvRow key={c.id} {...rowProps(c)} archived />)}
        </>
      )}

      {/* Saved Messages — notes to self */}
      <SpecialRow icon="🔖" title="Saved Messages" subtitle="Notes to self · on this device" onClick={onOpenSaved} />

      {requests.length > 0 && (
        <>
          <button onClick={() => setShowRequests((v) => !v)} style={{ ...discloseStyle, color: "var(--color-primary-hover)" }}>
            {showRequests ? "▾" : "▸"} Requests ({requests.length})
          </button>
          {showRequests && requests.map((c) => (
            <RequestRow key={c.id} c={c} onOpen={() => xmtp.openConversation(c.id)} onAccept={() => xmtp.setConvConsent(c.id, true)} onDecline={() => xmtp.setConvConsent(c.id, false)} />
          ))}
        </>
      )}

      {pinned.length > 0 && (
        <>
          <ListHeader>Pinned</ListHeader>
          {pinned.map((c, i) => (
            <ConvRow key={c.id} {...rowProps(c)} canUp={i > 0} canDown={i < pinned.length - 1} onUp={() => move(c.id, "up")} onDown={() => move(c.id, "down")} />
          ))}
        </>
      )}
      {recent.map((c) => <ConvRow key={c.id} {...rowProps(c)} />)}

      {noChats && <p style={{ ...dim, padding: "1rem" }}>No conversations yet — use Search or Contacts to start one.</p>}
    </div>
  );
}

/** A non-DM list entry (Community rooms, Saved Messages) with an icon + chevron. */
function SpecialRow({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%", textAlign: "left", padding: "0.6rem 0.85rem", border: "none", borderBottom: "1px solid var(--color-border-light)", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
      <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: "var(--color-bg-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem" }}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--color-ink)" }}>{title}</span>
        <span style={{ display: "block", fontSize: "0.72rem", color: "var(--color-ink-dim)" }}>{subtitle}</span>
      </span>
      <span style={{ marginLeft: "auto", color: "var(--color-ink-dim)", flexShrink: 0 }}>›</span>
    </button>
  );
}

/** Full-screen DM view (Telegram-style): back arrow + peer, messages, composer. */
function DmChatView({ xmtp, onBack }: { xmtp: ReturnType<typeof useXmtp>; onBack: () => void }) {
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage>();
  const active = xmtp.conversations.find((c) => c.id === xmtp.activeId);
  const isSelf = !!active?.peerAddress && active.peerAddress.toLowerCase() === xmtp.selfAddress;

  useEffect(() => {
    if (xmtp.activeId) markRead(xmtp.activeId, Date.now());
  }, [xmtp.activeId, xmtp.messages.length]);

  async function send() {
    const t = draft;
    if (!t.trim()) return;
    setDraft("");
    const r = replyingTo;
    setReplyingTo(undefined);
    await xmtp.sendMessage(t, r ? { id: r.id, senderInboxId: r.senderInboxId, text: r.text, mine: r.mine } : undefined);
  }

  return (
    <div className="card msg-shell" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--color-border)" }}>
        <BackButton onClick={onBack} />
        <span style={{ display: "inline-flex", alignItems: "center", minWidth: 0, fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 700, color: "var(--color-ink)" }}>
          {isSelf ? "🔖 Saved Messages" : active?.peerAddress ? <AddressName address={active.peerAddress} avatar /> : (active?.title ?? "Conversation")}
        </span>
        {!isSelf && xmtp.activeId && (
          <span style={{ marginLeft: "auto", flexShrink: 0 }}><ReceiptsControl convId={xmtp.activeId} /></span>
        )}
      </div>
      <DmMessageList
        convId={xmtp.activeId}
        messages={xmtp.messages}
        onReact={(id, inbox, emoji) => void xmtp.toggleReaction(id, inbox, emoji)}
        onReply={setReplyingTo}
        onRetry={(id) => void xmtp.retryMessage(id)}
      />
      <Composer value={draft} setValue={setDraft} onSend={send} header={replyingTo ? <ReplyBanner m={replyingTo} onCancel={() => setReplyingTo(undefined)} /> : undefined} />
      {xmtp.error && (
        <p role="alert" style={{ fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink)", padding: "0 0.85rem 0.85rem", margin: 0 }}>{xmtp.error}</p>
      )}
    </div>
  );
}

/** Saved Messages — a local notes-to-self chat (no XMTP; device-only). */
function SavedChatView({ owner, onBack }: { owner?: string; onBack: () => void }) {
  const saved = useSavedMessages(owner);
  const [draft, setDraft] = useState("");
  function send() {
    const t = draft.trim();
    if (!t) return;
    addSavedMessage(owner, t);
    setDraft("");
  }
  const messages: ChatMessage[] = saved.map((s) => ({
    id: s.id, senderInboxId: "me", mine: true, text: s.text, sentAtMs: s.sentAtMs, status: "sent", reactions: [], readByPeer: false,
  }));
  return (
    <div className="card msg-shell" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--color-border)" }}>
        <BackButton onClick={onBack} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 700, color: "var(--color-ink)" }}>🔖 Saved Messages</span>
          <span style={{ display: "block", fontSize: "0.66rem", color: "var(--color-ink-dim)" }}>Notes to self — stored on this device</span>
        </span>
      </div>
      <DmMessageList messages={messages} notes onDelete={(id) => deleteSavedMessage(owner, id)} onReact={() => {}} onReply={() => {}} onRetry={() => {}} />
      <Composer value={draft} setValue={setDraft} onSend={send} />
    </div>
  );
}

/** Search: find existing chats, add someone by 0x/ENS, or browse a role directory. */
function SearchView({ xmtp }: { xmtp: ReturnType<typeof useXmtp> }) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string>();
  const query = q.trim();
  const looksLikeTarget = /^0x[0-9a-fA-F]{40}$/.test(query) || (query.includes(".") && !query.includes(" "));

  async function resolveTarget(): Promise<string | undefined> {
    let target = query;
    if (target.includes(".")) {
      try {
        const r = await getEnsAddress(wagmiConfig, { name: normalize(target), chainId: mainnet.id });
        if (r) target = r;
      } catch { /* fall through */ }
    }
    return isAddress(target) ? getAddress(target) : undefined;
  }
  async function start() {
    const addr = await resolveTarget();
    const ok = await xmtp.startDm(addr ?? query);
    if (ok) setQ("");
  }
  async function save() {
    const addr = await resolveTarget();
    if (!addr) { setMsg("Enter a valid 0x address or ENS name."); return; }
    addContact(xmtp.selfAddress, addr);
    setMsg(`Saved ${query} to Contacts.`);
    setQ("");
  }

  const ql = query.toLowerCase();
  const self = xmtp.selfAddress;
  const results = (query
    ? xmtp.conversations.filter((c) =>
        (c.peerAddress?.toLowerCase().includes(ql) ?? false) ||
        c.title.toLowerCase().includes(ql) ||
        (c.lastText?.toLowerCase().includes(ql) ?? false))
    : []
  ).filter((c) => c.peerAddress?.toLowerCase() !== self);

  return (
    <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
      <input
        autoFocus
        value={q}
        onChange={(e) => { setQ(e.target.value); setMsg(undefined); }}
        onKeyDown={(e) => { if (e.key === "Enter" && looksLikeTarget) start(); }}
        placeholder="Search chats — or add by 0x / name.eth"
        style={{ ...inputStyle, width: "100%" }}
      />
      {looksLikeTarget && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button data-insights="start-chat" className="btn-primary" onClick={start} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}>Start chat</button>
          <button data-insights="save-contact" onClick={save} style={{ padding: "0.4rem 0.7rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-ink)", background: "#fff", border: "1px solid var(--color-border)", borderRadius: "2px", cursor: "pointer" }}>☆ Save contact</button>
        </div>
      )}
      {msg && <p style={{ ...dim, margin: 0 }}>{msg}</p>}

      {query && (
        <div>
          {results.length === 0 ? (
            <p style={{ ...dim, padding: "0.3rem 0" }}>No matching chats.</p>
          ) : (
            results.map((c) => (
              <button key={c.id} onClick={() => xmtp.openConversation(c.id)} style={{ display: "flex", flexDirection: "column", width: "100%", textAlign: "left", gap: "0.1rem", padding: "0.5rem 0.4rem", border: "none", borderBottom: "1px solid var(--color-border-light)", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.peerAddress ? <AddressName address={c.peerAddress} /> : c.title}
                </span>
                {c.lastText && <span style={{ fontSize: "0.72rem", color: "var(--color-ink-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastFromMe ? "You: " : ""}{c.lastText}</span>}
              </button>
            ))
          )}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: "0.7rem" }}>
        <PeoplePanel onMessage={(addr) => { void xmtp.startDm(addr); }} onBroadcast={(addrs, text) => xmtp.broadcast(addrs, text)} />
      </div>
    </div>
  );
}

/** Settings: read-receipts toggle + blocked-list management. */
function SettingsView({ xmtp }: { xmtp: ReturnType<typeof useXmtp> }) {
  const settings = useDmSettings();
  const blocked = useBlocked();
  return (
    <div style={{ padding: "0.85rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <ProfileSection owner={xmtp.selfAddress} />
      <EnsTool xmtp={xmtp} />
      <ToggleRow
        label="Read receipts (default)"
        desc="The default for every chat — override it per conversation from the chat header. When on, people see when you've read their messages and you see when they've read yours."
        on={settings.readReceipts}
        onToggle={() => setReadReceipts(!settings.readReceipts)}
      />
      <SyncSection owner={xmtp.selfAddress} />
      <div>
        <p className="text-label" style={{ marginBottom: "0.4rem" }}>Blocked ({blocked.length})</p>
        {blocked.length === 0 ? (
          <p style={{ ...dim, margin: 0 }}>No one blocked.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {blocked.map((addr) => (
              <div key={addr} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", padding: "0.3rem 0" }}>
                <span style={{ minWidth: 0, overflow: "hidden" }}><AddressName address={addr} /></span>
                <button data-insights="unblock" onClick={() => { unblockAddr(addr); void xmtp.setPeerConsent(addr, true); }} style={{ ...linkBtn, fontSize: "0.74rem", color: "var(--color-primary-hover)", flexShrink: 0 }}>Unblock</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p style={{ ...dim, lineHeight: 1.6, margin: 0 }}>
        Direct messages are end-to-end encrypted over XMTP. Your profile picture is your ENS avatar. Saved Messages and these preferences live on this device — and sync across your devices (encrypted) when you turn on sync above.
      </p>
    </div>
  );
}

/** Opt-in cross-device sync: one signature derives an encryption key (cached + reused)
 *  so Saved Messages + preferences encrypt to this wallet and follow it across devices. */
function SyncSection({ owner }: { owner?: string }) {
  const { data: walletClient } = useWalletClient();
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [remote, setRemote] = useState<{ exists: boolean; source?: string }>({ exists: false });
  const enabled = isSyncEnabled(owner);

  // Probe (no signature) for an existing blob so we can offer to restore it — including
  // one carried over from gov.bittrees.org for this same wallet.
  useEffect(() => {
    let alive = true;
    if (!owner || enabled) { setRemote({ exists: false }); return; }
    hasRemoteSync(owner).then((r) => { if (alive) setRemote(r); }).catch(() => {});
    return () => { alive = false; };
  }, [owner, enabled]);

  async function turnOn() {
    if (!walletClient || !owner) return;
    setBusy(true); setErr(undefined);
    try {
      await enableSync(walletClient, owner as `0x${string}`);
      force((n) => n + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't enable sync");
    } finally {
      setBusy(false);
    }
  }
  function turnOff() { if (owner) { disableSync(owner); force((n) => n + 1); } }
  const canRestore = !enabled && remote.exists;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 600, color: "var(--color-ink)" }}>Sync across devices</span>
          <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink-muted)", lineHeight: 1.5 }}>
            {enabled
              ? "On — your Saved Messages and preferences are encrypted to this wallet and synced. The same wallet on another device sees them after you enable sync there."
              : canRestore
              ? "Saved messages and preferences were found for this wallet on Bittrees. Turn on to restore them here (one signature, no gas) — they stay encrypted to your wallet."
              : "Off — stored only on this device. Turn on to encrypt them to your wallet and sync across devices (one signature, no gas)."}
          </span>
        </span>
        {!owner ? (
          <span style={{ ...dim, fontSize: "0.72rem", flexShrink: 0 }}>Connect</span>
        ) : enabled ? (
          <button data-insights="turn-off" onClick={turnOff} style={{ ...settingsBtn, flexShrink: 0 }}>Turn off</button>
        ) : (
          <button className="btn-primary" disabled={busy || !walletClient} onClick={turnOn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem", opacity: busy || !walletClient ? 0.6 : 1, flexShrink: 0 }}>{busy ? "Confirm in wallet…" : canRestore ? "Turn on & restore" : "Turn on"}</button>
        )}
      </div>
      {canRestore && (
        <p style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", margin: "0.4rem 0 0", fontSize: "0.72rem" }}>
          <strong style={{ color: "var(--color-secondary)" }}>✓ Found your messages</strong>
          <span style={dim}>{remote.source === "gov" ? "· carried over from gov.bittrees.org" : "· ready to restore"}</span>
        </p>
      )}
      {enabled && <p style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", margin: "0.4rem 0 0", fontSize: "0.72rem" }}><strong style={{ color: "var(--color-secondary)" }}>✓ Syncing</strong> <span style={dim}>· encrypted to your wallet</span></p>}
      {err && <p role="alert" style={{ ...dim, color: "var(--color-ink)", fontSize: "0.72rem", margin: "0.35rem 0 0" }}>{err}</p>}
    </div>
  );
}

/** Your messenger profile = your ENS avatar. "Upload picture" opens the ENS app's
 *  edit-profile flow (only when you have a primary ENS name), where ENS handles the
 *  image upload, the IPFS pin, and the on-chain avatar record in one go. */
function ProfileSection({ owner }: { owner?: string }) {
  const { data: ensName, isLoading: ensNameLoading } = useEnsName({ address: owner as `0x${string}` | undefined, chainId: mainnet.id });
  const { data: ensAvatar, isLoading: ensAvatarLoading } = useEnsAvatar({ name: ensName ? normalize(ensName) : undefined, chainId: mainnet.id });
  const hasEns = !!ensName;
  return (
    <div>
      <p className="text-label" style={{ marginBottom: "0.5rem" }}>Profile</p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
        <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: "50%", overflow: "hidden", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {ensAvatar ? (
            <img src={ensAvatar} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: "cover" }} onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span style={{ fontSize: "1.5rem" }}>👤</span>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 700, color: "var(--color-ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {owner ? <AddressName address={owner} /> : "Not connected"}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
            {hasEns ? (
              <a href={ensAppUrl(ensName!)} target="_blank" rel="noreferrer" style={{ ...settingsBtn, textDecoration: "none" }}>
                {ensAvatar ? "Change picture ↗" : "Upload picture ↗"}
              </a>
            ) : (
              <button data-insights="upload-picture" disabled title="Set a primary ENS name first to add a picture" style={{ ...settingsBtn, opacity: 0.5, cursor: "default" }}>Upload picture</button>
            )}
          </div>
        </div>
      </div>
      {owner && (ensNameLoading ? (
        <p style={{ ...dim, fontSize: "0.72rem", margin: "0.55rem 0 0" }}>Checking ENS…</p>
      ) : !hasEns ? (
        <p style={{ ...dim, fontSize: "0.72rem", lineHeight: 1.5, margin: "0.55rem 0 0" }}>
          You need a primary ENS name to set a profile picture.{" "}
          <a href={ensAppUrl("")} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary-hover)", fontWeight: 600 }}>Get one on ENS ↗</a>
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.72rem", lineHeight: 1.5, margin: "0.55rem 0 0" }}>
            {ensAvatarLoading ? (
              <span style={dim}>Checking {ensName}…</span>
            ) : ensAvatar ? (
              <span style={dim}><strong style={{ color: "var(--color-secondary)" }}>✓ Picture set on ENS</strong> — {ensName}. Shown across every app.</span>
            ) : (
              <span style={dim}>No picture yet — Upload picture opens the ENS app to add your avatar to {ensName}.</span>
            )}
          </p>
          {!ensAvatarLoading && !ensAvatar && (
            <p style={{ ...dim, fontSize: "0.68rem", lineHeight: 1.5, margin: "0.35rem 0 0" }}>
              Your picture is your ENS avatar — add it in the ENS app and it shows across every app.
            </p>
          )}
        </>
      ))}
    </div>
  );
}

function ToggleRow({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 600, color: "var(--color-ink)" }}>{label}</span>
        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.78rem", color: "var(--color-ink-muted)", lineHeight: 1.5 }}>{desc}</span>
      </span>
      <button role="switch" aria-checked={on} onClick={onToggle} style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", background: on ? "var(--color-primary)" : "var(--color-border)", position: "relative", transition: "background 0.15s" }}>
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </button>
    </div>
  );
}

/** Per-conversation read-receipt control (Default / On / Off), overriding the global. */
function ReceiptsControl({ convId }: { convId: string }) {
  const prefs = useDmPrefs();
  const settings = useDmSettings();
  const [open, setOpen] = useState(false);
  const override = prefs[convId]?.readReceipts;
  const effective = override === undefined ? settings.readReceipts : override;
  const stateLabel = override === undefined ? "Default" : override ? "On" : "Off";
  const opts: [string, boolean | undefined][] = [["Default", undefined], ["On", true], ["Off", false]];
  return (
    <span style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} title="Read receipts for this chat" style={{ ...linkBtn, fontSize: "0.68rem", color: effective ? "var(--color-primary-hover)" : "var(--color-ink-dim)" }}>
        {effective ? "✓✓" : "✓"} Receipts: {stateLabel}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", border: "1px solid var(--color-border)", borderRadius: "4px", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", zIndex: 6, minWidth: 140 }}>
          {opts.map(([lbl, val]) => (
            <button key={lbl} onClick={() => { setConvReceipts(convId, val); setOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "0.4rem 0.6rem", border: "none", background: override === val ? "var(--color-bg-subtle)" : "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.76rem", color: "var(--color-ink)" }}>
              {lbl}{lbl === "Default" ? ` (${settings.readReceipts ? "on" : "off"})` : ""}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** ENS lookup tool for Settings: resolve a name↔address, check availability + price,
 *  and hand off the actual registration to the audited ENS app. */
/** Result of a live ENS lookup (address reverse-resolve, or name → registered/available). */
type EnsLookup =
  | { kind: "address"; address: string; name: string | null }
  | { kind: "registered"; name: string; address: string }
  | { kind: "available"; name: string; priceEth: string }
  | { kind: "unavailable"; name: string }
  | { kind: "error" };

/** Worth a live lookup? A full 0x address, or an ENS label of ≥3 chars (skip short fragments). */
function ensLookupable(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (isAddress(v)) return true;
  const label = v.toLowerCase().replace(/\.eth$/, "");
  return label.length >= 3 && !/\s/.test(label);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensLookup(client: any, raw: string): Promise<EnsLookup> {
  const v = raw.trim();
  try {
    if (isAddress(v)) {
      const name = await client.getEnsName({ address: getAddress(v) }).catch(() => null);
      return { kind: "address", address: getAddress(v), name: name ?? null };
    }
    const name = v.toLowerCase().endsWith(".eth") ? v.toLowerCase() : `${v.toLowerCase()}.eth`;
    const normalized = normalize(name); // throws on an invalid name → caught below
    const addr = await client.getEnsAddress({ name: normalized }).catch(() => null);
    if (addr) return { kind: "registered", name, address: getAddress(addr) };
    const label = ensLabel(name);
    const avail = await ensAvailable(client, label);
    if (avail) {
      const wei = await ensYearPriceWei(client, label).catch(() => 0n);
      return { kind: "available", name, priceEth: Number(formatEther(wei)).toFixed(4) };
    }
    return { kind: "unavailable", name };
  } catch {
    return { kind: "error" };
  }
}

/** Debounce a value by `ms` — so live lookups fire after the user pauses, not per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ── In-app .eth registration (commit → wait ~60s → reveal; real ETH, mainnet) ──── */
interface StoredCommit { secret: `0x${string}`; committedAt: number } // committedAt = unix seconds

function loadCommit(key: string): StoredCommit | null {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v.secret === "string" ? v : null; } catch { return null; }
}
function saveCommit(key: string, c: StoredCommit | null) {
  try { if (c) localStorage.setItem(key, JSON.stringify(c)); else localStorage.removeItem(key); } catch { /* ignore */ }
}
function randomSecret(): `0x${string}` {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/**
 * Register an available .eth name in-app via the ENS commit→reveal flow. REAL ETH on
 * mainnet: two transactions ~minCommitmentAge (~60s) apart. The commitment secret is
 * persisted in localStorage so the wait survives a refresh; the name is registered
 * with the PublicResolver + a forward addr record (so it resolves to its owner) but
 * reverseRecord=false (we don't overwrite the wallet's existing primary name). The
 * register value includes a small buffer; the controller refunds any excess.
 */
function EnsRegister({ name, priceEth }: { name: string; priceEth: string }) {
  const { address, chainId } = useAccount();
  const mainnetClient = usePublicClient({ chainId: mainnet.id });
  const { switchChainAsync } = useSwitchChain();
  const label = ensLabel(name);
  const key = address ? `bittrees.ens.commit.${address.toLowerCase()}.${label}` : "";
  const [commit, setCommit] = useState<StoredCommit | null>(() => (key ? loadCommit(key) : null));
  const [minAge, setMinAge] = useState(60);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [phase, setPhase] = useState<"idle" | "committing" | "registering" | "done">("idle");
  const [err, setErr] = useState<string>();

  useEffect(() => { if (mainnetClient) ensMinCommitmentAge(mainnetClient).then(setMinAge).catch(() => {}); }, [mainnetClient]);
  useEffect(() => {
    if (!commit || phase === "done") return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [commit, phase]);

  if (!address) {
    return <p style={{ ...dim, fontSize: "0.72rem", marginTop: "0.4rem" }}>Connect a wallet to register {name} here.</p>;
  }

  const elapsed = commit ? now - commit.committedAt : 0;
  const remaining = Math.max(0, minAge - elapsed);
  const expired = commit ? elapsed > 86400 : false; // commitments expire after ~24h
  const data = ensRegisterData(name, address);

  async function mainnetWallet() {
    if (chainId !== mainnet.id) await switchChainAsync({ chainId: mainnet.id });
    const wc = await getWalletClient(wagmiConfig, { chainId: mainnet.id });
    if (!wc) throw new Error("No wallet available on Ethereum mainnet.");
    return wc;
  }

  async function doCommit() {
    if (!mainnetClient || !address) return;
    if (!confirm(`Register ${name} for ~${priceEth} ETH/yr?\n\nThis is two transactions on Ethereum mainnet about ${minAge}s apart, paid in real ETH: step 1 (commit) now, step 2 (register) after the wait.`)) return;
    setErr(undefined); setPhase("committing");
    try {
      const wc = await mainnetWallet();
      const secret = randomSecret();
      const commitment = await mainnetClient.readContract({ address: ETH_REGISTRAR_CONTROLLER, abi: REGISTRAR_WRITE_ABI, functionName: "makeCommitment", args: [label, address, REGISTRATION_DURATION, secret, PUBLIC_RESOLVER, data, false, 0] }) as `0x${string}`;
      const hash = await wc.writeContract({ address: ETH_REGISTRAR_CONTROLLER, abi: REGISTRAR_WRITE_ABI, functionName: "commit", args: [commitment], account: address, chain: mainnet });
      await mainnetClient.waitForTransactionReceipt({ hash });
      const c: StoredCommit = { secret, committedAt: Math.floor(Date.now() / 1000) };
      saveCommit(key, c); setCommit(c); setNow(c.committedAt);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setPhase("idle");
    }
  }

  async function doRegister() {
    if (!mainnetClient || !address || !commit) return;
    setErr(undefined); setPhase("registering");
    try {
      const wc = await mainnetWallet();
      const priceWei = await ensYearPriceWei(mainnetClient, label);
      const value = (priceWei * 105n) / 100n; // +5% buffer; the controller refunds any excess
      const hash = await wc.writeContract({ address: ETH_REGISTRAR_CONTROLLER, abi: REGISTRAR_WRITE_ABI, functionName: "register", args: [label, address, REGISTRATION_DURATION, commit.secret, PUBLIC_RESOLVER, data, false, 0], value, account: address, chain: mainnet });
      await mainnetClient.waitForTransactionReceipt({ hash });
      saveCommit(key, null); setCommit(null); setPhase("done");
    } catch (e) {
      setErr(humanError(e)); setPhase("idle");
    }
  }

  function reset() { saveCommit(key, null); setCommit(null); setErr(undefined); setPhase("idle"); }

  return (
    <div style={{ marginTop: "0.5rem", padding: "0.6rem 0.7rem", border: "1px solid var(--color-border)", borderRadius: "2px", background: "var(--color-bg-subtle)" }}>
      {phase === "done" ? (
        <p style={{ fontSize: "0.78rem", margin: 0 }}><strong style={{ color: "var(--color-secondary)" }}>✓ Registered {name}</strong> — it may take a moment to resolve.</p>
      ) : !commit ? (
        <>
          <button className="btn-primary" disabled={phase === "committing"} onClick={doCommit} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem", opacity: phase === "committing" ? 0.6 : 1 }}>
            {phase === "committing" ? "Confirm step 1 in wallet…" : `Register here (~${priceEth} ETH/yr)`}
          </button>
          <p style={{ ...dim, fontSize: "0.68rem", margin: "0.4rem 0 0", lineHeight: 1.5 }}>Two transactions on Ethereum mainnet ~{minAge}s apart (ENS commit→reveal), paid in real ETH. Or <a href={ensAppUrl(name)} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary-hover)", fontWeight: 600 }}>use the ENS app ↗</a>.</p>
        </>
      ) : expired ? (
        <>
          <p style={{ ...dim, fontSize: "0.74rem", margin: "0 0 0.4rem" }}>Your commit expired (older than 24h). Start again.</p>
          <button data-insights="restart" onClick={reset} style={settingsBtn}>Restart</button>
        </>
      ) : remaining > 0 ? (
        <p style={{ ...dim, fontSize: "0.78rem", margin: 0 }}>Step 1 confirmed ✓ — waiting {remaining}s before step 2 (required by ENS)…</p>
      ) : (
        <>
          <button className="btn-primary" disabled={phase === "registering"} onClick={doRegister} style={{ padding: "0.4rem 0.8rem", fontSize: "0.82rem", opacity: phase === "registering" ? 0.6 : 1 }}>
            {phase === "registering" ? "Confirm step 2 in wallet…" : `Complete registration (~${priceEth} ETH + gas)`}
          </button>
          <button data-insights="cancel" onClick={reset} style={{ ...settingsBtn, marginLeft: "0.4rem" }}>Cancel</button>
        </>
      )}
      {err && <p role="alert" style={{ ...dim, color: "var(--color-ink)", fontSize: "0.72rem", margin: "0.4rem 0 0" }}>{err}</p>}
    </div>
  );
}

function EnsTool({ xmtp }: { xmtp: ReturnType<typeof useXmtp> }) {
  const client = usePublicClient({ chainId: mainnet.id });
  const [q, setQ] = useState("");
  const [actMsg, setActMsg] = useState<string>();
  const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  // Live lookup: debounce the input, then resolve/availability-check as a cached query
  // keyed on the debounced term (so only the latest term's result shows — no races).
  const debouncedQ = useDebounced(q.trim(), 450);
  const active = !!client && ensLookupable(debouncedQ);
  const lookupQ = useQuery({
    queryKey: ["ens-tool", debouncedQ],
    enabled: active,
    staleTime: 60_000,
    queryFn: () => ensLookup(client, debouncedQ),
  });
  const r = active ? lookupQ.data : undefined;
  const checking = active && lookupQ.isFetching;
  const foundAddr = r?.kind === "address" || r?.kind === "registered" ? r.address : undefined;

  return (
    <div>
      <p className="text-label" style={{ marginBottom: "0.4rem" }}>ENS</p>
      <input value={q} onChange={(e) => { setQ(e.target.value); setActMsg(undefined); }} placeholder="name.eth or 0x address" style={{ ...inputStyle, width: "100%" }} />
      {checking ? (
        <p style={{ ...dim, marginTop: "0.5rem" }}>Checking…</p>
      ) : r ? (
        <p style={{ ...dim, marginTop: "0.5rem", lineHeight: 1.55, color: "var(--color-ink-muted)" }}>
          {r.kind === "address" ? (
            r.name ? <>Primary name: <strong>{r.name}</strong></> : "No primary ENS name set for this address."
          ) : r.kind === "registered" ? (
            <><strong>{r.name}</strong> → {shorten(r.address)} · already registered</>
          ) : r.kind === "available" ? (
            <><strong style={{ color: "var(--color-secondary)" }}>{r.name} is available</strong> — ~{r.priceEth} ETH/yr.</>
          ) : r.kind === "unavailable" ? (
            <>{r.name} isn't available to register (or isn't a 2nd-level .eth name).</>
          ) : (
            "Couldn't check that — try again."
          )}
        </p>
      ) : null}
      {r?.kind === "available" && <EnsRegister name={r.name} priceEth={r.priceEth} />}
      {foundAddr && (
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
          <button data-insights="start-chat" className="btn-primary" onClick={() => void xmtp.startDm(foundAddr)} style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>Start chat</button>
          <button data-insights="save-contact" onClick={() => { addContact(xmtp.selfAddress, getAddress(foundAddr)); setActMsg("Saved to Contacts."); }} style={settingsBtn}>☆ Save contact</button>
        </div>
      )}
      {actMsg && <p style={{ ...dim, marginTop: "0.35rem" }}>{actMsg}</p>}
      <p style={{ ...dim, marginTop: "0.35rem", fontSize: "0.72rem" }}>Type a name to check availability live, or an address to reverse-resolve.</p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button data-insights="back" onClick={onClick} aria-label="Back" title="Back to chats" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: "none", background: "none", cursor: "pointer", color: "var(--color-ink-muted)", flexShrink: 0, padding: 0 }}>
      <IconBack />
    </button>
  );
}

/* Toolbar / nav icons (stroke = currentColor) */
function IconSearch() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>); }
function IconContacts() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>); }
function IconChat() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" /></svg>); }
function IconGear() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>); }
function IconBack() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>); }

/** One conversation row: peer identity (ENS), recency, unread dot, and an options
 *  bar (pin/reorder · archive · block) revealed by the ⋯ toggle. */
function ConvRow({ c, active, unread, pinned, menuOpen, archived, onOpen, onMenu, onPin, onArchive, onUnarchive, onBlock, canUp, canDown, onUp, onDown }: {
  c: ConvSummary;
  active: boolean;
  unread: boolean;
  pinned: boolean;
  menuOpen: boolean;
  archived?: boolean;
  onOpen: () => void;
  onMenu: () => void;
  onPin: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onBlock: () => void;
  canUp?: boolean;
  canDown?: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--color-border-light)", background: active ? "var(--color-bg-subtle)" : "transparent" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <button onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "0.6rem 0.3rem 0.6rem 0.85rem", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
            {unread && <span aria-label="unread" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0 }} />}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.85rem", fontWeight: unread || active ? 700 : 500, color: "var(--color-ink)" }}>
              {c.kind === "dm" && c.peerAddress ? <AddressName address={c.peerAddress} /> : c.title}
            </span>
            {pinned && <span title="Pinned" aria-hidden style={{ flexShrink: 0, fontSize: "0.66rem", color: "var(--color-ink-dim)" }}>📌</span>}
            {c.lastAt != null && <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: "0.64rem", color: "var(--color-ink-dim)" }}>{relTime(c.lastAt)}</span>}
          </span>
          {c.lastText && (
            <span style={{ display: "block", marginTop: "0.15rem", fontSize: "0.72rem", color: unread ? "var(--color-ink-muted)" : "var(--color-ink-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.lastFromMe ? "You: " : ""}{c.lastText}
            </span>
          )}
        </button>
        <button data-insights="conversation-options" onClick={onMenu} aria-label="Conversation options" title="Options" style={{ border: "none", background: "none", cursor: "pointer", padding: "0 0.6rem", color: menuOpen ? "var(--color-ink)" : "var(--color-ink-dim)", fontSize: "1.1rem", lineHeight: 1 }}>⋯</button>
      </div>
      {menuOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", padding: "0 0.85rem 0.6rem" }}>
          {!archived && <RowAction onClick={onPin}>{pinned ? "Unpin" : "Pin"}</RowAction>}
          {pinned && !archived && <RowAction onClick={onUp} disabled={!canUp}>↑</RowAction>}
          {pinned && !archived && <RowAction onClick={onDown} disabled={!canDown}>↓</RowAction>}
          {archived ? <RowAction onClick={onUnarchive}>Unarchive</RowAction> : <RowAction onClick={onArchive}>Archive</RowAction>}
          {c.kind === "dm" && c.peerAddress && <RowAction onClick={onBlock} danger>Block</RowAction>}
        </div>
      )}
    </div>
  );
}

function RowAction({ onClick, children, danger, disabled }: { onClick?: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "0.18rem 0.5rem", fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: 600, color: disabled ? "var(--color-ink-dim)" : danger ? "#9a2a2a" : "var(--color-ink-muted)", background: "#ffffff", border: "1px solid var(--color-border)", borderRadius: "2px", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
}

function ListHeader({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, padding: "0.5rem 0.85rem 0.2rem", fontFamily: "var(--font-sans)", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--color-ink-dim)" }}>{children}</p>
  );
}

/** Compact relative timestamp for the conversation list (now / 5m / 3h / 2d / date). */
function relTime(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Community rooms (Push, token-gated) ────────────────────────────────── */
function CommunityGroups() {
  const { address } = useAccount();
  const { data: registry } = useRoomRegistry();
  const prefs = useDmPrefs(); // room:<key> lastReadAt → unread flag

  // Registry (runtime, Vercel KV) chatIds + admin-set icons win over env/code fallbacks.
  const chatIds = registry?.chatIds;
  const icons = registry?.icons ?? {};
  const withMeta = (r: PushRoom): PushRoom => ({ ...r, chatId: chatIds?.[r.key] ?? r.chatId, icon: r.icon ?? icons[r.key] });
  const customRooms = (registry?.custom ?? []).map(withMeta);
  const builtinRooms = BUILTIN_ROOMS.map(withMeta);
  const allRooms: PushRoom[] = [...builtinRooms, ...customRooms];
  const canPropose = useCanProposeRoom(address);

  const push = usePush(); // shared, signature-persistent (survives tab switch + reload)
  const qc = useQueryClient();
  const [error, setError] = useState<string>();
  const [openRoom, setOpenRoom] = useState<PushRoom | null>(null);
  const [messages, setMessages] = useState<PushMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string>(); // which room is mid-join/leave (per-room, not global)
  const [menuKey, setMenuKey] = useState<string>(); // which joined room's options menu is open
  // Cursor for "Load older messages" (Push paginates 30 at a time); undefined = no more.
  const [olderCursor, setOlderCursor] = useState<string>();
  const [loadingOlder, setLoadingOlder] = useState(false);
  const roomEndRef = useRef<HTMLDivElement>(null);
  const scrollRoomRef = useRef(false); // request a scroll-to-bottom (open / send), not on load-older

  // Which rooms the wallet has JOINED + their last-message time — one Push call, so the
  // list can pin joined rooms to the top and flag unread (only runs once Push is ready).
  const liveChatIds = allRooms.map((r) => r.chatId).filter(Boolean).join(",");
  const joinedQ = useQuery({
    queryKey: ["joined-chats", liveChatIds],
    enabled: push.status === "ready" && !!liveChatIds && !!push.client,
    staleTime: 20_000,
    queryFn: () => joinedChats(push.client),
  });
  const joinedMap = joinedQ.data ?? {};
  const isJoined = (r: PushRoom) => !!r.chatId && r.chatId in joinedMap;
  const roomUnread = (r: PushRoom) => isJoined(r) && (joinedMap[r.chatId!] ?? 0) > (prefs[`room:${r.key}`]?.lastReadAt ?? 0);

  // Joined rooms pin to the top: pinned (manual order) first, then the rest alphabetically.
  // Pin state + order are per-device, reusing the DM prefs store keyed by `room:<key>`.
  const roomPrefId = (r: PushRoom) => `room:${r.key}`;
  const joinedAll = allRooms.filter(isJoined);
  const pinnedJoined = joinedAll
    .filter((r) => prefs[roomPrefId(r)]?.pinned)
    .sort((a, b) => (prefs[roomPrefId(a)]?.order ?? 0) - (prefs[roomPrefId(b)]?.order ?? 0));
  const joinedRooms = [
    ...pinnedJoined,
    ...joinedAll.filter((r) => !prefs[roomPrefId(r)]?.pinned).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const otherRooms = allRooms.filter((r) => !isJoined(r)).sort((a, b) => a.name.localeCompare(b.name));

  function moveRoom(prefId: string, dir: "up" | "down") {
    const ids = pinnedJoined.map(roomPrefId);
    const i = ids.indexOf(prefId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setPinnedOrder(ids);
  }

  async function leave(room: PushRoom) {
    if (!room.chatId || !push.client) return;
    if (!confirm(`Leave ${room.name}? You can re-join anytime you still qualify.`)) return;
    setMenuKey(undefined);
    setBusyKey(room.key);
    setError(undefined);
    try {
      await leaveRoom(push.client, room.chatId);
      if (openRoom?.key === room.key) { setOpenRoom(null); setMessages([]); setOlderCursor(undefined); }
      // Optimistically drop it from the joined map so the button flips to Join at once,
      // then refetch to reconcile with Push.
      qc.setQueryData<Record<string, number>>(["joined-chats", liveChatIds], (old) => {
        if (!old || !room.chatId) return old;
        const next = { ...old }; delete next[room.chatId]; return next;
      });
      qc.invalidateQueries({ queryKey: ["joined-chats"] });
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusyKey(undefined);
    }
  }

  // Scroll the open room to the newest message on open + on send (not when older
  // history is prepended), so new messages read from the bottom up.
  useEffect(() => {
    if (!scrollRoomRef.current) return;
    scrollRoomRef.current = false;
    requestAnimationFrame(() => roomEndRef.current?.scrollIntoView({ block: "end" }));
  }, [messages.length]);

  async function open(room: PushRoom) {
    if (!room.chatId || !push.client || !address) return;
    setBusyKey(room.key);
    setError(undefined);
    try {
      await joinRoom(push.client, room.chatId);
      const page = await roomHistory(push.client, room.chatId, address);
      setOpenRoom(room);
      setMessages(page.messages);
      setOlderCursor(page.cursor);
      markRead(`room:${room.key}`, Date.now()); // clear this room's unread flag
      scrollRoomRef.current = true; // jump to newest on open
      qc.invalidateQueries({ queryKey: ["joined-chats"] }); // reflect new membership in the list
    } catch (e) {
      setError(describePushError(e));
    } finally {
      setBusyKey(undefined);
    }
  }

  async function loadOlder() {
    if (!openRoom?.chatId || !push.client || !address || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await roomHistoryOlder(push.client, openRoom.chatId, olderCursor, address);
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        const older = page.messages.filter((m) => !seen.has(m.id));
        return [...older, ...cur]; // prepend older history above the current view
      });
      // Stop if there's no further cursor or it didn't advance (avoids a dead loop).
      setOlderCursor(page.cursor && page.cursor !== olderCursor ? page.cursor : undefined);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    if (!openRoom?.chatId || !push.client || !draft.trim() || !address) return;
    const text = draft.trim();
    setDraft("");
    try {
      await sendRoom(push.client, openRoom.chatId, text);
      setMessages((m) => [...m, { id: `local-${m.length}`, from: address.toLowerCase(), text, mine: true }]);
      scrollRoomRef.current = true; // stick to the bottom after sending
    } catch (e) {
      setError(humanError(e));
    }
  }

  if (push.status !== "ready") {
    return (
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", maxWidth: "560px" }}>
        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.9rem", color: "var(--color-ink-muted)", lineHeight: 1.6, margin: 0 }}>
          Community rooms are token-gated by your Bittrees holdings and run on Push — decentralized,
          wallet-native group chat. Enabling asks for a one-time signature; after that it stays
          signed in across reloads. No gas.
        </p>
        <div>
          <button className="btn-primary" onClick={push.enable} disabled={push.status === "enabling"} style={{ opacity: push.status === "enabling" ? 0.6 : 1 }}>
            {push.status === "enabling" ? "Confirm in wallet…" : "Enable community rooms"}
          </button>
        </div>
        {push.status === "error" && push.error && <p role="alert" style={{ ...dim, color: "var(--color-ink)", margin: 0 }}>{push.error}</p>}
      </div>
    );
  }

  if (openRoom) {
    return (
      <div className="card msg-shell" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", padding: "0.6rem 0.85rem", borderBottom: "1px solid var(--color-border)", minWidth: 0 }}>
          <button data-insights="back-to-rooms" onClick={() => { setOpenRoom(null); setMessages([]); setOlderCursor(undefined); }} aria-label="Back to rooms" title="Back to rooms" style={{ ...linkBtn, display: "inline-flex", alignItems: "center", color: "var(--color-ink-muted)", flexShrink: 0 }}><IconBack /></button>
          <RoomAvatar icon={openRoom.icon} size={30} />
          <span style={{ minWidth: 0, overflow: "hidden" }}>
            <span style={{ display: "block", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.9rem", color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openRoom.name}</span>
            <span style={{ display: "block", ...dim, fontSize: "0.68rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{openRoom.blurb}</span>
          </span>
        </div>
        {push.client && openRoom.chatId && address && (
          <ManageMembers push={push.client} chatId={openRoom.chatId} me={address} roomKey={openRoom.key} icon={openRoom.icon} />
        )}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {olderCursor && (
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              style={{ ...linkBtn, alignSelf: "center", fontSize: "0.74rem", padding: "0.25rem 0.5rem", color: "var(--color-primary-hover)" }}
            >
              {loadingOlder ? "Loading…" : "↑ Load older messages"}
            </button>
          )}
          {messages.length === 0 ? (
            <p style={{ ...dim, margin: "auto" }}>No messages yet — say gm.</p>
          ) : (
            messages.map((m) => <RoomMessage key={m.id} m={m} myAddress={address} />)
          )}
          <div ref={roomEndRef} />
        </div>
        <Composer value={draft} setValue={setDraft} onSend={send} />
        {error && <p role="alert" style={{ ...dim, color: "var(--color-ink)", padding: "0 0.95rem 0.75rem", margin: 0 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="card msg-shell" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0.6rem 0.85rem", borderBottom: "1px solid var(--color-border)" }}>
        <span style={{ ...dim, fontSize: "0.72rem" }}>
          Open any room you qualify for — access is enforced on-chain when you join.
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {joinedRooms.length > 0 && (
          <>
            <p className="text-label" style={{ margin: 0, padding: "0.55rem 0.85rem 0.3rem" }}>Joined</p>
            {joinedRooms.map((room) => {
              const pid = roomPrefId(room);
              const pinned = !!prefs[pid]?.pinned;
              const pinIdx = pinned ? pinnedJoined.findIndex((r) => r.key === room.key) : -1;
              return (
                <RoomRow
                  key={room.key}
                  room={room}
                  joined
                  pinned={pinned}
                  unread={roomUnread(room)}
                  busy={busyKey === room.key}
                  menuOpen={menuKey === room.key}
                  onOpen={() => { setMenuKey(undefined); open(room); }}
                  onMenu={() => setMenuKey((m) => (m === room.key ? undefined : room.key))}
                  onPin={() => togglePin(pid)}
                  onLeave={() => leave(room)}
                  canUp={pinIdx > 0}
                  canDown={pinIdx >= 0 && pinIdx < pinnedJoined.length - 1}
                  onUp={() => moveRoom(pid, "up")}
                  onDown={() => moveRoom(pid, "down")}
                />
              );
            })}
          </>
        )}
        {otherRooms.length > 0 && (
          <>
            <p className="text-label" style={{ margin: 0, padding: "0.55rem 0.85rem 0.3rem" }}>{joinedRooms.length > 0 ? "All rooms" : "Community rooms"}</p>
            {otherRooms.map((room) => (
              <RoomRow key={room.key} room={room} joined={false} unread={false} busy={busyKey === room.key} onOpen={() => open(room)} />
            ))}
          </>
        )}
        {allRooms.length === 0 && <p style={{ ...dim, padding: "1rem" }}>No rooms available yet.</p>}
        {canPropose && (
          <div style={{ padding: "0.85rem", borderTop: "1px solid var(--color-border)" }}>
            <ProposeRoom address={address!} />
          </div>
        )}
      </div>
      {error && <p role="alert" style={{ ...dim, color: "var(--color-ink)", padding: "0.5rem 0.85rem", margin: 0 }}>{error}</p>}
    </div>
  );
}

/** Room avatar — an admin-set emoji or http(s) image URL, falling back to 🏛. */
function RoomAvatar({ icon, size = 34 }: { icon?: string; size?: number }) {
  const isImg = !!icon && /^https?:\/\//i.test(icon);
  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", overflow: "hidden", background: "var(--color-bg-subtle)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.5, lineHeight: 1 }}>
      {isImg ? (
        <img src={icon} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <span>{icon || "🏛"}</span>
      )}
    </span>
  );
}

/** A community-room row (chat-list style): avatar · name · blurb · unread dot · Join/Open.
 *  Joined rooms also get a ⋯ menu to pin/reorder (manual order) or leave the room. */
function RoomRow({ room, joined, unread, busy, onOpen, pinned = false, menuOpen = false, onMenu, onPin, onLeave, canUp, canDown, onUp, onDown }: {
  room: PushRoom;
  joined: boolean;
  unread: boolean;
  busy: boolean;
  onOpen: () => void;
  pinned?: boolean;
  menuOpen?: boolean;
  onMenu?: () => void;
  onPin?: () => void;
  onLeave?: () => void;
  canUp?: boolean;
  canDown?: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const live = !!room.chatId;
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.55rem 0.85rem" }}>
        <RoomAvatar icon={room.icon} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
            {unread && <span aria-label="unread" title="Unread messages" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-primary)", flexShrink: 0 }} />}
            <span style={{ fontSize: "0.85rem", fontWeight: unread ? 700 : 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.name}</span>
            {pinned && <span title="Pinned" aria-hidden style={{ flexShrink: 0, fontSize: "0.66rem", color: "var(--color-ink-dim)" }}>📌</span>}
          </span>
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--color-ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{room.blurb}</span>
        </span>
        {!live ? (
          <span style={{ ...dim, fontSize: "0.72rem", flexShrink: 0 }}>Coming soon</span>
        ) : (
          <>
            <button className="btn-primary" disabled={busy} onClick={onOpen} style={{ padding: "0.3rem 0.8rem", fontSize: "0.78rem", opacity: busy ? 0.6 : 1, flexShrink: 0 }}>{busy ? "…" : joined ? "Open" : "Join"}</button>
            {joined && (
              <button data-insights="room-options" onClick={onMenu} aria-label="Room options" title="Options" style={{ border: "none", background: "none", cursor: "pointer", padding: "0 0.3rem", color: menuOpen ? "var(--color-ink)" : "var(--color-ink-dim)", fontSize: "1.1rem", lineHeight: 1, flexShrink: 0 }}>⋯</button>
            )}
          </>
        )}
      </div>
      {joined && live && menuOpen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", padding: "0 0.85rem 0.55rem 3.3rem" }}>
          <RowAction onClick={onPin}>{pinned ? "Unpin" : "Pin"}</RowAction>
          {pinned && <RowAction onClick={onUp} disabled={!canUp}>↑</RowAction>}
          {pinned && <RowAction onClick={onDown} disabled={!canDown}>↓</RowAction>}
          <RowAction onClick={onLeave} danger>Leave room</RowAction>
        </div>
      )}
    </div>
  );
}

/** Room-admin panel: set the room avatar, add a wallet as Member/Admin, or remove one. */
function ManageMembers({ push, chatId, me, roomKey, icon }: { push: PushClient; chatId: string; me: string; roomKey: string; icon?: string }) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [show, setShow] = useState(false);
  const [addr, setAddr] = useState("");
  const [role, setRole] = useState<RoomRole>("MEMBER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [iconDraft, setIconDraft] = useState(icon ?? "");
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const qc = useQueryClient();

  const load = useCallback(async () => {
    setMembers(await roomMembers(push, chatId));
  }, [push, chatId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setIconDraft(icon ?? ""); }, [icon]);

  const amAdmin = members.some((m) => m.wallet === me.toLowerCase() && m.role === "ADMIN");
  if (!amAdmin) return null; // only room admins manage roles

  async function add() {
    const input = addr.trim();
    setBusy(true); setErr(undefined);
    try {
      let resolved = input;
      if (!/^0x[a-fA-F0-9]{40}$/.test(input)) {
        // Not a raw 0x address — treat it as an ENS name and resolve on mainnet.
        if (!input.includes(".")) { setErr("Enter a 0x address or an ENS name."); return; }
        let a: string | null = null;
        try { a = await getEnsAddress(wagmiConfig, { name: normalize(input), chainId: mainnet.id }); } catch { a = null; }
        if (!a) { setErr(`Couldn't resolve "${input}" to an address.`); return; }
        resolved = a;
      }
      await setRoomRole(push, chatId, [resolved], role);
      setAddr("");
      await load();
    } catch (e) {
      setErr(describePushError(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveIcon() {
    if (!walletClient || !address) { setErr("Connect your wallet to set an avatar."); return; }
    const v = iconDraft.trim();
    if (v && v.length > 8 && !/^https?:\/\//i.test(v)) { setErr("Use a short emoji, or an http(s) image URL."); return; }
    setBusy(true); setErr(undefined);
    try {
      await setRoomIcon({ walletClient, account: address, roomKey, icon: v });
      await qc.invalidateQueries({ queryKey: ["room-registry"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to save avatar"); }
    finally { setBusy(false); }
  }
  async function remove(wallet: string) {
    setBusy(true); setErr(undefined);
    try { await removeFromRoom(push, chatId, [wallet], "MEMBER"); await load(); }
    catch (e) { setErr(describePushError(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-subtle)" }}>
      <button onClick={() => setShow((v) => !v)} style={{ ...linkBtn, padding: "0.5rem 0.95rem", width: "100%", textAlign: "left" }}>
        {show ? "▾" : "▸"} Manage members &amp; roles ({members.length})
      </button>
      {show && (
        <div style={{ padding: "0 0.95rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <div>
            <p className="text-label" style={{ margin: "0 0 0.3rem" }}>Room avatar</p>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <RoomAvatar icon={iconDraft || undefined} size={30} />
              <input value={iconDraft} onChange={(e) => setIconDraft(e.target.value)} placeholder="emoji or https://image-url" style={{ ...inputStyle, flex: 1, minWidth: "160px", fontSize: "0.78rem" }} />
              <button data-insights="save" className="btn-primary" disabled={busy || iconDraft.trim() === (icon ?? "")} onClick={saveIcon} style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }}>Save</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x address or ENS name" style={{ ...inputStyle, flex: 1, minWidth: "180px", fontSize: "0.78rem" }} />
            <select value={role} onChange={(e) => setRole(e.target.value as RoomRole)} style={{ ...inputStyle, width: "auto" }}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button data-insights="add" className="btn-primary" disabled={busy} onClick={add} style={{ padding: "0.4rem 0.7rem", fontSize: "0.8rem" }}>Add</button>
          </div>
          {members.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "160px", overflowY: "auto" }}>
              {members.map((m) => (
                <div key={m.wallet} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", color: "var(--color-ink-muted)" }}>
                    <AddressName address={m.wallet} />
                    <UserBadges address={m.wallet} />
                    {m.role === "ADMIN" && <strong style={{ color: "var(--color-primary-hover)" }}>· admin</strong>}
                  </span>
                  {m.wallet !== me.toLowerCase() && (
                    <button data-insights="remove" onClick={() => remove(m.wallet)} disabled={busy} style={{ ...linkBtn, fontSize: "0.72rem", color: "#9a2a2a" }}>remove</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {err && <p role="alert" style={{ ...dim, color: "var(--color-ink)", margin: 0 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

/* ── Shared bits ────────────────────────────────────────────────────────── */
function RoomMessage({ m, myAddress }: { m: PushMessage; myAddress?: string }) {
  const mod = useItemModeration(m.id, myAddress);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start", gap: "0.15rem" }}>
      {!m.mine && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.62rem", color: "var(--color-ink-dim)" }}>
          <AddressName address={m.from} />
          <UserBadges address={m.from} />
        </span>
      )}
      {mod.hidden ? (
        <div style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "78%" }}><HiddenNotice compact /></div>
      ) : (
        <Bubble mine={m.mine} text={m.text} />
      )}
      {!m.mine && !mod.hidden && <FlagButton id={m.id} surface="chat" preview={m.text} />}
    </div>
  );
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%", padding: "0.5rem 0.75rem", borderRadius: "10px", background: mine ? "var(--color-primary)" : "var(--color-bg-subtle)", color: mine ? "#ffffff" : "var(--color-ink)", fontFamily: "var(--font-sans)", fontSize: "0.875rem", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
      {text}
    </div>
  );
}

/* ── DM message UI: header, list, rich bubble, reactions, replies ─────────── */
const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Chat header: who you're talking with + a read-receipts toggle. */
function DayDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", margin: "0.7rem 0 0.4rem" }}>
      <span style={{ flex: 1, height: 1, background: "var(--color-border-light)" }} />
      <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.64rem", fontWeight: 600, color: "var(--color-ink-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: "var(--color-border-light)" }} />
    </div>
  );
}

function DmMessageList({ convId, messages, onReact, onReply, onRetry, notes, onDelete }: {
  convId?: string;
  messages: ChatMessage[];
  onReact: (id: string, inbox: string, emoji: string) => void;
  onReply: (m: ChatMessage) => void;
  onRetry: (id: string) => void;
  notes?: boolean;
  onDelete?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const lastConv = useRef<string | undefined>(undefined);
  const pendingBottom = useRef(true); // jump to bottom once this conversation's messages render
  // Anchor on the newest message: jump to the bottom on open / conversation switch (once
  // its messages have loaded), and keep it pinned when a new message arrives while the
  // user is already near the bottom. Older history loaded above never yanks the view.
  useEffect(() => {
    if (convId !== lastConv.current) { lastConv.current = convId; pendingBottom.current = true; lastCount.current = 0; }
    const c = containerRef.current;
    if (!c) return;
    if (pendingBottom.current && messages.length > 0) {
      pendingBottom.current = false;
      lastCount.current = messages.length;
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
      return;
    }
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 160;
    if (grew && nearBottom) requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
  }, [messages.length, convId]);

  if (messages.length === 0) {
    return <div style={{ flex: 1, display: "flex", padding: "1rem" }}><p style={{ ...dim, margin: "auto" }}>{notes ? "No notes yet — type below to save one." : "No messages yet — say hello."}</p></div>;
  }
  let lastDay = "";
  return (
    <div ref={containerRef} style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
      {messages.map((m) => {
        const day = dayLabel(m.sentAtMs);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={m.id}>
            {showDay && <DayDivider label={day} />}
            <DmBubble m={m} onReact={onReact} onReply={onReply} onRetry={onRetry} notes={notes} onDelete={onDelete} />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function DmBubble({ m, onReact, onReply, onRetry, notes, onDelete }: {
  m: ChatMessage;
  onReact: (id: string, inbox: string, emoji: string) => void;
  onReply: (m: ChatMessage) => void;
  onRetry: (id: string) => void;
  notes?: boolean;
  onDelete?: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const align = m.mine ? "flex-end" : "flex-start";
  const pending = m.id.startsWith("pending-");
  return (
    <div
      id={`msg-${m.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPickerOpen(false); }}
      style={{ display: "flex", flexDirection: "column", gap: "0.12rem", padding: "0.12rem 0" }}
    >
      {m.replyTo && <QuotedPreview r={m.replyTo} mine={m.mine} />}
      {/* Full-width row aligned by flex-direction — NOT a shrink-to-fit row, so the
          bubble's % max-width resolves against a stable width instead of collapsing. */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexDirection: m.mine ? "row-reverse" : "row" }}>
        <Bubble mine={m.mine} text={m.text} />
        {(hover || pickerOpen) && !pending && (
          <span style={{ display: "inline-flex", gap: "0.15rem", flexShrink: 0, position: "relative" }}>
            {notes ? (
              onDelete && <IconBtn title="Delete note" onClick={() => onDelete(m.id)}>🗑</IconBtn>
            ) : (
              <>
                <IconBtn title="React" onClick={() => setPickerOpen((v) => !v)}>☺</IconBtn>
                <IconBtn title="Reply" onClick={() => onReply(m)}>↩</IconBtn>
                {pickerOpen && (
                  <div style={{ position: "absolute", bottom: "100%", [m.mine ? "right" : "left"]: 0, marginBottom: 4, display: "flex", gap: "0.1rem", background: "#fff", border: "1px solid var(--color-border)", borderRadius: "999px", padding: "0.2rem 0.35rem", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", zIndex: 5 } as React.CSSProperties}>
                    {QUICK_EMOJI.map((e) => (
                      <button key={e} onClick={() => { onReact(m.id, m.senderInboxId, e); setPickerOpen(false); }} style={{ border: "none", background: "none", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0.1rem" }}>{e}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </span>
        )}
      </div>
      {!notes && m.reactions.length > 0 && (
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", alignSelf: align, marginTop: "0.1rem" }}>
          {m.reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onReact(m.id, m.senderInboxId, r.emoji)}
              title={r.mine ? "Remove your reaction" : "React"}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.72rem", padding: "0.05rem 0.4rem", borderRadius: "999px", cursor: "pointer", border: `1px solid ${r.mine ? "var(--color-primary)" : "var(--color-border)"}`, background: r.mine ? "rgba(247,147,26,0.12)" : "#fff", color: "var(--color-ink)" }}
            >
              <span>{r.emoji}</span>{r.count > 1 && <span style={{ color: "var(--color-ink-muted)" }}>{r.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", alignSelf: align, fontSize: "0.62rem", color: "var(--color-ink-dim)", padding: "0 0.15rem" }}>
        <span>{timeLabel(m.sentAtMs)}</span>
        {!notes && m.mine && m.status === "sending" && <span>· Sending…</span>}
        {!notes && m.mine && m.status === "failed" && (
          <button data-insights="failed-retry" onClick={() => onRetry(m.id)} style={{ ...linkBtn, fontSize: "0.62rem", color: "#9a2a2a" }}>· Failed · Retry</button>
        )}
        {!notes && m.mine && m.status === "sent" && (
          <span title={m.readByPeer ? "Read" : "Sent"} style={{ color: m.readByPeer ? "var(--color-primary-hover)" : "var(--color-ink-dim)" }}>{m.readByPeer ? "✓✓" : "✓"}</span>
        )}
      </div>
    </div>
  );
}

/** The quoted parent shown above a reply bubble; click scrolls to the original. */
function QuotedPreview({ r, mine }: { r: ReplyRef; mine: boolean }) {
  return (
    <button
      onClick={() => document.getElementById(`msg-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
      style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "0.1rem 0.5rem", borderLeft: "2px solid var(--color-primary)" }}
    >
      <span style={{ display: "block", fontSize: "0.64rem", fontWeight: 700, color: "var(--color-primary-hover)" }}>{r.mine ? "You" : "In reply to"}</span>
      <span style={{ display: "block", fontSize: "0.72rem", color: "var(--color-ink-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "260px" }}>{r.text}</span>
    </button>
  );
}

/** The "replying to…" banner above the composer. */
function ReplyBanner({ m, onCancel }: { m: ChatMessage; onCancel: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.7rem", borderBottom: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)" }}>
      <span style={{ width: 3, alignSelf: "stretch", background: "var(--color-primary)", borderRadius: 2 }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: "0.66rem", fontWeight: 700, color: "var(--color-primary-hover)" }}>Replying to {m.mine ? "yourself" : "message"}</span>
        <span style={{ display: "block", fontSize: "0.74rem", color: "var(--color-ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
      </span>
      <button onClick={onCancel} title="Cancel reply" style={{ ...linkBtn, fontSize: "0.9rem", color: "var(--color-ink-dim)", flexShrink: 0 }}>✕</button>
    </div>
  );
}

/** An inbound message request — accept (allow) or decline (deny consent). */
function RequestRow({ c, onOpen, onAccept, onDecline }: { c: ConvSummary; onOpen: () => void; onAccept: () => void; onDecline: () => void }) {
  return (
    <div style={{ padding: "0.5rem 0.85rem", borderBottom: "1px solid var(--color-border-light)", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <button onClick={onOpen} style={{ textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: 0, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.peerAddress ? <AddressName address={c.peerAddress} /> : c.title}
        </span>
        {c.lastText && <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-ink-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastText}</span>}
      </button>
      <div style={{ display: "flex", gap: "0.3rem" }}>
        <button data-insights="accept" onClick={onAccept} className="btn-primary" style={{ padding: "0.2rem 0.55rem", fontSize: "0.72rem" }}>Accept</button>
        <button data-insights="decline" onClick={onDecline} style={{ ...linkBtn, fontSize: "0.72rem", color: "#9a2a2a", border: "1px solid var(--color-border)", borderRadius: "2px", padding: "0.2rem 0.55rem" }}>Decline</button>
      </div>
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--color-border)", background: "#fff", borderRadius: "999px", cursor: "pointer", fontSize: "0.8rem", color: "var(--color-ink-muted)", lineHeight: 1, padding: 0 }}>{children}</button>
  );
}

function Composer({ value, setValue, onSend, header }: { value: string; setValue: (v: string) => void; onSend: () => void; header?: React.ReactNode }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Auto-grow the textarea with content, up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);
  return (
    <div style={{ borderTop: "1px solid var(--color-border)" }}>
      {header}
      <div style={{ padding: "0.7rem", display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Message…  (Shift+Enter for a new line)"
          rows={1}
          style={{ ...inputStyle, flex: 1, resize: "none", lineHeight: 1.5, maxHeight: "120px" }}
        />
        <button data-insights="send" className="btn-primary" onClick={onSend} disabled={!value.trim()} style={{ opacity: value.trim() ? 1 : 0.5 }}>Send</button>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "0.5rem 0.65rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.85rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
const linkBtn = { background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-ink-muted)", padding: 0 } as const;
const dim = { fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "var(--color-ink-dim)" } as const;
const settingsBtn = { padding: "0.35rem 0.7rem", fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 600, color: "var(--color-ink)", background: "#ffffff", border: "1px solid var(--color-border)", borderRadius: "2px", cursor: "pointer" } as const;
const discloseStyle = { display: "block", width: "100%", textAlign: "left" as const, padding: "0.55rem 0.85rem", border: "none", borderTop: "1px solid var(--color-border-light)", background: "var(--color-bg-subtle)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--color-ink-dim)" } as const;
