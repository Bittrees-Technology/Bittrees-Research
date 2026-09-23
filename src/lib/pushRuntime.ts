import { getAccount, watchAccount } from 'wagmi/actions';
import type { WalletClient } from 'viem';
import { wagmiConfig } from './wagmi';
import { createPushSessions, PushSessionChangedError } from './pushSessionCore';
import { guardPushWallet, retireRecoveredPushKey } from './pushSessionWallet';

export function pushWalletScope(): string | null {
  const account = getAccount(wagmiConfig);
  return account.status === 'connected' && account.address && account.chainId && account.connector?.uid
    ? `${account.address.toLowerCase()}:${account.chainId}:${account.connector.uid}` : null;
}
const walletChecks = new WeakMap<object, () => Promise<number>>();
export const pushSessions = createPushSessions<any>(pushWalletScope, async (raw, path, args) => {
  const revision = pushSessions.getSnapshot().revision;
  try {
    const check = walletChecks.get(raw);
    if (!check) throw new PushSessionChangedError();
    await check();
    let receiver = raw;
    for (const key of path.slice(0, -1)) receiver = receiver[key];
    const method = receiver[path[path.length - 1]];
    if (typeof method !== 'function') throw new Error('This Push operation is unavailable.');
    const result = await Reflect.apply(method, receiver, args);
    await check(); return result;
  } catch (error) {
    if (error instanceof PushSessionChangedError && pushSessions.getSnapshot().revision === revision) pushSessions.invalidate();
    throw error;
  }
});

/** Mounted at the app root, so leaving the messenger never leaves an unobserved session. */
export function watchPushSession() {
  pushSessions.observe();
  const stop = watchAccount(wagmiConfig, { onChange: () => pushSessions.observe() });
  return () => { stop(); pushSessions.invalidate(); };
}
export function initPush(wallet: WalletClient, owner: string) {
  const account = getAccount(wagmiConfig);
  if (account.address?.toLowerCase() !== owner.toLowerCase() || wallet.chain?.id !== account.chainId) return Promise.reject(new PushSessionChangedError());
  return pushSessions.enable(async ensureCurrent => {
    ensureCurrent();
    if (getAccount(wagmiConfig).address?.toLowerCase() !== owner.toLowerCase()) throw new PushSessionChangedError();
    const guarded = guardPushWallet(wallet, owner, ensureCurrent);
    await guarded.getChainId(); ensureCurrent();
    const { PushAPI, CONSTANTS } = await import('@pushprotocol/restapi');
    ensureCurrent();
    // Always recover through the connected signer. Never initialize from plaintext browser storage.
    const raw = await PushAPI.initialize(guarded as any, { env: CONSTANTS.ENV.PROD, autoUpgrade: false });
    ensureCurrent(); await guarded.getChainId(); ensureCurrent();
    if (raw.account.toLowerCase() !== owner.toLowerCase() || !raw.decryptedPgpPvtKey) throw new Error('Push did not recover this wallet’s room keys.');
    retireRecoveredPushKey(localStorage, owner, raw.decryptedPgpPvtKey);
    ensureCurrent(); walletChecks.set(raw, () => guarded.getChainId()); return raw;
  });
}
