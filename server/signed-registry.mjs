import {authorityDecision} from "./authority-client.mjs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { actionMessage } from "../shared/signed-action.mjs";
const context = new AsyncLocalStorage();
const keys = [
  "roles",
  "roledefs",
  "flags",
  "enckeys",
  "rooms",
  "customrooms",
  "roomicons",
  "roomproposals",
].map((k) => "bittrees:research:" + k);
const revisionKey = "bittrees:research:registry:revision";
const fail = (message, status = 400) =>
  Object.assign(Error(message), { status });
export async function redisCommand(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw fail("Registry unavailable", 503);
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw fail("Registry unavailable", 503);
  const data = await r.json();
  if (data.error) throw fail("Registry unavailable", 503);
  return data;
}
export async function registryCommand(cmd) {
  const c = context.getStore();
  if (!c) throw fail("Missing registry transaction", 503);
  const [op, key, value] = cmd;
  if (!keys.includes(key)) throw fail("Unknown registry key");
  if (op === "GET") return { result: c.state.get(key) ?? null };
  if (op === "SET" && c.signed) {
    c.state.set(key, value);
    c.writes.set(key, value);
    return { result: "OK" };
  }
  throw fail("Unsupported registry operation");
}
export function registryPolicyDecision(){return context.getStore()?.policyDecision;}
export async function recoverMessageAddress() {
  const c = context.getStore();
  if (!c?.signed) throw fail("Verified action required", 401);
  return c.signer;
}
// Revision, nonce consumption, all changed records and audit event commit together.
export const commitScript = `
local auditType = redis.call('TYPE',KEYS[3]).ok
if auditType ~= 'none' and auditType ~= 'list' then return -3 end
local rev = tonumber(redis.call('GET',KEYS[1]) or '0')
if redis.call('EXISTS',KEYS[2]) == 1 then return -2 end
if rev ~= tonumber(ARGV[1]) then return -1 end
local writes = cjson.decode(ARGV[2])
for _,w in ipairs(writes) do redis.call('SET',w[1],w[2]) end
redis.call('SET',KEYS[1],rev+1)
redis.call('SET',KEYS[2],'used','EX',1200)
redis.call('RPUSH',KEYS[3],ARGV[3])
return rev+1`;
export function withSignedRegistry(
  handler,
  { command = redisCommand, verify } = {},
) {
  return async (req, res) => {
    try {
      const raw =
        typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {});
      if (Buffer.byteLength(raw) > 32000) throw fail("Request too large", 413);
      const incoming = JSON.parse(raw);
      const snapshot = (await command(["MGET", revisionKey, ...keys])).result;
      if (!Array.isArray(snapshot) || snapshot.length !== keys.length + 1)
        throw fail("Invalid registry snapshot", 503);
      const revision = Number(snapshot[0] ?? 0);
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw fail("Invalid registry revision", 503);
      const c = {
        state: new Map(keys.map((k, i) => [k, snapshot[i + 1]])),
        writes: new Map(),
        signed: false,
      };
      // Validate every stored document before any existing helper can turn a failure into empty state.
      for (const [key, value] of c.state)
        if (value !== null)
          try {
            const parsed = JSON.parse(value);
            const arrayKey = ["roledefs", "customrooms", "roomproposals"].some(
              (k) => key.endsWith(":" + k),
            );
            if (
              !parsed ||
              typeof parsed !== "object" ||
              Array.isArray(parsed) !== arrayKey
            )
              throw Error("shape");
          } catch {
            throw fail("Invalid registry state", 503);
          }
      if (req.method === "POST") {
        const { signature, ...e } = incoming;
        const endpoint = req.url?.split("?")[0];
        const audience =
          process.env.REGISTRY_AUDIENCE || "https://research.bittrees.org";
        if (
          e.version !== 2 ||
          e.audience !== audience ||
          e.chainId !== 1 ||
          e.endpoint !== endpoint ||
          !["/api/community", "/api/rooms"].includes(endpoint)
        )
          throw fail("Wrong action audience or version");
        if (
          !/^0x[0-9a-f]{40}$/i.test(e.address || "") ||
          !/^[0-9a-f]{64}$/.test(e.nonce || "") ||
          !Number.isSafeInteger(e.timestamp) ||
          Math.abs(Date.now() - e.timestamp) > 300000 ||
          !Number.isSafeInteger(e.expectedRevision) ||
          !e.payload ||
          Array.isArray(e.payload) ||
          typeof e.payload !== "object"
        )
          throw fail("Invalid action envelope");
        const allowed =
          endpoint === "/api/community"
            ? [
                "assignRole",
                "unassignRole",
                "createRole",
                "deleteRole",
                "publishKey",
                "flag",
                "unflag",
                "moderate",
              ]
            : [
                "proposal",
                "approve",
                "reject",
                "icon",
                "deleteCustom",
                "custom",
                "roomKey",
                "chatId",
              ];
        if (Object.keys(e.payload).some((k) => !allowed.includes(k)))
          throw fail("Unknown action fields");
        const actions = Object.keys(e.payload).filter((k) => k !== "chatId");
        if (actions.length !== 1) throw fail("Exactly one action required");
        if (
          Object.keys(e).sort().join(",") !==
          "address,audience,chainId,endpoint,expectedRevision,nonce,payload,timestamp,version"
        )
          throw fail("Unknown envelope fields");
        if (e.expectedRevision !== revision)
          throw fail("Registry changed. Reload and sign again.", 409);
        const verifier =
          verify ||
          (async (args) =>
            createPublicClient({
              chain: mainnet,
              transport: http(
                process.env.MAINNET_RPC_URL ||
                  "https://ethereum-rpc.publicnode.com",
                { timeout: 10000 },
              ),
            }).verifyMessage(args));
        if (
          !(await verifier({
            address: e.address,
            message: actionMessage(e),
            signature,
          }))
        )
          throw fail("Signature rejected", 401);
        if(['root-policy','root-policy-auto'].includes(process.env.REGISTRY_AUTHORITY_MODE)) {
          const op=actions[0];
          const action=['assignRole','unassignRole','createRole','deleteRole'].includes(op)?'community.roles.manage':op==='moderate'?'community.moderation.manage':e.endpoint==='/api/rooms'?(op==='proposal'?'rooms.propose':'rooms.manage'):null;
          if(action){const decision=await authorityDecision(e.address,action);if(process.env.REGISTRY_AUTHORITY_MODE==='root-policy-auto'&&decision.configured===false){c.policyPending=true;}else{if(!decision.allowed)throw fail(decision.reason||'Not authorized by root policy',403);c.policyDecision=true;c.policyExpiresAt=Date.parse(decision.expiresAt);if(!Number.isFinite(c.policyExpiresAt)||c.policyExpiresAt<=Date.now())throw fail("Authority decision expired",403);}}
        }
        c.signed = true;
        c.signer = e.address.toLowerCase();
        c.envelope = e;
        req = {
          ...req,
          body: {
            ...e.payload,
            address: e.address,
            signature,
            timestamp: e.timestamp,
          },
        };
      }
      let status = 200,
        body;
      const output = {
        setHeader: (...a) => res.setHeader(...a),
        status(n) {
          status = n;
          return this;
        },
        json(v) {
          body = v;
          return this;
        },
      };
      await context.run(c, () => handler(req, output));
      if (status >= 200 && status < 300 && c.signed) {
        const e = c.envelope;
        if(c.policyDecision && c.policyExpiresAt<=Date.now())throw fail("Authority decision expired before commit",403);
        const audit = JSON.stringify({
          actor: c.signer,
          endpoint: e.endpoint,
          action: Object.keys(e.payload).find(k=>k!=="chatId"),
          at: new Date().toISOString(),
          previousRevision: revision,
          payloadHash: createHash("sha256")
            .update(actionMessage(e))
            .digest("hex"),
        });
        const result = (
          await command([
            "EVAL",
            commitScript,
            3,
            revisionKey,
            "bittrees:research:registry:nonce:" + c.signer + ":" + e.nonce,
            "bittrees:research:registry:audit",
            String(revision),
            JSON.stringify([...c.writes]),
            audit,
          ])
        ).result;
        if (result === -2) throw fail("Action already used", 409);
        if (result === -1)
          throw fail("Registry changed. Reload and sign again.", 409);
        if (result !== revision + 1) throw fail("Commit not confirmed", 503);
        body = { ...body, revision: result };
      } else if (status >= 200 && status < 300) body = { ...body, revision, authorizationMode: process.env.REGISTRY_AUTHORITY_MODE === "root-policy" ? "root-policy" : process.env.REGISTRY_AUTHORITY_MODE === "root-policy-auto" ? "controller-policy-on-activation" : "legacy" };
      return res.status(status).json(body);
    } catch (e) {
      return res
        .status(e.status || 503)
        .json({ error: e.status ? e.message : "Registry unavailable" });
    }
  };
}
