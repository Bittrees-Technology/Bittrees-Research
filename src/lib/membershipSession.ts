import { getAccount, watchAccount } from 'wagmi/actions';
import { wagmiConfig } from './wagmi';
import { createMembershipMintReceipts } from './membershipMintReceipt';
import { createMembershipSession } from './membershipVerification';
export function membershipScope() {
  const account = getAccount(wagmiConfig);
  return account.status === 'connected' && account.address && account.chainId && account.connector?.uid
    ? `${account.address.toLowerCase()}:${account.chainId}:${account.connector.uid}` : null;
}
export const membershipSession = createMembershipSession(membershipScope);
export const membershipMintReceipts = createMembershipMintReceipts(() => {
  const session = membershipSession.getSnapshot();
  return session.scope === membershipScope() ? session : { scope: null, revision: session.revision };
});
membershipSession.subscribe(() => membershipMintReceipts.observe());
export function watchMembershipSession() {
  membershipSession.observe();
  const stop = watchAccount(wagmiConfig, { onChange: () => membershipSession.observe() });
  return () => { stop(); membershipSession.invalidate(); };
}
