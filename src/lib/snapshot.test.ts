import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  __resetStoredSnapshotForTests,
  getStoredSnapshot,
  refreshStoredSnapshot,
  setStoredSnapshot,
  useIsAdmin,
  useVotingPowerNow,
  useVotingPowers,
} from "./snapshot.ts";

describe("server-owned snapshot store", () => {
  afterEach(() => {
    __resetStoredSnapshotForTests();
    mock.restoreAll();
  });

  it("a failed refresh can be retried without leaving an unhandled rejection", async () => {
    await assert.rejects(refreshStoredSnapshot(async () => { throw new Error('offline'); }));
    const result = await refreshStoredSnapshot(async () => ({ votingPowers: { '0xabc': 1 }, updatedAt: 1 }));
    assert.equal(result.votingPowers['0xabc'], 1);
  });

  it("deduplicates concurrent refresh work and stores the result once", async () => {
    let resolveLoader: ((value: { votingPowers: Record<string, number>; admins: Record<string, boolean>; updatedAt: number }) => void) | undefined;
    const loader = mock.fn(
      () =>
        new Promise<{ votingPowers: Record<string, number>; admins: Record<string, boolean>; updatedAt: number }>((resolve) => {
          resolveLoader = resolve;
        })
    );

    const first = refreshStoredSnapshot(loader);
    const second = refreshStoredSnapshot(loader);

    assert.equal(loader.mock.callCount(), 1);
    assert.equal(first, second);

    resolveLoader?.({
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });

    assert.deepEqual(await first, {
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });
    assert.deepEqual(getStoredSnapshot(), {
      votingPowers: { "0xabc": 7 },
      admins: { "0xabc": true },
      updatedAt: 123,
    });
  });

  it("public reads use the stored snapshot without triggering refresh I/O", () => {
    const fetchSpy = mock.fn(() => {
      throw new Error("public snapshot reads must not call fetch");
    });
    mock.method(globalThis, "fetch", fetchSpy);

    setStoredSnapshot({
      votingPowers: { "0x0000000000000000000000000000000000000001": 3 },
      admins: { "0x0000000000000000000000000000000000000001": true },
      updatedAt: 456,
    });

    assert.deepEqual(getStoredSnapshot(), {
      votingPowers: { "0x0000000000000000000000000000000000000001": 3 },
      admins: { "0x0000000000000000000000000000000000000001": true },
      updatedAt: 456,
    });
    assert.deepEqual(useVotingPowerNow("0x0000000000000000000000000000000000000001"), {
      data: 3,
      isLoading: false,
    });
    assert.deepEqual(useVotingPowers(["0x0000000000000000000000000000000000000001"]), {
      data: { "0x0000000000000000000000000000000000000001": 3 },
      isLoading: false,
    });
    assert.equal(useIsAdmin("0x0000000000000000000000000000000000000001"), true);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });
});
