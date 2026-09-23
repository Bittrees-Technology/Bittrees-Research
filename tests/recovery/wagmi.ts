import { useSyncExternalStore } from 'react';
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
let address: string | undefined = account.address;
const listeners = new Set<() => void>();
const wallet = { getAddresses: async () => address ? [address] : [], getChainId: async () => 1,
  signMessage: async ({ message }: { message: string }) => {
    if ((window as any).rejectProof) throw new Error('Proof rejected');
    if ((window as any).delayProof) await new Promise(resolve => { (window as any).finishProof = resolve; });
    if ((window as any).contractProof) return '0x0102';
    return account.signMessage({ message });
  } };
(window as any).testWallet = account.address;
(window as any).disconnect = () => { address = undefined; listeners.forEach(f => f()); };
export function useAccount() {
  const value = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => address);
  return { address: value, chainId: 1 };
}
export function useWalletClient() { return { data: wallet }; }
const verifier = { chain: { id: 1 }, verifyMessage: async () => { (window as any).contractVerificationCalled = true; return !!(window as any).contractProof; } };
export function usePublicClient() { return verifier; }
