import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { initPush, pushSessions, pushWalletScope } from './pushRuntime';
import { guardPushWallet } from './pushSessionWallet';

export function usePushSessionKey() {
  useAccount();
  const state = useSyncExternalStore(pushSessions.subscribe, pushSessions.getSnapshot);
  return `${pushWalletScope() ?? 'disconnected'}:${state.revision}`;
}
export function usePush() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const snapshot = useSyncExternalStore(pushSessions.subscribe, pushSessions.getSnapshot);
  const current = snapshot.scope === pushWalletScope();
  const client = current ? snapshot.client : null;
  const wallet = useMemo(() => {
    if (!client || !walletClient || !address) return undefined;
    try { return guardPushWallet(walletClient, address, client.assertCurrent); } catch { return undefined; }
  }, [client, walletClient, address]);
  const enable = useCallback(async () => {
    if (!walletClient || !address) return;
    try { await initPush(walletClient, address); } catch { /* Current-session error is published by the manager. */ }
  }, [walletClient, address]);
  return { status: current ? snapshot.status : 'idle', error: current ? snapshot.error : undefined, enable, client, wallet,
    sessionKey: `${snapshot.scope}:${snapshot.revision}` };
}
