import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHolderSnapshot,
  hydrateHolderState,
  setOverviewSupply,
  syncHolders,
} from "./capital-sync.js";

describe("capital holder sync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("resumes an unfinished page-key checkpoint before starting a fresh range", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
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

    vi.stubGlobal("fetch", fetchSpy);
    process.env.KV_REST_API_URL = "https://kv.example.test";
    process.env.KV_REST_API_TOKEN = "token";
    process.env.ALCHEMY_API_KEY = "test-key";

    const result = await syncHolders({ contractAddress: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80" });

    expect(result.holderCount).toBe(1);
    expect(result.fetched).toBe(2);
    expect(result.holders["0x2222222222222222222222222222222222222222"]).toBe(1);
    expect(result.checkpoint.pageKey).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("restarts from the finalized KV snapshot when a checkpoint page key is stale", async () => {
    const kvSets: Array<{ key: string; value: unknown }> = [];
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "alchemy_getAssetTransfers") {
        const params = body.params[0];
        expect(params.pageKey).toBeUndefined();
        expect(params.fromBlock).toBe("0x10");
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

    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    vi.stubEnv("ALCHEMY_API_KEY", "test-key");

    const result = await syncHolders({ contractAddress: "0xf1AAfFc982B5F553a730a9eC134715a547f1fe80" });

    expect(result.holderCount).toBe(1);
    expect(result.holders["0x2222222222222222222222222222222222222222"]).toBe(1);
    expect(result.holders["0x3333333333333333333333333333333333333333"]).toBeUndefined();
    expect(kvSets.filter((entry) => entry.key === "bittrees:capital:holders")).toHaveLength(1);
  });

  it("keeps overview supply separate from the holder snapshot", async () => {
    const holderSnapshot = buildHolderSnapshot(hydrateHolderState({
      holders: { "0x1111111111111111111111111111111111111111": 7 },
      checkpoint: { fromBlock: "0x20", pageKey: null, lastBlock: 32 },
      updatedAt: 123,
    }));

    expect(holderSnapshot).not.toHaveProperty("supply");
    expect(holderSnapshot.holderCount).toBe(1);

    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ result: "OK" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("KV_REST_API_URL", "https://kv.example.test");
    vi.stubEnv("KV_REST_API_TOKEN", "token");

    const supply = await setOverviewSupply({ supply: "12345", updatedAt: 999 });
    expect(supply).toEqual({ supply: "12345", updatedAt: 999 });
  });
});
