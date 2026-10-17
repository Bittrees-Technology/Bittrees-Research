import { ResearchCredentialRoles } from "@/components/ResearchCredentialRoles";
import { useSearchParams } from "react-router";
import ReviewerAccessSettings, {useReviewerSetupAccess} from '../components/ReviewerAccessSettings';
import Contributors from "./Contributors";
import {useAuthorityAccess} from '../lib/authorityAccess';
import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { AddressName } from "@/components/AddressName";
import { useAdminAccess, SUPER_ADMIN } from "@/lib/adminAccess";
import {
  useCommunity,
  selectableRoles,
  assignRole,
  unassignRole,
  createRole,
  deleteRole,
  moderateItem,
  type RoleDef,
} from "@/lib/community";
import { shortAddress } from "@/lib/links";

type Tab = "reviewer-settings" | "roles" | "applications" | "moderation";

export default function Admin() {
  const { address } = useAccount();
  const level = useAdminAccess(address);
  const shared=useAuthorityAccess(address);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => searchParams.get("tab")==="roles"?"roles":"applications");

  const permissions=!shared.isError && shared.data && (!shared.data.configured || (shared.data.expiresAt??0)>Date.now())?shared.data.permissions:[];
  const legacyFull=shared.data?.configured===false&&!shared.isError&&level==='full';
  const canManage=permissions.includes('community.roles.manage')||legacyFull;
  const canDefine=permissions.includes('research.credentials.define')||legacyFull;
  const canAssign=permissions.includes('research.credentials.assign')||legacyFull;
  const canModerate=permissions.includes('community.moderation.manage')||legacyFull||(shared.data?.configured===false&&level==='moderation');
  const tabs: {key:Tab;label:string}[]=[
    ...(canDefine||canAssign?[{key:'roles' as Tab,label:'Roles'}]:[]),
    {key:'applications',label:'Contributor applications'},
    ...(canModerate?[{key:'moderation' as Tab,label:'Moderation'}]:[]),
  ];

  const reviewerSetup=useReviewerSetupAccess(address);
  if(reviewerSetup)tabs.push({key:"reviewer-settings",label:"Admin settings"});
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="gov-admin" style={{ maxWidth: "820px", margin: "0 auto" }}>
      <PageHeader
        label="Admin"
        title="Administration"
        intro="Review applications and moderate the community using current permissions from Roles."
      />

      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--color-border)", marginBottom: "1.5rem" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.5rem 0.9rem",
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              fontWeight: active === t.key ? 700 : 500,
              color: active === t.key ? "var(--color-ink)" : "var(--color-ink-muted)",
              borderBottom: active === t.key ? "2px solid var(--color-primary)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "reviewer-settings" && <ReviewerAccessSettings address={address} />}
      {active === "roles" && <ResearchCredentialRoles canDefine={canDefine} canAssign={canAssign} canManage={canManage} />}
      {active === "roles" && level==="full" && (shared.data?.configured?<section className="card"><h2>Shared roles</h2><p>Project staff and partner permissions are managed in Roles.</p><a href="https://roles.bittrees.org/role-management?project=research">Manage roles</a></section>:<RolesTab />)}
      {active === "applications" && <Contributors embedded />}
      {active === "moderation" && <ModerationTab />}
    </div>
  );
}

