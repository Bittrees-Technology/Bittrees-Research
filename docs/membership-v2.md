# Research membership v2 rollout

Ethereum mainnet membership: `0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335`.
Nested credentials: `0x335708826d76302E5014E6Ca41564482e38AA8B2`.
Runtime, proxy slots, admin owners, dual Safe authorities and initial configuration were verified at block 26209150 on 2026-10-17. The contract release evidence lives in the local `operations/research-membership-v2/release/live-verification.json` package.

Fresh ETH mints use the exact current mint price (initially zero), without the old additional-donation input. A fresh token lasts 360 days and does not stack with another token. BIT renewal approves only the displayed amount and calls `renewMembership(id, days, maxBitPayment)` on the same token. A price increase above the approved quote reverts. The displayed daily rate refreshes every 15 seconds. No ETH renewal exists; ETH still pays gas.

New membership reads directly enumerate IDs and verify balance, `isActiveMember`, expiry and revocation at one block, with a deadline and session invalidation. This avoids NFT indexer lag. The bounded reader supports up to 10,000 lifetime minted IDs; exceeding it fails closed and requires an indexing upgrade. Reads refresh every 30 seconds and expire after 60 seconds. No legacy NFT discovery is performed.

Only the current membership grants access. Legacy tokens are disregarded; holders must mint a current membership. New room defaults use the current contract. Persisted any-ID room URLs naming the old contract now check only current-contract membership; explicit legacy token-ID rules deny access because IDs are not migrated. No balances or credentials are migrated, and old tokens remain on-chain. Server RPC failures deny access.

The membership page displays nested credentials using parent enumeration and current on-chain validity. Metadata is an external HTTPS link only, never a source of permissions. Holder burns require an explicit permanent-destruction confirmation and wallet approval. The administrative credential console prepares issuance and revocation for the existing Safe authorities; membership pricing remains managed through TLD and the deployed ABI.

Roles owns the explicit credential-to-permission mapping. Only `keccak256(UTF8("research.role.researcher.v1"))` is initially mapped to the existing Research researcher role. Membership, arbitrary metadata, or unknown credential types must not grant admin, reviewer, issuing or automation authority.

## Credential-backed role management

`/admin?tab=roles` exposes the Researcher credential flow to Research role administrators. It reads current child records and prepares `issueCredential` or `setCredentialRevoked` transactions for either existing authority Safe. The wallet must actively hold the selected parent for issuance/restoration. The reader verifies the pinned deployment, runtime hashes, proxy slots, upgrade ownership, authority addresses and contract links before preparation; simulation must succeed. A prepared transaction is not an assignment. Only the selected Safe can execute it, through TLD or an explicitly connected Safe. Downloaded transaction batches contain Ethereum CALL data and zero ETH value; Safe signer/threshold approval remains required.

The initial supported type remains `research.role.researcher.v1`. A default public metadata document is served at `/credentials/researcher.json`; it contains no member data and grants no permissions. Other types are displayed as unmapped and have no automatic permission mapping.

Roles `/role-management?project=research` displays credential-derived assignments, parent IDs and current validity separately from independently approved grants. Its explicit refresh verifies chain state again. Research refreshes chain records and local role queries after a confirmed transaction; transactions executed through TLD can be picked up with Refresh credential status or the 30-second read interval. Roles evaluates current credential and parent validity when deciding access, without writing a persistent duplicate grant. A revoked/burned/expired credential therefore loses only its own eligibility; an independently approved grant may still provide access. Policy suspensions remain authoritative. A pending transaction or transaction hash never proves a role.
