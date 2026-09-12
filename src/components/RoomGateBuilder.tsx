import { useState } from "react";
import type { RoomGate, RoomRule } from "../lib/push";
import { type RuleDraft, type RuleType, emptyRule, toRule } from "../lib/roomRules";
import type { RoleDef } from "../lib/community";

/** State + derived gate for a room's multi-rule access gate. Shared by the admin
 *  custom-room form and the role-holder "propose a room" form. */
export function useRoomGate() {
  const [rules, setRules] = useState<RuleDraft[]>([emptyRule()]);
  const [combine, setCombine] = useState<"any" | "all">("any");
  const builtRules = rules.map(toRule).filter((r): r is RoomRule => !!r);
  const gate: RoomGate = { kind: "multi", combine, rules: builtRules };
  const valid = builtRules.length > 0;
  const reset = () => { setRules([emptyRule()]); setCombine("any"); };
  return { rules, setRules, combine, setCombine, builtRules, gate, valid, reset };
}

/** The rule-row editor: pick rule types + params, combine with any/all, add/remove rows. */
export function RoomGateBuilder({ gate, roleOptions }: { gate: ReturnType<typeof useRoomGate>; roleOptions: RoleDef[] }) {
  const { rules, setRules, combine, setCombine } = gate;
  const setRule = (i: number, patch: Partial<RuleDraft>) => setRules((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      {rules.length > 1 && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", ...dim }}>
          Admit if
          <select value={combine} onChange={(e) => setCombine(e.target.value as "any" | "all")} style={{ ...inputStyle, width: "auto" }}>
            <option value="any">any</option>
            <option value="all">all</option>
          </select>
          of these match:
        </label>
      )}

      {rules.map((r, i) => (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <select value={r.type} onChange={(e) => setRule(i, { type: e.target.value as RuleType })} style={{ ...inputStyle, width: "auto" }}>
            <option value="role">Role</option>
            <option value="safe">Safe signers</option>
            <option value="ens">ENS name</option>
            <option value="erc20">Token (ERC-20)</option>
            <option value="erc721">NFT (ERC-721)</option>
            <option value="erc1155">Multi-token (ERC-1155)</option>
          </select>
          {r.type === "role" && (
            <select value={r.role} onChange={(e) => setRule(i, { role: e.target.value })} style={{ ...inputStyle, width: "auto", minWidth: "160px" }}>
              <option value="">Select a role…</option>
              {roleOptions.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
            </select>
          )}
          {r.type === "safe" && (
            <input value={r.safe} onChange={(e) => setRule(i, { safe: e.target.value })} placeholder="Safe 0x address" style={{ ...inputStyle, flex: 1, minWidth: "180px", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
          )}
          {r.type === "ens" && (
            <input value={r.ens} onChange={(e) => setRule(i, { ens: e.target.value })} placeholder="name.eth — or blank for any ENS name" style={{ ...inputStyle, flex: 1, minWidth: "200px" }} />
          )}
          {(r.type === "erc20" || r.type === "erc721" || r.type === "erc1155") && (
            <>
              <input value={r.token} onChange={(e) => setRule(i, { token: e.target.value })} placeholder="Token 0x address" style={{ ...inputStyle, flex: 1, minWidth: "160px", fontFamily: "var(--font-mono)", fontSize: "0.8rem" }} />
              {r.type === "erc1155" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", color: "var(--color-ink-dim)", whiteSpace: "nowrap" }} title="On: gate one token ID. Off: admit holders of any token ID in the collection.">
                  <input type="checkbox" checked={r.specificId} onChange={(e) => setRule(i, { specificId: e.target.checked })} />
                  specific ID
                </label>
              )}
              {r.type === "erc1155" && r.specificId && (
                <input value={r.tokenId} onChange={(e) => setRule(i, { tokenId: e.target.value })} placeholder="Token ID" style={{ ...inputStyle, width: "110px" }} />
              )}
              <input value={r.min} onChange={(e) => setRule(i, { min: e.target.value })} placeholder={r.type === "erc20" ? "Min amount" : "Min count"} style={{ ...inputStyle, width: "100px" }} />
            </>
          )}
          {rules.length > 1 && (
            <button data-insights="remove-rule" onClick={() => setRules((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove rule" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a2a2a", fontSize: "1rem", lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      ))}

      <button data-insights="add-rule" type="button" onClick={() => setRules((cur) => [...cur, emptyRule()])} style={{ ...createBtn, alignSelf: "flex-start" }}>+ Add rule</button>
    </>
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
const createBtn = {
  padding: "0.4rem 0.9rem",
  fontFamily: "var(--font-sans)",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--color-ink)",
  background: "#ffffff",
  border: "1px solid var(--color-primary)",
  borderRadius: "2px",
  cursor: "pointer",
} as const;
const dim = { fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "var(--color-ink-dim)" } as const;
