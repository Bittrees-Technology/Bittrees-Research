import { getAddress } from "viem";
import { withSignedRegistry, registryCommand, recoverMessageAddress, registryPolicyDecision } from "../server/signed-registry.mjs";

/**
 * Community registry — admin-assigned custom roles/tags AND community moderation
 * flags. Backed by Vercel KV / Upstash over its REST API. Reads are public.
 * Writes are signed:
 *   - roles (assign/unassign): a live research.bittrees.eth space ADMIN
 *   - flag/unflag: any BGOV holder (shareholder), verified server-side
 *   - moderate (approve/remove): a space admin OR moderator
 *
 * Content hides once FLAG_HIDE_THRESHOLD distinct shareholders flag it (unless a
 * moderator has approved it); a moderator can approve (un-hide) or remove (keep
 * hidden). Forum posts are immutable on-chain, so "hide" is an app-level filter.
 *
 * Vercel KV / Upstash inject: KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_*).
 */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ROLES_KEY = "bittrees:research:roles"; // { <addrLower>: [{ label, color }] }
const ROLEDEFS_KEY = "bittrees:research:roledefs"; // [{ label, color, description }] — the catalog of assignable roles
const FLAGS_KEY = "bittrees:research:flags"; // { <itemId>: { by:[addr], mod:'approved'|'removed'|null, surface, preview } }
const ENCKEYS_KEY = "bittrees:research:enckeys"; // { <addrLower>: <x25519 pubkey hex> } — for encrypting applications
const SNAPSHOT_SPACE = "research.bittrees.eth";
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
export const FLAG_HIDE_THRESHOLD = 2;

async function kvCommand(cmd) { return registryCommand(cmd); }

async function readJson(key, fallback) {
  if (!KV_URL || !KV_TOKEN) return fallback;
  try {
    const j = await kvCommand(["GET", key]);
    return j?.result ? JSON.parse(j.result) : fallback;
  } catch {
    return fallback;
  }
}
async function writeJson(key, value) {
  await kvCommand(["SET", key, JSON.stringify(value)]);
}

const isAddr = (s) => /^0x[a-fA-F0-9]{40}$/.test(String(s || ""));

/** admins (+ optionally moderators) of the space, lowercased. */
async function spaceRoles(includeMods) {
  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query($id:String!){ space(id:$id){ admins moderators } }", variables: { id: SNAPSHOT_SPACE } }),
    });
    const j = await r.json();
    const s = j?.data?.space || {};
    const list = [...(s.admins ?? []), ...(includeMods ? s.moderators ?? [] : [])];
    return list.map((a) => String(a).toLowerCase());
  } catch {
    return [];
  }
}

/** A holder's BGOV voting power (shareholder check), via Snapshot. */
async function bgovVp(address) {
  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query($v:String!,$s:String!){ vp(voter:$v, space:$s){ vp } }", variables: { v: address, s: SNAPSHOT_SPACE } }),
    });
    const j = await r.json();
    return Number(j?.data?.vp?.vp ?? 0);
  } catch {
    return 0;
  }
}

/** Recover the signer; return its lowercased address iff it matches `address`. */
async function recover(address, signature, message) {
  if (!isAddr(address)) return null;
  try {
    const rec = await recoverMessageAddress({ message, signature });
    return getAddress(rec) === getAddress(address) ? rec.toLowerCase() : null;
  } catch {
    return null;
  }
}

function hasRole(rolesMap, addrLower, re) {
  const list = (rolesMap && rolesMap[addrLower]) || [];
  return list.some((r) => re.test(String(r?.label || "")));
}

// Full admin access: the standing super-admin (executive) or the Executive role.
// Mirrors src/lib/adminAccess.ts.
const SUPER_ADMIN = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f";
const FULL_ROLE_RE = /^executive$/i;
function isFullAdmin(signer, admins, rolesMap) {
  if (registryPolicyDecision() !== undefined) return registryPolicyDecision();
  return signer === SUPER_ADMIN || (admins || []).includes(signer) || hasRole(rolesMap, signer, FULL_ROLE_RE);
}

