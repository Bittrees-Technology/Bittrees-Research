# Research membership verification

The member layout uses fresh network evidence for the connected wallet. Alchemy discovers candidate token IDs; it does not establish access. Mainnet contract reads at one block must successfully confirm a positive wallet balance, a boolean `isExpired` result and a valid expiration timestamp. Missing, reverted, malformed or partial results fail verification. Transferred tokens, expired timestamps (including zero), and tokens marked expired cannot grant access.

The verification query never reads localStorage or the older NFT/status display caches. Those existing records are left intact. Each account, chain, connector and disconnect/reconnect transition starts a different session; late replies cannot populate current access. The unused older expiration-only hook was removed after checking that it had no callers.

Checks have a 15-second overall deadline, bounded pagination (10 pages/1,000 unique tokens), and no automatic request retries. Requests use an 8-second transport timeout. Cancellation/deadlines reject late SDK results even if an underlying transport cannot be stopped. A successful result refreshes every 30 seconds and stops granting access after 60 seconds without successful revalidation; token expiry is also checked every second. A failed refresh removes access immediately. This is a bounded freshness window, not an instantaneous transfer/revocation notification guarantee.

An outage displays a retry action rather than a purchase prompt or endless loading. Mounting the gate does not restart failed verification. Wallet-owned local recovery remains independently available at `/chat-recovery`. No stored contacts, notes, recovery material or room memberships are deleted by these checks.

A mint receipt is observed on Ethereum mainnet and requests verification once per transaction hash. It does not grant membership by itself. Mint UI instances are scoped to the wallet session, and the old unscoped `justJoined` bypass is removed. Indexer lag after a confirmed transaction can delay admission until a later successful check.

This is a frontend membership boundary. Server authority, controller policies and protocol room admission remain independently enforced; this change does not grant roles, activate a controller policy, mint a membership or prove genuine member-room acceptance.

Coverage includes pure validation/deadline/session tests, the real Layout/Gate/Mint components with synthetic receipt outcomes, and the built application with its actual Alchemy/viem clients against intercepted read-only responses. Browser cases cover valid evidence, empty/failed/partial/expired/transferred data, repeated pagination, forged persisted caches, timeout/retry, current-wallet transitions and delayed old-wallet results. No genuine wallet or blockchain transaction is used.
