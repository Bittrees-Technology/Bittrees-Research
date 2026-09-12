import { useMemo, useState } from "react";
import { getAddress } from "viem";
import { useAccount } from "wagmi";
import { useCommunity, selectableRoles } from "../lib/community";
import { useVotingPowers } from "../lib/snapshot";
import { useContacts, addContact, removeContact, isContact } from "../lib/contacts";
import { useBlocked, blockAddr } from "../lib/dmPrefs";
import { useEnsNames } from "../lib/ens";
import { AddressName } from "./AddressName";
import { UserBadges } from "./badges";

const SHAREHOLDER = "Shareholder";

function humanError(e: unknown): string {
  const a = e as { shortMessage?: string; message?: string };
  return a?.shortMessage || a?.message || "Something went wrong";
}

/**
 * Sort addresses for display: named entries first (a saved private label, else a
 * primary ENS name), alphabetically by that name; then raw 0x addresses, by address.
 * So anyone "with a name" sorts above anyone shown as a bare 0x.
 */
export function sortByName(
  addrs: string[],
  names: Record<string, string | null | undefined>,
  labels: Record<string, string | undefined>
): string[] {
  const disp = (a: string) => labels[a.toLowerCase()] || names[a.toLowerCase()] || "";
  return [...addrs].sort((x, y) => {
    const dx = disp(x);
    const dy = disp(y);
    if (dx && !dy) return -1;
    if (!dx && dy) return 1;
    if (dx && dy) return dx.toLowerCase().localeCompare(dy.toLowerCase());
    return x.toLowerCase().localeCompare(y.toLowerCase());
  });
}

/**
 * Role / shareholder directory for the Search tab. Pick a role to list everyone who
 * holds it (named entries first), message anyone, save them as a contact, or message
 * the whole shown group at once.
 */
