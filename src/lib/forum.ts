import { useQuery } from "@tanstack/react-query";
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  type WalletClient,
  type Address,
  type Hash,
} from "viem";
import { base } from "viem/chains";

/**
 * Decentralized, wallet-signed governance forum on EAS (Ethereum Attestation
 * Service), on Base.
 *
 * A post is an on-chain attestation against a fixed schema; replies reference
 * the root post via `refUID` (EAS's native threading). Posts are written with
 * plain viem `writeContract` to the EAS predeploy and read back through EASSCAN's
 * public GraphQL indexer — no backend of ours, no SDK, no ethers.
 *
 * Why on-chain (not off-chain): EAS off-chain attestations are private by
 * default — EASSCAN only indexes them if a user clicks "Publish to IPFS" in the
 * explorer; there is no documented/stable HTTP store. On-chain attestations are
 * auto-indexed from the `Attested` event, so posts reliably appear. Cost is a
 * fraction of a cent of gas per post on Base; the schema UID is deterministic.
 */

// ── Config (Base predeploys) ─────────────────────────────────────────────
export const EAS_ADDRESS: Address = "0x4200000000000000000000000000000000000021";
export const SCHEMA_REGISTRY: Address = "0x4200000000000000000000000000000000000020";
export const SCHEMA_STRING = "string community,string title,string body";
export const RESOLVER: Address = "0x0000000000000000000000000000000000000000";
export const REVOCABLE = true;
export const FORUM_COMMUNITY = "bittrees-research";
export const CONTRIB_COMMUNITY = "bittrees-research-contributors";
/** Member-submitted proposals (discussion ideas / research proposals). Any member
 *  may post here; Executives review and can promote one into a real discussion. */
export const PROPOSAL_COMMUNITY = "bittrees-research-proposals";
export const EASSCAN_GQL = "https://base.easscan.org/graphql";
export const EASSCAN_VIEW = "https://base.easscan.org/attestation/view/";

const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const ZERO_ADDR: Address = "0x0000000000000000000000000000000000000000";

/** Deterministic schema UID — matches SchemaRegistry._getUID exactly. */
export const SCHEMA_UID = keccak256(
  encodePacked(["string", "address", "bool"], [SCHEMA_STRING, RESOLVER, REVOCABLE])
);

/** Public Base client for reads (schema check) — public RPC, no wallet needed. */
const basePublic = createPublicClient({ chain: base, transport: http() });

// ── ABIs ─────────────────────────────────────────────────────────────────
const EAS_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getSchema",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;

// ── Writes (pure viem) ─────────────────────────────────────────────────────

function encodePost(community: string, title: string, body: string): `0x${string}` {
  return encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "string" }],
    [community, title, body]
  );
}

/** True once the forum schema is registered on Base (anyone, once — it's shared). */
export async function isSchemaRegistered(): Promise<boolean> {
  try {
    const rec = await basePublic.readContract({
      address: SCHEMA_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "getSchema",
      args: [SCHEMA_UID],
    });
    return rec.uid !== ZERO32;
  } catch {
    return false;
  }
}

/** Register the forum schema if it isn't already (idempotent, one-time ever). */
async function ensureSchema(walletClient: WalletClient, account: Address): Promise<void> {
  if (await isSchemaRegistered()) return;
  const hash = await walletClient.writeContract({
    address: SCHEMA_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "register",
    args: [SCHEMA_STRING, RESOLVER, REVOCABLE],
    account,
    chain: base,
  });
  await basePublic.waitForTransactionReceipt({ hash });
}

export interface PublishArgs {
  walletClient: WalletClient;
  account: Address;
  title: string;
  body: string;
  /** Root post UID to reply under; omit/ZERO32 for a new topic. */
  refUID?: `0x${string}`;
  /** Defaults to the forum community; contributor form uses CONTRIB_COMMUNITY. */
  community?: string;
}

/** Sign + submit a post (or reply) as an on-chain EAS attestation on Base. */
export async function publishPost(args: PublishArgs): Promise<Hash> {
  const { walletClient, account, title, body, refUID = ZERO32, community = FORUM_COMMUNITY } = args;
  await ensureSchema(walletClient, account);

  const request = {
    schema: SCHEMA_UID,
    data: {
      recipient: ZERO_ADDR,
      expirationTime: 0n,
      revocable: true,
      refUID,
      data: encodePost(community, title, body),
      value: 0n,
    },
  } as const;

  const hash = await walletClient.writeContract({
    address: EAS_ADDRESS,
    abi: EAS_ABI,
    functionName: "attest",
    args: [request],
    account,
    chain: base,
  });
  await basePublic.waitForTransactionReceipt({ hash });
  return hash;
}

