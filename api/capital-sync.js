export const HOLDERS_KEY = "bittrees:capital:holders";
export const HOLDERS_SYNC_KEY = "bittrees:capital:holdersync";
export const OVERVIEW_SUPPLY_KEY = "bittrees:capital:overview-supply";
export const DEFAULT_CONTRACTS = {
  bnote: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80",
  bit: "0x57A447E4d5e18A9423408C365963A73F08B9d18C",
};

const PAGE_LIMIT = 1000;
const RESUME_WINDOW_MS = 10 * 60 * 1000;

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function normalizeAddress(value) {
  return String(value || "").toLowerCase();
}

function getAlchemyUrl() {
  const direct = process.env.ALCHEMY_URL || process.env.ALCHEMY_MAINNET_URL;
  if (direct) return direct;
  if (process.env.ALCHEMY_API_KEY) {
    return `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  }
  return "";
}

function getKvConfig() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

async function kvCommand(cmd) {
  const { url, token } = getKvConfig();
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`KV HTTP ${r.status}`);
  return r.json();
}

async function readJson(key, fallback) {
  const { url, token } = getKvConfig();
  if (!url || !token) return fallback;
  try {
    const j = await kvCommand(["GET", key]);
    return j?.result ? JSON.parse(j.result) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key, value) {
  const { url, token } = getKvConfig();
  if (!url || !token) return;
  await kvCommand(["SET", key, JSON.stringify(value)]);
}

function emptyState() {
  return {
    holders: {},
    checkpoint: {
      fromBlock: "0x0",
      pageKey: null,
      pageKeyUpdatedAt: 0,
      lastBlock: 0,
      updatedAt: 0,
    },
    updatedAt: 0,
  };
}

function asHexBlock(value) {
  if (value === "latest" || value === "pending" || value === "earliest") return value;
  if (typeof value === "string" && value.startsWith("0x")) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "0x0";
  return `0x${Math.trunc(n).toString(16)}`;
}

function toBlockNumber(value) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.startsWith("0x")) return Number.parseInt(value, 16);
  return Number(value || 0);
}

function applyTransfer(state, transfer) {
  const from = normalizeAddress(transfer.from);
  const to = normalizeAddress(transfer.to);
  const rawValue = Number(transfer.value ?? transfer.rawContract?.value ?? 0);
  const amount = Number.isFinite(rawValue) ? rawValue : 0;

  if (from && isAddress(from)) {
    const next = Math.max(0, Number(state.holders[from] || 0) - amount);
    if (next > 0) state.holders[from] = next;
    else delete state.holders[from];
  }
  if (to && isAddress(to)) {
    state.holders[to] = Number(state.holders[to] || 0) + amount;
  }

  const blockNumber = toBlockNumber(transfer.blockNum ?? transfer.blockNumber ?? 0);
  if (Number.isFinite(blockNumber) && blockNumber > (state.checkpoint.lastBlock || 0)) {
    state.checkpoint.lastBlock = blockNumber;
  }
}

function mergeTransfers(state, transfers) {
  for (const transfer of transfers || []) {
    applyTransfer(state, transfer);
  }
  return state;
}

function makeRequestParams({ contractAddress, fromBlock, toBlock, pageKey }) {
  const params = {
    fromBlock: asHexBlock(fromBlock),
    toBlock: asHexBlock(toBlock),
    contractAddresses: [contractAddress],
    category: ["erc20", "erc721", "erc1155", "external", "internal"],
    excludeZeroValue: false,
    maxCount: `0x${PAGE_LIMIT.toString(16)}`,
    withMetadata: false,
  };
  if (pageKey) params.pageKey = pageKey;
  return params;
}

async function fetchTransfers({ contractAddress, fromBlock, toBlock, pageKey }) {
  const alchemyUrl = getAlchemyUrl();
  if (!alchemyUrl) throw new Error("alchemy not configured");
  const r = await fetch(alchemyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "capital-holder-sync",
      method: "alchemy_getAssetTransfers",
      params: [makeRequestParams({ contractAddress, fromBlock, toBlock, pageKey })],
    }),
  });
  if (!r.ok) throw new Error(`Alchemy HTTP ${r.status}`);
  const j = await r.json();
  if (j?.error) throw new Error(j.error.message || "alchemy error");
  return j?.result || { transfers: [], pageKey: null };
}

function nextCheckpoint(prev, result, sourceToBlock) {
  const next = {
    ...prev,
    updatedAt: Date.now(),
    lastBlock: Math.max(prev.lastBlock || 0, result.lastBlock || 0),
  };
  if (result.pageKey) {
    next.pageKey = result.pageKey;
    next.pageKeyUpdatedAt = Date.now();
    next.fromBlock = prev.fromBlock || "0x0";
    next.toBlock = sourceToBlock;
    return next;
  }
  next.pageKey = null;
  next.pageKeyUpdatedAt = 0;
  next.fromBlock = asHexBlock((next.lastBlock || 0) + 1);
  next.toBlock = sourceToBlock;
  return next;
}

function shouldResumePageKey(checkpoint) {
  if (!checkpoint?.pageKey) return false;
  return Date.now() - Number(checkpoint.pageKeyUpdatedAt || 0) <= RESUME_WINDOW_MS;
}

async function loadSyncState(fromBlock) {
  const finalized = hydrateHolderState(await readJson(HOLDERS_KEY, null));
  const checkpointed = hydrateHolderState(await readJson(HOLDERS_SYNC_KEY, null));

  if (shouldResumePageKey(checkpointed.checkpoint)) {
    return {
      state: checkpointed,
      cursor: {
        fromBlock: checkpointed.checkpoint.fromBlock || fromBlock || "0x0",
        pageKey: checkpointed.checkpoint.pageKey,
      },
    };
  }

  const resumedFromBlock = fromBlock
    ?? finalized.checkpoint.fromBlock
    ?? asHexBlock((finalized.checkpoint.lastBlock || 0) + 1);

  return {
    state: finalized,
    cursor: {
      fromBlock: resumedFromBlock,
      pageKey: null,
    },
  };
}

export function hydrateHolderState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  return {
    holders: raw.holders && typeof raw.holders === "object" ? raw.holders : {},
    checkpoint: raw.checkpoint && typeof raw.checkpoint === "object" ? { ...base.checkpoint, ...raw.checkpoint } : base.checkpoint,
    updatedAt: Number(raw.updatedAt || 0),
  };
}

export function buildHolderSnapshot(state) {
  return {
    holders: state.holders,
    checkpoint: state.checkpoint,
    updatedAt: state.updatedAt,
    holderCount: Object.keys(state.holders).length,
  };
}

export async function syncHolders({ contractAddress, fromBlock, toBlock } = {}) {
  const target = contractAddress || DEFAULT_CONTRACTS.bnote;
  const resolvedToBlock = toBlock ?? "latest";
  const loaded = await loadSyncState(fromBlock);
  const state = loaded.state;
  let cursor = loaded.cursor;
  let fetched = 0;
  let latestBlock = state.checkpoint.lastBlock || 0;

  for (;;) {
    const result = await fetchTransfers({
      contractAddress: target,
      fromBlock: cursor.fromBlock,
      toBlock: resolvedToBlock,
      pageKey: cursor.pageKey,
    });
    const transfers = result.transfers || [];
    fetched += transfers.length;
    mergeTransfers(state, transfers);
    latestBlock = Math.max(latestBlock, ...transfers.map((t) => toBlockNumber(t.blockNum ?? t.blockNumber ?? 0)));
    if (!result.pageKey) {
      state.checkpoint = nextCheckpoint({ ...state.checkpoint, lastBlock: latestBlock }, { lastBlock: latestBlock, pageKey: null }, resolvedToBlock);
      break;
    }
    state.checkpoint = nextCheckpoint({ ...state.checkpoint, lastBlock: latestBlock }, { lastBlock: latestBlock, pageKey: result.pageKey }, resolvedToBlock);
    await writeJson(HOLDERS_SYNC_KEY, state);
    cursor = { fromBlock: state.checkpoint.fromBlock, pageKey: state.checkpoint.pageKey };
  }

  state.updatedAt = Date.now();
  await writeJson(HOLDERS_SYNC_KEY, state);
  const snapshot = buildHolderSnapshot(state);
  await writeJson(HOLDERS_KEY, snapshot);
  return { ...snapshot, fetched };
}

export async function getOverviewSupply() {
  const cached = await readJson(OVERVIEW_SUPPLY_KEY, null);
  if (cached) return cached;
  const value = { supply: null, updatedAt: 0 };
  await writeJson(OVERVIEW_SUPPLY_KEY, value);
  return value;
}

export async function setOverviewSupply(payload) {
  const next = {
    supply: payload?.supply ?? null,
    updatedAt: payload?.updatedAt ?? Date.now(),
  };
  await writeJson(OVERVIEW_SUPPLY_KEY, next);
  return next;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    const data = await readJson(HOLDERS_KEY, buildHolderSnapshot(emptyState()));
    res.status(200).json(data);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { url, token } = getKvConfig();
  if (!url || !token) {
    res.status(503).json({ error: "holder sync storage not configured" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const result = await syncHolders({
      contractAddress: body.contractAddress,
      fromBlock: body.fromBlock,
      toBlock: body.toBlock,
    });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
}
