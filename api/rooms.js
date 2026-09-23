import { getAddress } from "viem";
import { withSignedRegistry, registryCommand, recoverMessageAddress, registryPolicyDecision } from "../server/signed-registry.mjs";

/**
 * Community-room registry — built-in room chatIds AND admin-created custom rooms
 * (each with its own gate), so creating a room makes it live for everyone with no
 * redeploy. Backed by Vercel KV / Upstash Redis over its REST API (no SDK). Reads
 * are public; writes require a signature from a live research.bittrees.eth space admin.
 *
 * Vercel KV / Upstash inject these when you connect a store:
 *   KV_REST_API_URL / KV_REST_API_TOKEN  (or UPSTASH_REDIS_REST_URL / _TOKEN)
 */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ROOMS_KEY = "bittrees:research:rooms"; // { roomKey: chatId } for built-in rooms
const CUSTOM_KEY = "bittrees:research:customrooms"; // [{ key, name, blurb, gate, chatId }]
const ICONS_KEY = "bittrees:research:roomicons"; // { roomKey: emoji | image URL } — admin-set
const ROLES_KEY = "bittrees:research:roles"; // { <addrLower>: [{ label, color }] } — admin-assigned roles
const SNAPSHOT_SPACE = "research.bittrees.eth";
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

// Full admin access: the standing super-admin (executive) or the Executive role.
// Mirrors src/lib/adminAccess.ts.
const SUPER_ADMIN = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f";
const FULL_ROLE_RE = /^executive$/i;
function hasFullRole(rolesMap, addrLower) {
  if (registryPolicyDecision() !== undefined) return registryPolicyDecision();
  const list = (rolesMap && rolesMap[addrLower]) || [];
  return list.some((r) => FULL_ROLE_RE.test(String(r?.label || "")));
}

// Who may PROPOSE a room (pending an admin's approval): role-holders.
const PROPOSALS_KEY = "bittrees:research:roomproposals"; // [{ id, name, blurb, gate, by, at }]
const PROPOSE_ROLE_RE = /^(executive|researcher|steward)$/i;
function hasProposeRole(rolesMap, addrLower) {
  if (registryPolicyDecision() !== undefined) return registryPolicyDecision();
  const list = (rolesMap && rolesMap[addrLower]) || [];
  return list.some((r) => PROPOSE_ROLE_RE.test(String(r?.label || "")));
}

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

async function spaceAdmins() {
  try {
    const r = await fetch("https://hub.snapshot.org/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query($id:String!){ space(id:$id){ admins } }", variables: { id: SNAPSHOT_SPACE } }),
    });
    const j = await r.json();
    return (j?.data?.space?.admins ?? []).map((a) => String(a).toLowerCase());
  } catch {
    return [];
  }
}

const isAddr = (s) => /^0x[a-fA-F0-9]{40}$/.test(String(s || ""));

function validRule(r) {
  if (!r || typeof r !== "object") return false;
  if (r.kind === "bgov") return Number.isFinite(Number(r.tier)) && Number(r.tier) >= 0;
  if (r.kind === "safe") return isAddr(r.safe);
  if (r.kind === "token") {
    if (!isAddr(r.token)) return false;
    if (r.standard === "erc1155") return (r.tokenId === undefined || r.tokenId === "" || /^\d+$/.test(String(r.tokenId))) && /^\d+$/.test(String(r.min || ""));
    if (r.standard === "erc20") return /^\d+(\.\d+)?$/.test(String(r.min || "")); // human amount
    if (r.standard === "erc721") return /^\d+$/.test(String(r.min || ""));
    return false;
  }
  if (r.kind === "ens") return r.name === undefined || r.name === "" || (typeof r.name === "string" && /\./.test(r.name) && r.name.length <= 80);
  if (r.kind === "role") return typeof r.role === "string" && r.role.trim().length > 0 && r.role.length <= 64;
  return false;
}
function validGate(g) {
  if (!g || typeof g !== "object") return false;
  if (g.kind === "multi") return Array.isArray(g.rules) && g.rules.length > 0 && g.rules.length <= 8 && g.rules.every(validRule);
  return validRule(g);
}

