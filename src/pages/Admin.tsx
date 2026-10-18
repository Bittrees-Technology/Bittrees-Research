import { ResearchCredentialRoles } from "@/components/ResearchCredentialRoles";
import { useSearchParams } from "react-router";
import ReviewerAccessSettings, {useReviewerSetupAccess} from '../components/ReviewerAccessSettings';
import Contributors from "./Contributors";
import {useAuthorityAccess} from '../lib/authorityAccess';
import { useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { useAdminAccess } from "@/lib/adminAccess";
import {
  useCommunity,
  moderateItem,
} from "@/lib/community";

type Tab = "reviewer-settings" | "roles" | "applications" | "moderation";

export default function Admin() {
  const { address } = useAccount();
  const level = useAdminAccess(address);
  const shared=useAuthorityAccess(address);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => searchParams.get("tab")==="roles"?"roles":"applications");

  const permissions=!shared.isError && shared.data && shared.data.configured && (shared.data.expiresAt??0)>Date.now()?shared.data.permissions:[];
  const canManage=permissions.includes('community.roles.manage');
  const canDefine=permissions.includes('research.credentials.define');
  const canAssign=permissions.includes('research.credentials.assign');
  const canModerate=permissions.includes('community.moderation.manage');
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
      {active === "roles" && level==="full" && <section className="card"><h2>Shared roles</h2><p>Project staff and partner permissions are managed in Roles.</p><a href="https://roles.bittrees.org/role-management?project=research">Manage roles</a></section>}
      {active === "applications" && <Contributors embedded />}
      {active === "moderation" && <ModerationTab />}
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
