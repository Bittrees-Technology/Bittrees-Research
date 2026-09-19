# Signed registry v2

Community and room writes now sign the entire canonical request, including audience, chain, endpoint, wallet, payload, nonce, five-minute validity window and expected registry revision. Reads return the revision. Old clients must reload; legacy write signatures are deliberately rejected.

The server reads a consistent Redis snapshot, verifies the wallet (including contract-wallet validation through viem), executes the existing action against request-local state, then commits all changed records with the revision, consumed nonce and audit entry in one Redis script. A concurrent change returns 409 and requires reloading and signing again. Source failures return unavailable rather than a healthy empty registry. An uncertain successful commit is not automatically resubmitted; reload source state before preparing another action.

This release preserves the existing role/Snapshot authorization rules. The personal-wallet super-admin exception and Executive-role administration are NOT removed until a replacement authority policy and recovery path are approved and integrated. Contract-signature support alone does not give the root Safe permissions under the legacy policy.

Configuration: existing KV/Upstash URL and token; optional MAINNET_RPC_URL. REGISTRY_AUDIENCE defaults to https://research.bittrees.org and should remain canonical for source-routed changes. Preview UI writes require an explicitly configured matching audience; do not sign against the wrong environment.

Validation: five behavioral tests, production build, unchanged role-feed tests, and a disposable local Redis test of the commit script. No production role assignment was used as a smoke test.

Tests: node --test scripts/signed-registry.test.mjs; the shared Lua commit script was tested against Redis in the Gov checkout.
