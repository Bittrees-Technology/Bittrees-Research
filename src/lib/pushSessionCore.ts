/** Session-scoped facade: raw SDK clients/keys never escape through this API. */
export type PushSessionStatus = 'idle' | 'enabling' | 'ready' | 'error';
export interface GuardedPushClient {
  assertCurrent(): void;
  chat: {
    history(...args: unknown[]): Promise<any>;
    list(...args: unknown[]): Promise<any>;
    send(...args: unknown[]): Promise<any>;
    group: Record<'join' | 'leave' | 'create' | 'info' | 'add' | 'remove', (...args: unknown[]) => Promise<any>>;
  };
}
export interface PushSessionSnapshot {
  scope: string | null;
  revision: number;
  status: PushSessionStatus;
  client: GuardedPushClient | null;
  error?: string;
}
export class PushSessionChangedError extends Error {
  constructor() { super('Wallet session changed. Re-enable rooms. An action already sent to Push may have completed; check history or membership before retrying.'); }
}

/** readScope must reflect the live wallet store, not a captured React render. */
export function createPushSessions<Raw>(readScope: () => string | null, invoke: (raw: Raw, path: string[], args: unknown[]) => Promise<unknown>) {
  let snapshot: PushSessionSnapshot = { scope: readScope(), revision: 0, status: 'idle', client: null };
  let epoch = 0;
  let slot: { raw: Raw | null } | null = null;
  let pending: Promise<GuardedPushClient> | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: Omit<PushSessionSnapshot, 'revision'>) => { snapshot = { ...next, revision: epoch }; listeners.forEach(listener => listener()); };
  function invalidate() {
    epoch++; if (slot) slot.raw = null; slot = null; pending = null;
    publish({ scope: readScope(), status: 'idle', client: null });
  }
  function observe() { if (readScope() !== snapshot.scope) invalidate(); }
  function enable(initialize: (ensureCurrent: () => void) => Promise<Raw>): Promise<GuardedPushClient> {
    observe();
    const scope = readScope();
    if (!scope) return Promise.reject(new PushSessionChangedError());
    if (snapshot.client) return Promise.resolve(snapshot.client);
    if (pending) return pending;
    const revision = epoch;
    const ensureCurrent = () => {
      if (revision !== epoch || readScope() !== scope) throw new PushSessionChangedError();
    };
    const operation = Promise.resolve().then(async () => {
      ensureCurrent();
      const raw = await initialize(ensureCurrent);
      ensureCurrent();
      const owned = { raw: raw as Raw | null }; slot = owned;
      const call = (path: string[]) => async (...args: unknown[]) => {
        ensureCurrent();
        if (owned.raw === null) throw new PushSessionChangedError();
        // Cannot cancel a request the SDK has already sent. Reject late results and
        // prevent subsequent actions; never automatically retry an uncertain write.
        try {
          const result = await invoke(owned.raw, path, args);
          ensureCurrent(); return result;
        } catch (error) { ensureCurrent(); throw error; }
      };
      const client: GuardedPushClient = { assertCurrent: ensureCurrent, chat: {
        history: call(['chat', 'history']), list: call(['chat', 'list']), send: call(['chat', 'send']),
        group: { join: call(['chat', 'group', 'join']), leave: call(['chat', 'group', 'leave']),
          create: call(['chat', 'group', 'create']), info: call(['chat', 'group', 'info']),
          add: call(['chat', 'group', 'add']), remove: call(['chat', 'group', 'remove']) },
      } };
      ensureCurrent(); publish({ scope, status: 'ready', client }); return client;
    }).catch(error => {
      if (revision === epoch && readScope() === scope) publish({ scope, status: 'error', client: null,
        error: error instanceof Error ? error.message : 'Rooms could not be enabled. Try again with your wallet.' });
      throw error;
    }).finally(() => { if (pending === operation) pending = null; });
    pending = operation; publish({ scope, status: 'enabling', client: null }); return operation;
  }
  return { enable, observe, invalidate, getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
