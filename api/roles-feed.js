import { createHash, createPrivateKey, sign } from "node:crypto";
const SOURCE = "research.bittrees.org";
const PREFIX = "bittrees:research:";
export async function readFeed({
  fetcher = fetch,
  env = process.env,
  now = Date.now(),
} = {}) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !env.ROLES_FEED_PRIVATE_KEY)
    throw Error("Role feed not configured");
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(["MGET", PREFIX + "roles", PREFIX + "roledefs"]),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error("Role storage unavailable");
  const value = await response.json();
  if (value.error || !Array.isArray(value.result) || value.result.length !== 2)
    throw Error("Invalid role storage response");
  const roles = value.result[0] === null ? {} : JSON.parse(value.result[0]);
  const roledefs = value.result[1] === null ? [] : JSON.parse(value.result[1]);
  if (
    !roles ||
    Array.isArray(roles) ||
    typeof roles !== "object" ||
    Object.keys(roles).length > 1000 ||
    !Array.isArray(roledefs)
  )
    throw Error("Invalid role records");
  for (const [wallet, entries] of Object.entries(roles))
    if (
      !/^0x[0-9a-f]{40}$/i.test(wallet) ||
      !Array.isArray(entries) ||
      entries.length > 100 ||
      entries.some(
        (r) =>
          typeof r.label !== "string" ||
          !r.label.trim() ||
          r.label.length > 100,
      )
    )
      throw Error("Invalid role assignment");
  if(new Set(Object.keys(roles).map(w=>w.toLowerCase())).size!==Object.keys(roles).length)throw Error("Duplicate wallet records");
  const records = Object.fromEntries(
    Object.entries(roles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wallet, entries]) => [
        wallet.toLowerCase(),
        entries.map((r) => ({ label: r.label, color: r.color || "" })),
      ]),
  );
  const superAdmin = "0xe5350d96fc3161bf5c385843ec5ee24e8b465b2f";
  const adminRole =
    SOURCE === "research.bittrees.org"
      ? /^executive$/i
      : /^(partner|junior partner|associate)$/i;
  const moderationRole =
    SOURCE === "research.bittrees.org" ? /^assistant$/i : /^(moderator|mod)$/i;
  const permissions = {};
  for (const wallet of new Set([...Object.keys(records), superAdmin])) {
    const entries = records[wallet] || [],
      admin =
        wallet.toLowerCase() === superAdmin ||
        entries.some((r) => adminRole.test(r.label));
    const claims = [];
    const claim = (id) => ({
      id,
      scope: "community-registry",
      effect: "allow",
      status: "active",
      expiresAt: null,
      policyVersion: null,
      basis:
        "Configured server authorization rule; request-time signature and Snapshot availability checks still apply",
    });
    if (admin) claims.push(claim("community.roles.manage"));
    if (admin || entries.some((r) => moderationRole.test(r.label)))
      claims.push(claim("community.moderation.manage"));
    if (claims.length) permissions[wallet] = claims;
  }
  // Legacy label-based permission estimates are invalid after authority cutover.
  if (["root-policy","root-policy-auto"].includes(env.REGISTRY_AUTHORITY_MODE)) for (const wallet of Object.keys(permissions)) delete permissions[wallet];
  const content = {
    roles: records,
    roledefs,
    tags: null,
    tagdefs: null,
    permissions,
    permissiondefs: [
      {
        id: "community.roles.manage",
        label: "Manage community role assignments and catalog",
      },
      {
        id: "community.moderation.manage",
        label: "Approve or remove flagged community content",
      },
    ],
    permissionCoverage: "partial",
  };
  const data = {
    schemaVersion: 2,
    source: SOURCE,
    audience: "https://roles.bittrees.org",
    generatedAt: new Date(now).toISOString(),
    revision: createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex"),
    ...content,
  };
  const key = createPrivateKey(env.ROLES_FEED_PRIVATE_KEY);
  if (key.asymmetricKeyType !== "ed25519") throw Error("Invalid feed key");
  return {
    data,
    signature: sign(null, Buffer.from(JSON.stringify(data)), key).toString(
      "base64",
    ),
  };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    return res.status(200).json(await readFeed());
  } catch {
    return res.status(503).json({ error: "Role source unavailable" });
  }
}