export function PeoplePanel({ onMessage, onBroadcast }: {
  onMessage: (address: string) => void;
  onBroadcast: (addresses: string[], text: string) => Promise<{ sent: number; skipped: number }>;
}) {
  const { address } = useAccount();
  const me = address?.toLowerCase();
  const blocked = useBlocked();
  const { data: community } = useCommunity();
  const roles = community?.roles ?? {};
  const contacts = useContacts(address);
  const roleOptions = selectableRoles(community?.roledefs);

  const [roleFilter, setRoleFilter] = useState(""); // "" = nothing picked yet
  const [bcastOpen, setBcastOpen] = useState(false);
  const [bcastText, setBcastText] = useState("");
  const [bcasting, setBcasting] = useState(false);
  const [bcastMsg, setBcastMsg] = useState<string>();

  // Everyone we know about: holders of any assigned role + saved contacts (minus me).
  const universe = useMemo(() => {
    const set = new Set<string>();
    Object.keys(roles).forEach((a) => set.add(a.toLowerCase()));
    contacts.forEach((c) => set.add(c.address.toLowerCase()));
    if (me) set.delete(me);
    return [...set];
  }, [roles, contacts, me]);

  const needVp = roleFilter === SHAREHOLDER;
  const { data: vps, isLoading: vpLoading } = useVotingPowers(needVp ? universe : []);

  const shown: string[] = useMemo(() => {
    if (roleFilter === "") return [];
    const blk = new Set(blocked);
    let base: string[];
    if (roleFilter === SHAREHOLDER) base = universe.filter((a) => (vps?.[a] ?? 0) >= 1);
    else base = Object.entries(roles)
      .filter(([, list]) => (list ?? []).some((r) => r.label.toLowerCase() === roleFilter.toLowerCase()))
      .map(([a]) => a);
    return base.filter((a) => a.toLowerCase() !== me && !blk.has(a.toLowerCase()));
  }, [roleFilter, universe, vps, roles, me, blocked]);

  const { data: names } = useEnsNames(shown);
  const labels = useMemo(() => Object.fromEntries(contacts.map((c) => [c.address.toLowerCase(), c.label])), [contacts]);
  const sortedShown = useMemo(() => sortByName(shown, names ?? {}, labels), [shown, names, labels]);

  async function sendAll() {
    if (!bcastText.trim() || shown.length === 0) return;
    setBcasting(true);
    setBcastMsg(undefined);
    try {
      const { sent, skipped } = await onBroadcast(shown, bcastText.trim());
      setBcastMsg(`Sent to ${sent}${skipped ? ` · ${skipped} not on XMTP yet` : ""}.`);
      setBcastText("");
      setBcastOpen(false);
    } catch (e) {
      setBcastMsg(humanError(e));
    } finally {
      setBcasting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <p className="text-label" style={{ margin: 0 }}>Search by role</p>
      <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setBcastOpen(false); setBcastMsg(undefined); }} style={inputStyle}>
        <option value="">Select a role…</option>
        <option value={SHAREHOLDER}>Shareholders (≥1 BGOV)</option>
        {roleOptions.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
      </select>

      <div style={{ display: "flex", flexDirection: "column", maxHeight: "320px", overflowY: "auto" }}>
        {needVp && vpLoading ? (
          <p style={{ ...dim, margin: "0.3rem 0" }}>Checking BGOV holdings…</p>
        ) : sortedShown.length === 0 ? (
          <p style={{ ...dim, margin: "0.3rem 0" }}>{roleFilter === "" ? "Pick a role to list who holds it." : "No one found for that role."}</p>
        ) : (
          sortedShown.map((addr) => (
            <PersonRow
              key={addr}
              address={addr}
              label={labels[addr.toLowerCase()]}
              onMessage={onMessage}
              saved={isContact(address, addr)}
              onToggleContact={() => (isContact(address, addr) ? removeContact(address, addr) : addContact(address, getAddress(addr)))}
              onBlock={() => blockAddr(addr)}
            />
          ))
        )}
      </div>

      {shown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid var(--color-border-light)", paddingTop: "0.6rem" }}>
          {!bcastOpen ? (
            <button onClick={() => { setBcastOpen(true); setBcastMsg(undefined); }} style={miniBtn}>✉ Message all ({shown.length})</button>
          ) : (
            <>
              <textarea value={bcastText} onChange={(e) => setBcastText(e.target.value)} placeholder={`One message to all ${shown.length} shown…`} rows={2} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" onClick={sendAll} disabled={bcasting || !bcastText.trim()} style={{ opacity: bcasting || !bcastText.trim() ? 0.55 : 1, padding: "0.4rem 0.8rem", fontSize: "0.82rem" }}>{bcasting ? "Sending…" : `Send to ${shown.length}`}</button>
                <button data-insights="cancel" onClick={() => { setBcastOpen(false); setBcastText(""); }} style={miniBtn}>Cancel</button>
              </div>
            </>
          )}
          {bcastMsg && <p style={{ ...dim, margin: 0 }}>{bcastMsg}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The Contacts tab — saved contacts only, named entries above raw 0x, each with an
 * editable private label (a personal nickname stored only on this device).
 */
export function ContactsView({ onMessage }: { onMessage: (address: string) => void }) {
  const { address } = useAccount();
  const contacts = useContacts(address);
  const { data: names } = useEnsNames(contacts.map((c) => c.address));
  const labels = useMemo(() => Object.fromEntries(contacts.map((c) => [c.address.toLowerCase(), c.label])), [contacts]);
  const sorted = useMemo(() => sortByName(contacts.map((c) => c.address), names ?? {}, labels), [contacts, names, labels]);

  if (contacts.length === 0) {
    return (
      <div style={{ padding: "1rem" }}>
        <p style={dim}>No contacts yet. Use Search to find people by address, name, or role and save them with ☆ — they'll appear here.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((addr) => (
        <ContactRow key={addr} owner={address} address={addr} label={labels[addr.toLowerCase()]} hasEns={!!(names ?? {})[addr.toLowerCase()]} onMessage={() => onMessage(addr)} />
      ))}
    </div>
  );
}

function ContactRow({ owner, address, label, hasEns, onMessage }: { owner?: string; address: string; label?: string; hasEns?: boolean; onMessage: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label ?? "");
  function save() {
    addContact(owner, getAddress(address), draft.trim() || undefined);
    setEditing(false);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.85rem", borderBottom: "1px solid var(--color-border-light)" }}>
      <span style={{ minWidth: 0, flex: 1, display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
        {!hasEns && label ? (
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-ink-dim)" }}><AddressName address={address} /></span>
          </span>
        ) : (
          <AddressName address={address} avatar />
        )}
      </span>
      {editing ? (
        <span style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center", flexShrink: 0 }}>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Private label" style={{ ...inputStyle, width: "120px", fontSize: "0.78rem", padding: "0.3rem 0.45rem" }} />
          <button data-insights="save" onClick={save} style={miniBtn}>Save</button>
        </span>
      ) : (
        <span style={{ display: "inline-flex", gap: "0.3rem", flexShrink: 0 }}>
          <button data-insights="message" onClick={onMessage} style={miniBtn}>Message</button>
          {/* Private labels only for raw 0x contacts — an ENS name already names them. */}
          {!hasEns && <button onClick={() => { setDraft(label ?? ""); setEditing(true); }} title="Edit private label" style={miniBtn}>✎</button>}
          <button onClick={() => removeContact(owner, address)} title="Remove contact" style={{ ...miniBtn, color: "#9a2a2a" }}>×</button>
        </span>
      )}
    </div>
  );
}

function PersonRow({ address, label, onMessage, saved, onToggleContact, onBlock }: { address: string; label?: string; onMessage: (a: string) => void; saved: boolean; onToggleContact: () => void; onBlock: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", padding: "0.4rem 0", borderBottom: "1px solid var(--color-border-light)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", minWidth: 0, flexWrap: "wrap" }}>
        {label ? <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-ink)" }}>{label}</span> : <AddressName address={address} avatar />}
        <UserBadges address={address} />
      </span>
      <span style={{ display: "inline-flex", gap: "0.4rem", flexShrink: 0 }}>
        <button data-insights="message" onClick={() => onMessage(address)} style={miniBtn}>Message</button>
        <button onClick={onToggleContact} title={saved ? "Remove contact" : "Save contact"} style={{ ...miniBtn, color: saved ? "#9a2a2a" : "var(--color-ink-muted)" }}>{saved ? "★" : "☆"}</button>
        <button onClick={onBlock} title="Block — hide and stop DMs" style={{ ...miniBtn, color: "#9a2a2a" }}>⊘</button>
      </span>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.875rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
const miniBtn = {
  padding: "0.25rem 0.6rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  cursor: "pointer",
} as const;
const dim = { fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-ink-dim)" } as const;
