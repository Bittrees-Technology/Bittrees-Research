# Research membership verification

The member layout uses fresh network evidence for the connected wallet. Alchemy discovers candidate token IDs; it does not establish access. Mainnet contract reads at one block must successfully confirm a positive wallet balance, a boolean `isExpired` result and a valid expiration timestamp. Missing, reverted, malformed or partial results fail verification. Transferred tokens, expired timestamps (including zero), and tokens marked expired cannot grant access.

The verification query never reads localStorage or the older NFT/status display caches. Those existing records are left intact. Each account, chain, connector and disconnect/reconnect transition starts a different session; late replies cannot populate current access. The unused older expiration-only hook was removed after checking that it had no callers.

Checks have a 15-second overall deadline, bounded pagination (10 pages/1,000 unique tokens), and no automatic request retries. Requests use an 8-second transport timeout. Cancellation/deadlines reject late SDK results even if an underlying transport cannot be stopped. A successful result refreshes every 30 seconds and stops granting access after 60 seconds without successful revalidation; token expiry is also checked every second. A failed refresh removes access immediately. This is a bounded freshness window, not an instantaneous transfer/revocation notification guarantee.

An outage displays a retry action rather than a purchase prompt or endless loading. Mounting the gate does not restart failed verification. Wallet-owned local recovery remains independently available at `/chat-recovery`. No stored contacts, notes, recovery material or room memberships are deleted by these checks.

A mint receipt is observed on Ethereum mainnet and requests verification once per transaction hash. It does not grant membership by itself. Mint UI instances are scoped to the wallet session, and the old unscoped `justJoined` bypass is removed. Indexer lag after a confirmed transaction can delay admission until a later successful check.

This is a frontend membership boundary. Server authority, controller policies and protocol room admission remain independently enforced; this change does not grant roles, activate a controller policy, mint a membership or prove genuine member-room acceptance.

Coverage includes pure validation/deadline/session tests, the real Layout/Gate/Mint components with synthetic receipt outcomes, and the built application with its actual Alchemy/viem clients against intercepted read-only responses. Browser cases cover valid evidence, empty/failed/partial/expired/transferred data, repeated pagination, forged persisted caches, timeout/retry, current-wallet transitions and delayed old-wallet results. No genuine wallet or blockchain transaction is used.

For deployed synthetic acceptance, set `RESEARCH_RECOVERY_LIVE=1` and `RESEARCH_MEMBERSHIP_RPC_ORIGIN` to the exact observed HTTPS origin used by that deployment's mainnet reader (for example, `https://eth-mainnet.g.alchemy.com`). The default local build uses `https://eth.merkle.io`. Supply only the origin, never an API-key path. The fixture intercepts reads locally and blocks unrelated requests and all wallet writes; it does not query or mutate real member data. A mismatched origin must fail positive verification assertions rather than silently skipping them.

## Confirmed purchases awaiting verification

A successful receipt from this session's submitted mint records an in-memory transaction notice before requesting fresh membership verification. The notice is independent of the purchase form, so loading, empty discovery results, verification errors and navigation to local recovery cannot reopen that form. It provides an Ethereum transaction link and an explicit retry action; it never establishes member access.

The notice captures the wallet/chain/connector session at submission and is discarded on session changes, including disconnect/reconnect. It is not persisted across a page reload. Reverted or unsolicited receipts cannot create the notice. Cancelled or replaced transactions require explicit review before reopening purchase options; a recognized repricing records its confirmed replacement hash. Once fresh verified evidence includes a newly discovered active token or an extended expiry compared with the pre-purchase evidence, the notice clears. A renewal's unchanged older membership alone does not dismiss it. Normal member access continues to use the independent ownership/expiry verifier.

Additional tests cover the receipt store, the actual gate/purchase/wait components, and the built application's real Wagmi receipt and Alchemy/viem verification flow. The synthetic provider accepts only one precisely scoped test transaction shape and returns a fake hash; all chain responses are intercepted. No genuine signature, transaction, membership purchase or authority grant is made.