/** Verify the request is signed by a full admin: a live research.bittrees.eth space
 *  admin, the super-admin address, or a Partner/Junior Partner/Associate role. */
async function verifyAdmin(address, signature, message) {
  if (!isAddr(address)) return { ok: false, code: 400, error: "invalid address" };
  let recovered;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    return { ok: false, code: 400, error: "bad signature" };
  }
  if (getAddress(recovered) !== getAddress(address)) return { ok: false, code: 403, error: "signature mismatch" };
  const signer = recovered.toLowerCase();
  if (signer === SUPER_ADMIN) return { ok: true };
  const [admins, roles] = await Promise.all([spaceAdmins(), readJson(ROLES_KEY, {})]);
  if (admins.includes(signer) || hasFullRole(roles || {}, signer)) return { ok: true };
  if (admins.length === 0) return { ok: false, code: 503, error: "could not verify admins" };
  return { ok: false, code: 403, error: "not authorized" };
}

/** Verify the signer may PROPOSE a room: super-admin, space admin, or an
 *  Operations / Partner / Junior Partner / Associate role. Returns the signer. */
async function verifyProposer(address, signature, message) {
  if (!isAddr(address)) return { ok: false, code: 400, error: "invalid address" };
  let recovered;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    return { ok: false, code: 400, error: "bad signature" };
  }
  if (getAddress(recovered) !== getAddress(address)) return { ok: false, code: 403, error: "signature mismatch" };
  const signer = recovered.toLowerCase();
  if (signer === SUPER_ADMIN) return { ok: true, signer };
  const [admins, roles] = await Promise.all([spaceAdmins(), readJson(ROLES_KEY, {})]);
  if (admins.includes(signer) || hasProposeRole(roles || {}, signer)) return { ok: true, signer };
  if (admins.length === 0) return { ok: false, code: 503, error: "could not verify roles" };
  return { ok: false, code: 403, error: "not authorized to propose" };
}