// ── Reads (EASSCAN GraphQL, public) ────────────────────────────────────────

export interface ForumPost {
  id: `0x${string}`;
  attester: Address;
  time: number;
  refUID: `0x${string}`;
  community: string;
  title: string;
  body: string;
}

const FIELDS = `id attester refUID revocationTime time decodedDataJson`;

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(EASSCAN_GQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`EASSCAN HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "EASSCAN GraphQL error");
  return json.data as T;
}

interface RawAttestation {
  id: string;
  attester: string;
  refUID: string;
  revocationTime: number;
  time: number;
  decodedDataJson: string;
}

function toPost(a: RawAttestation): ForumPost {
  let fields: Record<string, string> = {};
  try {
    const arr = JSON.parse(a.decodedDataJson) as Array<{ name: string; value: { value: unknown } }>;
    fields = Object.fromEntries(arr.map((f) => [f.name, String(f.value?.value ?? "")]));
  } catch {
    /* leave fields empty on malformed data */
  }
  return {
    id: a.id as `0x${string}`,
    attester: a.attester as Address,
    time: a.time,
    refUID: a.refUID as `0x${string}`,
    community: fields.community ?? "",
    title: fields.title ?? "",
    body: fields.body ?? "",
  };
}

/** Top-level posts (topics) for a community, newest first. */
export function useTopics(community = FORUM_COMMUNITY, allPages = false) {
  return useQuery({
    queryKey: ["forum-topics", community, allPages],
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async (): Promise<ForumPost[]> => {
      const q = `
        query Topics($schemaId: String!, $community: String!, $skip: Int!) {
          attestations(
            where: {
              schemaId: { equals: $schemaId }
              refUID: { equals: "${ZERO32}" }
              revocationTime: { equals: 0 }
              decodedDataJson: { contains: $community }
            }
            orderBy: [{time: desc}, {id: desc}]
            take: 100
            skip: $skip
          ) { ${FIELDS} }
        }`;
      const collected = new Map<string, RawAttestation>();
      let skip = 0;
      while (true) {
        const d = await gql<{ attestations: RawAttestation[] }>(q, {schemaId: SCHEMA_UID, community, skip});
        const batch = d.attestations ?? [];
        const before = collected.size;
        for (const item of batch) collected.set(item.id, item);
        if (!allPages || batch.length < 100) break;
        if (collected.size === before) throw Error('Application index pagination stalled. Reload to try again.');
        skip += batch.length;
      }
      const posts = [...collected.values()].map(toPost).filter((p) => p.community === community);
      return posts;
    },
  });
}

/** A thread: the root post + its direct replies (oldest first). */
export function useThread(rootUID: string | undefined) {
  return useQuery({
    queryKey: ["forum-thread", rootUID],
    enabled: !!rootUID,
    staleTime: 20_000,
    refetchInterval: 45_000,
    retry: 1,
    queryFn: async (): Promise<{ root: ForumPost | null; replies: ForumPost[] }> => {
      const q = `
        query Thread($rootUID: String!, $schemaId: String!) {
          root: attestation(where: { id: $rootUID }) { ${FIELDS} }
          replies: attestations(
            where: {
              schemaId: { equals: $schemaId }
              refUID: { equals: $rootUID }
              revocationTime: { equals: 0 }
            }
            orderBy: { time: asc }
            take: 500
          ) { ${FIELDS} }
        }`;
      const d = await gql<{ root: RawAttestation | null; replies: RawAttestation[] }>(q, {
        rootUID,
        schemaId: SCHEMA_UID,
      });
      return {
        root: d.root ? toPost(d.root) : null,
        replies: (d.replies ?? []).map(toPost),
      };
    },
  });
}

/** Whether the forum schema is live on Base yet (gates the very first post). */
export function useSchemaRegistered() {
  return useQuery({
    queryKey: ["forum-schema-registered"],
    staleTime: 5 * 60_000,
    queryFn: isSchemaRegistered,
  });
}
