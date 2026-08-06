import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetStoredSnapshotForTests,
  getStoredSnapshot,
  refreshStoredSnapshot,
  setStoredSnapshot,
  useIsAdmin,
  useVotingPowerNow,
  useVotingPowers,
} from "./snapshot";

describe("server-owned snapshot store", () => {
  afterEach(() => {
    __resetStoredSnapshotForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent refresh work and stores the result once", async () => {
    let resolveLoader: ((value: { votingPowers: Record<string, number>; admins: Record<string, boolean>; updatedAt: number }) => void) | undefined;
    const loader = vi.fn(
      () =>
        new Promise<{ votingPowers: Record<string, number>; admins: Record<string, boolean>; updatedAt: number }>((resolve) => {
          resolveLoader = resolve;
        })
    );

    const first = refreshStoredSnapshot(loader);
    const second = refreshStoredSnapshot(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);

    resolveLoader?.({
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });

    await expect(first).resolves.toEqual({
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });
    expect(getStoredSnapshot()).toEqual({
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });
  });

  it("public reads use the stored snapshot without triggering refresh I/O", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("public snapshot reads must not call fetch");
    });
    vi.stubGlobal("fetch", fetchSpy);

    setStoredSnapshot({
      votingPowers: { "0x0000000000000000000000000000000000000001": 3 },
      admins: { "0x0000000000000000000000000000000000000001": true },
      updatedAt: 456,
    });

    expect(getStoredSnapshot()).toEqual({
      votingPowers: { "0x0000000000000000000000000000000000000001": 3 },
      admins: { "0x0000000000000000000000000000000000000001": true },
      updatedAt: 456,
    });
    expect(useVotingPowerNow("0x0000000000000000000000000000000000000001")).toEqual({
      data: 3,
      isLoading: false,
    });
    expect(useVotingPowers(["0x0000000000000000000000000000000000000001"])).toEqual({
      data: { "0x0000000000000000000000000000000000000001": 3 },
      isLoading: false,
    });
    expect(useIsAdmin("0x0000000000000000000000000000000000000001")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
