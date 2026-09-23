import { useSyncExternalStore } from 'react';
export const wagmiConfig = {};
const a = `0x${'a'.repeat(40)}`; const b = `0x${'b'.repeat(40)}`;
let state = { address: a as string | undefined, chainId: 1, connector: { uid: 'connector-1' }, status: 'connected' };
let providerAddress: string | undefined = a;
const watchers = new Set<() => void>();
function wallet() {
  return { account: { address: state.address }, chain: { id: state.chainId },
    getAddresses: async () => providerAddress ? [providerAddress] : [], getChainId: async () => state.chainId,
    async request({ method }: { method: string }) {
      ((window as any).recoveryCalls ??= []).push(method);
      if ((window as any).delayRecovery) await new Promise(resolve => { (window as any).finishRecovery = resolve; });
      return 'synthetic-key';
    },
    async signMessage(_args: unknown) {
      if ((window as any).delaySignature) await new Promise(resolve => { (window as any).finishSignature = resolve; });
      return '0x01';
    }, async signTypedData(_args: unknown) { return '0x02'; } };
}
let client = wallet();
function change(next: typeof state) { state = next; providerAddress = next.address; client = wallet(); watchers.forEach(w => w()); }
(window as any).walletA = a;
(window as any).silentProviderSwitch = () => { providerAddress = b; };
(window as any).disconnectWallet = () => change({ ...state, address: undefined, status: 'disconnected' });
(window as any).connectA = () => change({ ...state, address: a, status: 'connected' });
(window as any).switchWallet = () => change({ ...state, address: b, status: 'connected' });
(window as any).switchChain = () => change({ ...state, chainId: 8453 });
(window as any).switchConnector = () => change({ ...state, connector: { uid: 'connector-2' } });
export const getAccount = () => state;
export function watchAccount(_config: unknown, options: { onChange: () => void }) { watchers.add(options.onChange); return () => { watchers.delete(options.onChange); }; }
export function useAccount() { return useSyncExternalStore(cb => { watchers.add(cb); return () => { watchers.delete(cb); }; }, () => state); }
export function useWalletClient() { useAccount(); return { data: client }; }