/* ── Roles ─────────────────────────────────────────────────────────────── */
function RolesTab() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { data: community } = useCommunity();
  const qc = useQueryClient();

  const [target, setTarget] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#2F8F5B");
  const [newDesc, setNewDesc] = useState("");

  const roleDefs = useMemo(() => selectableRoles(community?.roledefs), [community?.roledefs]);
  const assignments = Object.entries(community?.roles ?? {});

  const refresh = () => qc.invalidateQueries({ queryKey: ["community"] });

  async function run(fn: () => Promise<void>) {
    if (!walletClient || !address) return;
    setBusy(true);
    setErr(undefined);
    try {
      await fn();
      refresh();
    } catch (e) {
      setErr((e as Error)?.message?.split("\n")[0] || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
      {/* Assign */}
      <section className="card">
        <h3 className="text-title" style={{ marginBottom: "0.85rem" }}>Assign a role</h3>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x address"
            style={{ ...input, flex: 1, minWidth: "220px", fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...input, width: "auto" }}>
            <option value="">Select role…</option>
            {roleDefs.map((r) => (
              <option key={r.label} value={r.label}>{r.label}</option>
            ))}
          </select>
          <button data-insights="assign"
            className="btn-primary"
            disabled={busy || !isAddress(target.trim()) || !role}
            onClick={() => run(() => assignRole({ walletClient: walletClient!, account: address as `0x${string}`, target: target.trim(), label: role, color: roleDefs.find((r) => r.label === role)?.color }))}
          >
            Assign
          </button>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--color-ink-dim)", marginTop: "0.6rem" }}>
          The Executive role grants full admin. The super-admin ({shortAddress(SUPER_ADMIN)}) is Executive permanently.
        </p>
        {err && <p style={{ fontSize: "0.8rem", color: "#b42318", marginTop: "0.4rem" }}>{err}</p>}
      </section>

      {/* Current assignments */}
      <section>
        <h3 className="text-title" style={{ marginBottom: "0.75rem" }}>Members with roles</h3>
        {assignments.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>No roles assigned yet.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Member</th><th>Roles</th><th className="right">Remove</th></tr></thead>
              <tbody>
                {assignments.map(([addr, roles]) => (
                  <tr key={addr}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}><AddressName address={addr} /></td>
                    <td>
                      <span style={{ display: "inline-flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        {roles.map((r) => (
                          <span key={r.label} className="badge" style={{ color: r.color, borderColor: r.color }}>{r.label}</span>
                        ))}
                      </span>
                    </td>
                    <td className="right">
                      {roles.map((r) => (
                        <button
                          key={r.label}
                          onClick={() => run(() => unassignRole({ walletClient: walletClient!, account: address as `0x${string}`, target: addr, label: r.label }))}
                          disabled={busy}
                          title={`Remove ${r.label}`}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9a2a2a", fontSize: "0.95rem", marginLeft: "0.3rem" }}
                        >×</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Role catalog */}
      <section className="card">
        <h3 className="text-title" style={{ marginBottom: "0.6rem" }}>Role catalog</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--color-ink-muted)", marginBottom: "0.9rem" }}>
          Built-in roles carry capabilities; create your own to extend the set.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.1rem" }}>
          {roleDefs.map((r: RoleDef) => (
            <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span className="badge" style={{ color: r.color, borderColor: r.color }}>{r.label}</span>
              <span style={{ fontSize: "0.8rem", color: "var(--color-ink-muted)", flex: 1 }}>{r.description}{r.locked ? " · built-in" : ""}</span>
              {!r.locked && (
                <button data-insights="delete" onClick={() => run(() => deleteRole({ walletClient: walletClient!, account: address as `0x${string}`, label: r.label }))} disabled={busy} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a2a2a", fontSize: "0.85rem" }}>delete</button>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New role label" style={{ ...input, width: "180px" }} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: "40px", height: "34px", border: "1px solid var(--color-border)", borderRadius: "2px", background: "#fff" }} />
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ ...input, flex: 1, minWidth: "180px" }} />
          <button data-insights="create-role"
            className="btn-ghost"
            disabled={busy || !newLabel.trim()}
            onClick={() => {
              const name = newLabel.trim();
              if (roleDefs.some((r) => r.label.toLowerCase() === name.toLowerCase())) {
                setErr(`Role "${name}" already exists`);
                return;
              }
              run(async () => {
                await createRole({ walletClient: walletClient!, account: address as `0x${string}`, label: name, color: newColor, description: newDesc.trim() });
                setNewLabel("");
                setNewDesc("");
              });
            }}
          >
            Create role
          </button>
        </div>
      </section>
    </div>
  );
}

/* ── Moderation ────────────────────────────────────────────────────────── */
function ModerationTab() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { data: community } = useCommunity();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const flagged = Object.entries(community?.flags ?? {}).filter(([, f]) => (f.by?.length ?? 0) > 0 || f.mod);

  async function act(id: string, action: "approve" | "remove" | "clear") {
    if (!walletClient || !address) return;
    setBusy(true);
    try {
      await moderateItem({ walletClient, account: address, id, action });
      qc.invalidateQueries({ queryKey: ["community"] });
    } finally {
      setBusy(false);
    }
  }

  if (flagged.length === 0) {
    return <p style={{ fontSize: "0.875rem", color: "var(--color-ink-muted)" }}>Nothing flagged. The community is quiet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {flagged.map(([id, f]) => (
        <div key={id} className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <span className="text-label">{f.surface || "item"} · {f.by?.length ?? 0} flags{f.mod ? ` · ${f.mod}` : ""}</span>
              <p style={{ fontSize: "0.875rem", color: "var(--color-ink)", margin: "0.3rem 0 0" }}>{f.preview || id}</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button data-insights="keep" className="btn-ghost" disabled={busy} onClick={() => act(id, "approve")}>Keep</button>
              <button data-insights="remove" className="btn-ghost" disabled={busy} onClick={() => act(id, "remove")} style={{ color: "#9a2a2a", borderColor: "#e6b3b3" }}>Remove</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const input = {
  padding: "0.5rem 0.65rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.875rem",
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-border)",
  borderRadius: "2px",
  boxSizing: "border-box" as const,
};
