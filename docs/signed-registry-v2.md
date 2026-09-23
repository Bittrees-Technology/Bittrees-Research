# Signed registry v2

Community and room writes now sign the entire canonical request, including audience, chain, endpoint, wallet, payload, nonce, five-minute validity window and expected registry revision. Reads return the revision. Old clients must reload; legacy write signatures are deliberately rejected.

The server reads a consistent Redis snapshot, verifies the wallet (including contract-wallet validation through viem), executes the existing action against request-local state, then commits all changed records with the revision, consumed nonce and audit entry in one Redis script. A concurrent change returns 409 and requires reloading and signing again. Source failures return unavailable rather than a healthy empty registry. An uncertain successful commit is not automatically resubmitted; reload source state before preparing another action.

This release preserves the existing role/Snapshot authorization rules. The personal-wallet super-admin exception and Executive-role administration are NOT removed until a replacement authority policy and recovery path are approved and integrated. Contract-signature support alone does not give the root Safe permissions under the legacy policy.

Configuration: existing KV/Upstash URL and token; optional MAINNET_RPC_URL. REGISTRY_AUDIENCE defaults to https://research.bittrees.org and should remain canonical for source-routed changes. Preview UI writes require an explicitly configured matching audience; do not sign against the wrong environment.

Validation: signed-registry behavior, role-feed checks and a disposable local Redis atomicity test run through `yarn test`. The registry workflow performs a frozen-lock install, all tests and the production build. No production role assignment is used as a smoke test.

The default test command uses the Node test runner, matching the actual test modules. Automatic-policy coverage proves legacy behavior is retained before enrollment, and denial/outage cannot fall back to legacy authority after activation. The Redis check executes this repository’s actual commit script, verifies nonce/revision conflicts and proves malformed audit storage causes no partial commit. Install Redis locally to run that check.

The 23 September main alignment incorporates source already deployed at65c0af0; added test/CI wiring changes no application code, authority configuration or registry records. Deployment reports `controller-policy-on-activation`; the read-only synthetic-address baseline is `configured:false` with no permissions. This is not an approval or activation of a controller policy. Authority enrollment, controller approval, recovery and operational acceptance remain separate work.
