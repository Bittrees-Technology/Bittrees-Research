import { useSyncExternalStore } from 'react';
let state = { address: `0x${'1'.repeat(40)}`, verified: false, receipt: false, revision: 0, version: 0 };
const listeners = new Set<() => void>();
const set = (update: Partial<typeof state>) => { state = {...state, ...update, version: state.version + 1}; listeners.forEach(fn => fn()); };
(window as any).__membershipFixture = (change: string) => {
  if (change === 'receipt') set({ receipt:true });
  if (change === 'verified') set({ verified:true });
  if (change === 'switch') set({ address:`0x${'2'.repeat(40)}`, verified:false, receipt:false, revision:state.revision+1 });
  if (change === 'render') set({});
};
(window as any).__verificationRequests = 0;
function useState() { return useSyncExternalStore(fn => { listeners.add(fn); return () => {listeners.delete(fn)}; }, () => state); }
export function useAccount() { const s = useState(); return { address:s.address, isConnected:true, isConnecting:false }; }
export function useChainId() { return 1; }
export function useSwitchChain() { return { switchChain: () => {}, isPending:false }; }
export function useReadContract({functionName}: any) { return {data:functionName === 'mintPrice' ? 1n : 360n * 86400n}; }
export function useSimulateContract() { return {data:{request:{}},error:null}; }
export function useWriteContract() { const s=useState(); return {data:s.receipt ? `0x${'1'.repeat(64)}` : undefined,writeContract:()=>{},isPending:false}; }
export function useWaitForTransactionReceipt({chainId}: any) { if(chainId!==1) throw Error('Membership receipt must use mainnet'); return {isLoading:false,isSuccess:useState().receipt}; }
export function ConnectButton() { return <span>Synthetic connected wallet</span>; }
export function useMembershipStatus() {
 const s=useState();
 return {hasValidMembership:s.verified,isLoading:false,tokens:[],error:null,sessionRevision:s.revision,
  refetch:()=>{(window as any).__verificationRequests++;}};
}
