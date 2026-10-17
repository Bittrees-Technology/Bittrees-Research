# Research membership v2 rollout

Ethereum mainnet membership: `0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335`.
Nested credentials: `0x335708826d76302E5014E6Ca41564482e38AA8B2`.
Runtime, proxy slots, admin owners, dual Safe authorities and initial configuration were verified at block 26209150 on 2026-10-17. The contract release evidence lives in the local `operations/research-membership-v2/release/live-verification.json` package.

Fresh ETH mints use the exact current mint price (initially zero), without the old additional-donation input. A fresh token lasts 360 days and does not stack with another token. BIT renewal approves only the displayed amount and calls `renewMembership(id, days, maxBitPayment)` on the same token. A price increase above the approved quote reverts. The displayed daily rate refreshes every 15 seconds. No ETH renewal exists; ETH still pays gas.

New membership reads directly enumerate IDs and verify balance, `isActiveMember`, expiry and revocation at one block, with a deadline and session invalidation. This avoids NFT indexer lag. The bounded reader supports up to 10,000 lifetime minted IDs; exceeding it fails closed and requires an indexing upgrade. Reads refresh every 30 seconds and expire after 60 seconds. A valid new membership does not depend on legacy NFT discovery.

Legacy membership at `0xc8121e650bd797d8b9dad00227a9a77ef603a84a` retains its existing expiry-based access; no balances or credentials are migrated. The new wallet block denies access across both versions. Legacy passes cannot use BIT renewal. The old any-ID Push room rule continues its original 0..255 legacy range, now checks expiry and accepts new active passes too. Explicit token-ID rules stay scoped to their own contract. Server gate RPC failure denies access.

The membership page displays nested credentials using parent enumeration and current on-chain validity. Metadata is an external HTTPS link only, never a source of permissions. Holder burns require an explicit permanent-destruction confirmation and wallet approval. This release does not add an administrative issuance console: both Safe administrators can continue using TLD and the deployed ABI for issuance/revocation/pricing.

Roles owns the explicit credential-to-permission mapping. Only `keccak256(UTF8("research.role.researcher.v1"))` is initially mapped to the existing Research researcher role. Membership, arbitrary metadata, or unknown credential types must not grant admin, reviewer, issuing or automation authority.
