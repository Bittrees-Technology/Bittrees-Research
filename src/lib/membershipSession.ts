import { getAccount, watchAccount } from 'wagmi/actions';
import { wagmiConfig } from './wagmi';
import { createMembershipSession } from './membershipVerification';
export function membershipScope() {
  const account = getAccount(wagmiConfig);
  return account.status === 'connected' && account.address && account.chainId && account.connector?.uid
    ? `${account.address.toLowerCase()}:${account.chainId}:${account.connector.uid}` : null;
}
export const membershipSession = createMembershipSession(membershipScope);
export function watchMembershipSession() {
  membershipSession.observe();
  const stop = watchAccount(wagmiConfig, { onChange: () => membershipSession.observe() });
  return () => { stop(); membershipSession.invalidate(); };
}
