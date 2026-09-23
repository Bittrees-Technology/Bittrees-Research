import type { PendingMembershipMint } from '@/lib/membershipMintReceipt';

export function MembershipVerificationWait({ receipt, checking, error, onRetry }: {
  receipt: PendingMembershipMint; checking: boolean; error: Error | null; onRetry: () => void;
}) {
  return <section aria-labelledby="membership-verification-wait-title">
    <h2 id="membership-verification-wait-title" className="text-title">Transaction confirmed</h2>
    <p>Your transaction is confirmed on Ethereum. We still need to verify the membership details from this transaction.</p>
    <p>New membership details can take a little time to appear. You do not need to make another purchase while this check is pending.</p>
    <p><a href={`https://etherscan.io/tx/${receipt.hash}`} target="_blank" rel="noreferrer">View confirmed transaction</a></p>
    <p role={error ? 'alert' : 'status'} aria-live="polite">
      {checking ? 'Checking current ownership and expiry…' : error ? 'Verification is temporarily unavailable. Your confirmed transaction is still recorded here.' : 'Membership is not verified yet. Check again in a moment.'}
    </p>
    <button className="btn-primary" disabled={checking} onClick={onRetry}>{checking ? 'Checking membership…' : 'Check membership again'}</button>
  </section>;
}
