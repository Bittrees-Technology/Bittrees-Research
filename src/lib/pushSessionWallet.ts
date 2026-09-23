import type { WalletClient } from 'viem';
import { PushSessionChangedError } from './pushSessionCore.ts';

const guards = new WeakMap<WalletClient, () => void>();
export function assertPushWalletCurrent(wallet: WalletClient) { guards.get(wallet)?.(); }

/** Preserve viem's one-argument signer methods: Push uses their arity to identify it. */
export function guardPushWallet(wallet: WalletClient, owner: string, ensureCurrent: () => void): WalletClient {
  const expected = owner.toLowerCase();
  const chain = wallet.chain?.id;
  ensureCurrent();
  if (!/^0x[0-9a-f]{40}$/.test(expected) || wallet.account?.address.toLowerCase() !== expected || !Number.isSafeInteger(chain)) throw new PushSessionChangedError();
  const check = async () => {
    ensureCurrent();
    const [addresses, actualChain] = await Promise.all([wallet.getAddresses(), wallet.getChainId()]);
    ensureCurrent();
    if (addresses[0]?.toLowerCase() !== expected || actualChain !== chain) throw new PushSessionChangedError();
  };
  const checkAccount = (account: unknown) => {
    if (account === undefined) return;
    const address = typeof account === 'string' ? account : (account as { address?: unknown } | null)?.address;
    if (typeof address !== 'string' || address.toLowerCase() !== expected) throw new PushSessionChangedError();
  };
  const recoveryProvider = { async request({ method, params }: { method: string; params?: unknown[] }) {
    const ownerIndex = method === 'eth_decrypt' ? 1 : 0;
    if (!['eth_decrypt', 'eth_getEncryptionPublicKey'].includes(method) || !Array.isArray(params)
      || params.length !== ownerIndex + 1 || typeof params[ownerIndex] !== 'string'
      || (params[ownerIndex] as string).toLowerCase() !== expected
      || (method === 'eth_decrypt' && (typeof params[0] !== 'string' || params[0].length > 512 * 1024))) {
      throw new Error('Unsupported Push key recovery request.');
    }
    await check(); ensureCurrent();
    const result = await wallet.request({ method, params } as any);
    await check(); return result;
  } };
  const guarded = {
    ...wallet,
    // Legacy SDK key recovery otherwise falls back to an unrelated injected wallet.
    provider: { provider: recoveryProvider },
    async signMessage(args) {
      checkAccount(args.account); await check(); ensureCurrent(); const signature = await wallet.signMessage(args); await check(); return signature;
    },
    async signTypedData(args) {
      checkAccount(args.account); await check(); ensureCurrent(); const signature = await wallet.signTypedData(args); await check(); return signature;
    },
    async getChainId() { await check(); return chain!; },
  } as WalletClient;
  guards.set(guarded, ensureCurrent); return guarded;
}

/** Retire only an exact legacy cache after the SDK independently recovers the same key.
 * A mismatch is preserved for recovery, never silently overwritten or exported. */
export function retireRecoveredPushKey(storage: Pick<Storage, 'getItem' | 'removeItem'>, owner: string, recoveredKey: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner) || typeof recoveredKey !== 'string' || !recoveredKey) throw new Error('Push did not recover a usable room key.');
  const key = `bittrees.push.pgp.${owner.toLowerCase()}`;
  const old = storage.getItem(key);
  if (old !== null && old !== recoveredKey) throw new Error('The saved room key differs from the recovered key. The original is preserved; resolve key recovery before enabling rooms.');
  if (old !== null) storage.removeItem(key);
}