export async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const [rooms, custom, proposals, icons] = await Promise.all([
      readJson(ROOMS_KEY, {}),
      readJson(CUSTOM_KEY, []),
      readJson(PROPOSALS_KEY, []),
      readJson(ICONS_KEY, {}),
    ]);
    res.status(200).json({ rooms: rooms || {}, custom: custom || [], proposals: proposals || [], icons: icons || {} });
    return;
  }

  if (req.method === "POST") {
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

      // Propose a room (role-holders) — queues a pending request for an admin.
      if (body.proposal) {
        const p = body.proposal;
        if (!p.name || !validGate(p.gate)) { res.status(400).json({ error: "invalid proposal" }); return; }
        const v = await verifyProposer(address, signature, `Bittrees room proposal\n${String(p.name)}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const slug = String(p.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "room";
        const clean = {
          id: `prop-${slug}-${timestamp}`,
          name: String(p.name).slice(0, 80),
          blurb: String(p.blurb || "").slice(0, 160),
          gate: p.gate,
          by: v.signer,
          at: Number(timestamp),
        };
        const proposals = (await readJson(PROPOSALS_KEY, [])) || [];
        const next = [...proposals, clean].slice(-100); // cap the queue
        await writeJson(PROPOSALS_KEY, next);
        res.status(200).json({ ok: true, proposals: next });
        return;
      }

      // Approve a proposal (full admins) — the admin already created the Push group
      // client-side and passes the room (with chatId); we publish it + drop the proposal.
      if (body.approve) {
        const { proposalId, room } = body.approve;
        if (!proposalId || !room || !room.key || !room.name || !room.chatId || !validGate(room.gate)) {
          res.status(400).json({ error: "invalid approval" });
          return;
        }
        const v = await verifyAdmin(address, signature, `Bittrees room approve\n${proposalId}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const clean = {
          key: String(room.key).slice(0, 64),
          name: String(room.name).slice(0, 80),
          blurb: String(room.blurb || "").slice(0, 160),
          gate: room.gate,
          chatId: String(room.chatId).slice(0, 200),
        };
        const custom = (await readJson(CUSTOM_KEY, [])) || [];
        const nextCustom = [...custom.filter((r) => r.key !== clean.key), clean];
        await writeJson(CUSTOM_KEY, nextCustom);
        const proposals = (await readJson(PROPOSALS_KEY, [])) || [];
        const nextProps = proposals.filter((p) => p.id !== proposalId);
        await writeJson(PROPOSALS_KEY, nextProps);
        res.status(200).json({ ok: true, custom: nextCustom, proposals: nextProps });
        return;
      }

      // Reject a proposal (full admins) — drop it from the queue.
      if (body.reject) {
        const proposalId = String(body.reject);
        const v = await verifyAdmin(address, signature, `Bittrees room reject\n${proposalId}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const proposals = (await readJson(PROPOSALS_KEY, [])) || [];
        const next = proposals.filter((p) => p.id !== proposalId);
        await writeJson(PROPOSALS_KEY, next);
        res.status(200).json({ ok: true, proposals: next });
        return;
      }

      // Set (or clear) a room's avatar — an emoji or http(s) image URL.
      if (body.icon) {
        const key = String(body.icon.key || "").slice(0, 64);
        const value = String(body.icon.value || "").slice(0, 400);
        if (!key) { res.status(400).json({ error: "missing room key" }); return; }
        // Allow only an emoji/short text, or an http(s) URL — never javascript:/data: etc.
        const ok = value === "" || /^https?:\/\//i.test(value) || value.length <= 8;
        if (!ok) { res.status(400).json({ error: "icon must be an emoji or http(s) image URL" }); return; }
        const v = await verifyAdmin(address, signature, `Bittrees rooms registry\nicon ${key} = ${value}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const icons = (await readJson(ICONS_KEY, {})) || {};
        if (value) icons[key] = value; else delete icons[key];
        await writeJson(ICONS_KEY, icons);
        res.status(200).json({ ok: true, icons });
        return;
      }

      // Delete a custom room.
      if (body.deleteCustom) {
        const key = String(body.deleteCustom);
        const v = await verifyAdmin(address, signature, `Bittrees rooms registry\ndelete-custom ${key}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const custom = (await readJson(CUSTOM_KEY, [])) || [];
        const next = custom.filter((r) => r.key !== key);
        await writeJson(CUSTOM_KEY, next);
        res.status(200).json({ ok: true, custom: next });
        return;
      }

      // Add / replace a custom room.
      if (body.custom) {
        const room = body.custom;
        if (!room.key || !room.name || !room.chatId || !validGate(room.gate)) {
          res.status(400).json({ error: "invalid custom room" });
          return;
        }
        const v = await verifyAdmin(address, signature, `Bittrees rooms registry\ncustom ${room.key}\nat ${timestamp}`);
        if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
        const clean = {
          key: String(room.key).slice(0, 64),
          name: String(room.name).slice(0, 80),
          blurb: String(room.blurb || "").slice(0, 160),
          gate: room.gate,
          chatId: String(room.chatId).slice(0, 200),
        };
        const custom = (await readJson(CUSTOM_KEY, [])) || [];
        const next = [...custom.filter((r) => r.key !== clean.key), clean];
        await writeJson(CUSTOM_KEY, next);
        res.status(200).json({ ok: true, custom: next });
        return;
      }

      // Set a built-in room's chatId.
      const { roomKey, chatId } = body;
      if (!roomKey || !chatId) {
        res.status(400).json({ error: "missing fields" });
        return;
      }
      const v = await verifyAdmin(address, signature, `Bittrees rooms registry\nset ${roomKey} = ${chatId}\nat ${timestamp}`);
      if (!v.ok) { res.status(v.code).json({ error: v.error }); return; }
      const rooms = (await readJson(ROOMS_KEY, {})) || {};
      rooms[roomKey] = chatId;
      await writeJson(ROOMS_KEY, rooms);
      res.status(200).json({ ok: true, rooms });
    } catch (e) {
      res.status(500).json({ error: String((e && e.message) || e) });
    }
    return;
  }

  res.status(405).json({ error: "method not allowed" });
}

export default withSignedRegistry(handler);