export async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const [roles, flags, enckeys, roledefs] = await Promise.all([
      readJson(ROLES_KEY, {}),
      readJson(FLAGS_KEY, {}),
      readJson(ENCKEYS_KEY, {}),
      readJson(ROLEDEFS_KEY, []),
    ]);
    res.status(200).json({ roles: roles || {}, flags: flags || {}, enckeys: enckeys || {}, roledefs: roledefs || [], threshold: FLAG_HIDE_THRESHOLD });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (!KV_URL || !KV_TOKEN) {
    res.status(503).json({ error: "registry not configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { address, signature, timestamp } = body;
    if (!address || !signature || !timestamp) {
      res.status(400).json({ error: "missing fields" });
      return;
    }
    if (!Number.isFinite(Number(timestamp)) || Math.abs(Date.now() - Number(timestamp)) > REPLAY_WINDOW_MS) {
      res.status(400).json({ error: "stale or invalid timestamp" });
      return;
    }

    // ── Roles (admin-signed) ───────────────────────────────────────────────
    if (body.assignRole || body.unassignRole) {
      const op = body.assignRole || body.unassignRole;
      const { target, label, color } = op;
      if (!isAddr(target) || !label) { res.status(400).json({ error: "invalid role" }); return; }
      const t = getAddress(target).toLowerCase();
      const verb = body.assignRole ? "assign" : "unassign";
      const signer = await recover(address, signature, `Bittrees roles\n${verb} ${label} -> ${t}\nat ${timestamp}`);
      const [admins, rolesRaw] = await Promise.all([spaceRoles(false), readJson(ROLES_KEY, {})]);
      const roles = rolesRaw || {};
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      if (registryPolicyDecision() === undefined && admins.length === 0 && signer !== SUPER_ADMIN) { res.status(503).json({ error: "could not verify admins" }); return; }
      if (!isFullAdmin(signer, admins, roles)) { res.status(403).json({ error: "not authorized" }); return; }
      if (body.assignRole) {
        const entry = { label: String(label).slice(0, 32), color: String(color || "").slice(0, 16) };
        roles[t] = [...(roles[t] || []).filter((r) => r.label !== entry.label), entry];
      } else {
        const next = (roles[t] || []).filter((r) => r.label !== label);
        if (next.length) roles[t] = next; else delete roles[t];
      }
      await writeJson(ROLES_KEY, roles);
      res.status(200).json({ ok: true, roles });
      return;
    }

    // ── Role catalog (admin-signed) — create/recolor or delete a role def ──────
    if (body.createRole || body.deleteRole) {
      const op = body.createRole || body.deleteRole;
      const label = String(op.label || "").trim().slice(0, 32);
      if (!label) { res.status(400).json({ error: "invalid role label" }); return; }
      const verb = body.createRole ? "create" : "delete";
      const signer = await recover(address, signature, `Bittrees roledef\n${verb} ${label}\nat ${timestamp}`);
      const [admins, rolesMap] = await Promise.all([spaceRoles(false), readJson(ROLES_KEY, {})]);
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      if (registryPolicyDecision() === undefined && admins.length === 0 && signer !== SUPER_ADMIN) { res.status(503).json({ error: "could not verify admins" }); return; }
      if (!isFullAdmin(signer, admins, rolesMap || {})) { res.status(403).json({ error: "not authorized" }); return; }
      const defs = (await readJson(ROLEDEFS_KEY, [])) || [];
      const without = defs.filter((d) => String(d.label || "").toLowerCase() !== label.toLowerCase());
      if (body.createRole) {
        // Reject duplicates — a role with this title already exists (built-in or catalog).
        const RESERVED = ["executive", "assistant", "researcher", "steward"];
        const dup = RESERVED.includes(label.toLowerCase()) || defs.some((d) => String(d.label || "").toLowerCase() === label.toLowerCase());
        if (dup) { res.status(409).json({ error: `Role "${label}" already exists` }); return; }
        const def = { label, color: String(op.color || "").slice(0, 16), description: String(op.description || "").slice(0, 200) };
        const next = [...without, def];
        await writeJson(ROLEDEFS_KEY, next);
        res.status(200).json({ ok: true, roledefs: next });
      } else {
        await writeJson(ROLEDEFS_KEY, without);
        // Cascade: remove this role from every address it was assigned to.
        const roles = (await readJson(ROLES_KEY, {})) || {};
        let changed = false;
        for (const addr of Object.keys(roles)) {
          const filtered = (roles[addr] || []).filter((r) => String(r.label || "").toLowerCase() !== label.toLowerCase());
          if (filtered.length !== (roles[addr] || []).length) {
            changed = true;
            if (filtered.length) roles[addr] = filtered; else delete roles[addr];
          }
        }
        if (changed) await writeJson(ROLES_KEY, roles);
        res.status(200).json({ ok: true, roledefs: without, roles });
      }
      return;
    }

    // Publish your own X25519 public key, so submitters can encrypt apps to you.
    if (body.publishKey) {
      const pubkey = String(body.publishKey.pubkey || "").toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(pubkey)) { res.status(400).json({ error: "bad pubkey" }); return; }
      const signer = await recover(address, signature, `Bittrees enckey\n${pubkey}\nat ${timestamp}`);
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      const keys = (await readJson(ENCKEYS_KEY, {})) || {};
      keys[signer] = pubkey;
      await writeJson(ENCKEYS_KEY, keys);
      res.status(200).json({ ok: true });
      return;
    }

    // ── Flag (shareholder-signed) ──────────────────────────────────────────
    if (body.flag) {
      const { id, surface, preview } = body.flag;
      if (!id) { res.status(400).json({ error: "missing item id" }); return; }
      const signer = await recover(address, signature, `Bittrees flag\n${surface || ""}:${id}\nat ${timestamp}`);
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      const vp = await bgovVp(signer);
      if (vp < 1) { res.status(403).json({ error: "only BGOV holders can flag" }); return; }
      const flags = (await readJson(FLAGS_KEY, {})) || {};
      const rec = flags[id] || { by: [], mod: null, surface: surface || "", preview: "" };
      if (!rec.by.includes(signer)) rec.by.push(signer);
      if (!rec.preview && preview) rec.preview = String(preview).slice(0, 240);
      rec.surface = rec.surface || surface || "";
      flags[id] = rec;
      await writeJson(FLAGS_KEY, flags);
      res.status(200).json({ ok: true, flags });
      return;
    }

    // ── Unflag (retract own flag) ──────────────────────────────────────────
    if (body.unflag) {
      const { id } = body.unflag;
      if (!id) { res.status(400).json({ error: "missing item id" }); return; }
      const signer = await recover(address, signature, `Bittrees unflag\n${id}\nat ${timestamp}`);
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      const flags = (await readJson(FLAGS_KEY, {})) || {};
      const rec = flags[id];
      if (rec) {
        rec.by = rec.by.filter((a) => a !== signer);
        if (rec.by.length === 0 && !rec.mod) delete flags[id]; else flags[id] = rec;
        await writeJson(FLAGS_KEY, flags);
      }
      res.status(200).json({ ok: true, flags });
      return;
    }

    // ── Moderate (admin/moderator-signed) ──────────────────────────────────
    if (body.moderate) {
      const { id, action } = body.moderate; // 'approve' | 'remove' | 'clear'
      if (!id || !["approve", "remove", "clear"].includes(action)) { res.status(400).json({ error: "bad action" }); return; }
      const signer = await recover(address, signature, `Bittrees moderate\n${action} ${id}\nat ${timestamp}`);
      if (!signer) { res.status(400).json({ error: "bad signature" }); return; }
      const [mods, rolesRaw] = await Promise.all([spaceRoles(true), readJson(ROLES_KEY, {})]);
      const roles = rolesRaw || {};
      if (registryPolicyDecision() === undefined && mods.length === 0 && signer !== SUPER_ADMIN) { res.status(503).json({ error: "could not verify moderators" }); return; }
      // Full admins (super-admin / space admin / Executive) OR the Assistant role may moderate.
      if (!isFullAdmin(signer, mods, roles) && !hasRole(roles, signer, /^assistant$/i)) { res.status(403).json({ error: "not authorized to moderate" }); return; }
      const flags = (await readJson(FLAGS_KEY, {})) || {};
      const rec = flags[id];
      if (rec) {
        if (action === "clear") delete flags[id];
        else { rec.mod = action === "approve" ? "approved" : "removed"; flags[id] = rec; }
        await writeJson(FLAGS_KEY, flags);
      }
      res.status(200).json({ ok: true, flags });
      return;
    }

    res.status(400).json({ error: "unknown action" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

export default withSignedRegistry(handler);
