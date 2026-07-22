export interface SnapshotState {
  votingPowers: Record<string, number>;
  admins: Record<string, boolean>;
  updatedAt: number | null;
}

export interface SnapshotRefreshResult {
  votingPowers?: Record<string, number>;
  admins?: Record<string, boolean>;
  updatedAt?: number | null;
}

export type SnapshotLoader = () => Promise<SnapshotRefreshResult>;

const EMPTY_SNAPSHOT: SnapshotState = {
  votingPowers: {},
  admins: {},
  updatedAt: null,
};

let snapshot: SnapshotState = { ...EMPTY_SNAPSHOT };
let inFlightRefresh: Promise<SnapshotState> | null = null;

function normalizeAddress(address?: string): string | null {
  if (!address) return null;
  const trimmed = String(address).trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function cloneSnapshotState(state: SnapshotState): SnapshotState {
  return {
    votingPowers: { ...state.votingPowers },
    admins: { ...state.admins },
    updatedAt: state.updatedAt,
  };
}

function mergeSnapshot(result: SnapshotRefreshResult): SnapshotState {
  snapshot = {
    votingPowers: { ...(result.votingPowers ?? {}) },
    admins: { ...(result.admins ?? {}) },
    updatedAt: result.updatedAt ?? Date.now(),
  };
  return cloneSnapshotState(snapshot);
}

export function getStoredSnapshot(): SnapshotState {
  return cloneSnapshotState(snapshot);
}

export function setStoredSnapshot(next: SnapshotRefreshResult): SnapshotState {
  return mergeSnapshot(next);
}

export function refreshStoredSnapshot(loader: SnapshotLoader): Promise<SnapshotState> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    const result = await loader();
    return mergeSnapshot(result);
  })();

  inFlightRefresh.finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

export function useVotingPowerNow(address?: string): { data: number; isLoading: boolean } {
  const normalized = normalizeAddress(address);
  return { data: normalized ? snapshot.votingPowers[normalized] ?? 0 : 0, isLoading: false };
}

export function useVotingPowers(addresses: string[]): { data: Record<string, number>; isLoading: boolean } {
  const data: Record<string, number> = {};
  for (const address of addresses) {
    const normalized = normalizeAddress(address);
    if (!normalized) continue;
    data[normalized] = snapshot.votingPowers[normalized] ?? 0;
  }
  return { data, isLoading: false };
}

export function useIsAdmin(address?: string): boolean {
  const normalized = normalizeAddress(address);
  return normalized ? snapshot.admins[normalized] === true : false;
}

export function __resetStoredSnapshotForTests(): void {
  snapshot = {
    votingPowers: {},
    admins: {},
    updatedAt: null,
  };
  inFlightRefresh = null;
}
