import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/capital-sync.js";
import {
  buildHolderSnapshot,
  hydrateHolderState,
  setOverviewSupply,
  syncHolders,
} from "../../api/capital-sync.js";

const originalEnv = { ...process.env };
describe("capital holder sync", () => {
  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    mock.restoreAll();
  });

  it("rejects disabled and unauthenticated maintenance requests before any I/O", async () => {
    const fetchSpy = mock.fn(() => { throw new Error('No network allowed'); });
    mock.method(globalThis, 'fetch', fetchSpy);
    for (const [secret, authorization, expected] of [[undefined, '', 503], ['test-secret', '', 401], ['test-secret', 'Bearer wrong-secret', 401]] as const) {
      if (secret) process.env.CAPITAL_SYNC_TOKEN = secret;
      else delete process.env.CAPITAL_SYNC_TOKEN;
      let status = 0;
      const res = { setHeader() {}, status(code: number) { status = code; return this; }, json() {} };
      await handler({ method: 'POST', headers: { authorization }, body: {} }, res);
      assert.equal(status, expected);
    }
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("resumes an unfinished page-key checkpoint before starting a fresh range", async () => {
    const fetchSpy = mock.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "alchemy_getAssetTransfers") {
        const params = body.params[0];
        if (params.pageKey === "page-1") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: "capital-holder-sync",
            result: {
              transfers: [
                { from: "0x0000000000000000000000000000000000000000", to: "0x1111111111111111111111111111111111111111", value: "1", blockNum: "0x10" },
              ],
              pageKey: "page-2",
            },
          }), { status: 200 });
        }
        if (params.pageKey === "page-2") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: "capital-holder-sync",
            result: {
              transfers: [
                { from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: "1", blockNum: "0x11" },
              ],
            },
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: "capital-holder-sync",
          result: { transfers: [], pageKey: null },
        }), { status: 200 });
      }
      if (Array.isArray(body) && body[0] === "GET") {
        return new Response(JSON.stringify({
          result: JSON.stringify({
            holders: {},
            checkpoint: {
              fromBlock: "0x10",
              pageKey: "page-1",
              pageKeyUpdatedAt: Date.now(),
              lastBlock: 15,
            },
            updatedAt: 100,
          }),
        }), { status: 200 });
      }
      if (Array.isArray(body) && body[0] === "SET") {
        return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
      }
      throw new Error("unexpected fetch");
    });

    mock.method(globalThis, "fetch", fetchSpy);
    process.env.KV_REST_API_URL = "https://kv.example.test";
    process.env.KV_REST_API_TOKEN = "token";
    process.env.ALCHEMY_API_KEY = "test-key";

    const result = await syncHolders({ contractAddress: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80" });

    assert.equal(result.holderCount, 1);
    assert.equal(result.fetched, 2);
    assert.equal(result.holders["0x2222222222222222222222222222222222222222"], 1);
    assert.equal(result.checkpoint.pageKey, null);
    assert.ok(fetchSpy.mock.callCount() > 0);
  });

  it("restarts from the finalized KV snapshot when a checkpoint page key is stale", async () => {
    const kvSets: Array<{ key: string; value: unknown }> = [];
    const fetchSpy = mock.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "alchemy_getAssetTransfers") {
        const params = body.params[0];
        assert.equal(params.pageKey, undefined);
        assert.equal(params.fromBlock, "0x10");
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: "capital-holder-sync",
          result: {
            transfers: [
              { from: "0x1111111111111111111111111111111111111111", to: "0x2222222222222222222222222222222222222222", value: "1", blockNum: "0x10" },
            ],
          },
        }), { status: 200 });
      }
      if (Array.isArray(body) && body[0] === "GET") {
        if (body[1] === "bittrees:capital:holders") {
          return new Response(JSON.stringify({
            result: JSON.stringify({
              holders: { "0x1111111111111111111111111111111111111111": 1 },
              checkpoint: {
                fromBlock: "0x10",
                pageKey: null,
                pageKeyUpdatedAt: 0,
                lastBlock: 15,
              },
              updatedAt: 100,
            }),
          }), { status: 200 });
        }

        return new Response(JSON.stringify({
          result: JSON.stringify({
            holders: {
              "0x1111111111111111111111111111111111111111": 1,
              "0x3333333333333333333333333333333333333333": 4,
            },
            checkpoint: {
              fromBlock: "0x08",
              pageKey: "stale-page",
              pageKeyUpdatedAt: Date.now() - (11 * 60 * 1000),
              lastBlock: 15,
            },
            updatedAt: 200,
          }),
        }), { status: 200 });
      }
      if (Array.isArray(body) && body[0] === "SET") {
        kvSets.push({ key: body[1], value: JSON.parse(body[2]) });
        return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
      }
      throw new Error("unexpected fetch");
    });

    mock.method(globalThis, "fetch", fetchSpy);
    process.env.KV_REST_API_URL = "https://kv.example.test";
    process.env.KV_REST_API_TOKEN = "token";
    process.env.ALCHEMY_API_KEY = "test-key";

    const result = await syncHolders({ contractAddress: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80" });

    assert.equal(result.holderCount, 1);
    assert.equal(result.holders["0x2222222222222222222222222222222222222222"], 1);
    assert.equal(result.holders["0x3333333333333333333333333333333333333333"], undefined);
    assert.equal((kvSets.filter((entry) => entry.key === "bittrees:capital:holders")).length, 1);
  });

  it("keeps overview supply separate from the holder snapshot", async () => {
    const holderSnapshot = buildHolderSnapshot(hydrateHolderState({
      holders: { "0x1111111111111111111111111111111111111111": 7 },
      checkpoint: { fromBlock: "0x20", pageKey: null, lastBlock: 32 },
      updatedAt: 123,
    }));

    assert.equal("supply" in holderSnapshot, false);
    assert.equal(holderSnapshot.holderCount, 1);

    const fetchSpy = mock.fn(async () => new Response(JSON.stringify({ result: "OK" }), { status: 200 }));
    mock.method(globalThis, "fetch", fetchSpy);
    process.env.KV_REST_API_URL = "https://kv.example.test";
    process.env.KV_REST_API_TOKEN = "token";

    const supply = await setOverviewSupply({ supply: "12345", updatedAt: 999 });
    assert.deepEqual(supply, { supply: "12345", updatedAt: 999 });
  });
});
