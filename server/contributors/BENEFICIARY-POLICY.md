# Monthly BTREE beneficiary eligibility

A current, Active, in-term contributor credential establishes monthly BTREE beneficiary eligibility. The contract exposes `isMonthlyBtreeBeneficiary(tokenId)`, and its metadata derives the eligibility trait from the same predicate. No separate manual beneficiary grant is required.

Signed memorandum policy v4 explicitly acknowledges this entitlement, the relative contribution weight, and the separation between eligibility and payment calculation. Legacy acknowledgments cannot authorize issuance under the new memo policy.

Monthly confirmation requires a fresh on-chain eligibility check and records the contract, token, block, check time and policy. Amounts remain null and allocation status remains blocked pending an approved funded distribution policy. A prior validation is historical evidence, not ongoing eligibility or a payment instruction; any future distribution executor must recheck eligibility at its approved snapshot and prevent duplicate claims across projects. No token reissue, claim allocation, supply or transfer is activated.

Roles receives a signed projection of current eligibility; missing or stale source data is not proof of eligibility. Partner authority remains separately governed.

Artwork is rendered publicly by Gov from the configured, code-hash-verified contract. It embeds the unchanged original PNG, derives traits and wallet from chain, and displays a reverse ENS name only if forward resolution matches that owner. No application fields, private notes or emails are exposed. Artwork availability depends on Gov; indexers may cache images. The contract includes owner wallet and eligibility traits directly in its on-chain JSON metadata.

Release requires a new non-upgradeable contract deployment, coordinated Gov/Research/Roles configuration, a fresh memorandum acknowledgment, and issuance. Existing deployments are not modified. The earlier prepared bootstrap must first expire and be safely archived through the existing recovery control.
