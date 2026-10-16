# Contributor administration integration

This is the native-site implementation of the agreed contributor workflow. The separate `contributor-review/` package remains a loopback-only fixture review; its personas, sample records and simulated issuance are never imported by this API.

## Routes

- `/admin/contributors`: verified contributor or staff view, with application decisions, private directory, versioned memoranda, proposals and contribution records.
- `/contributors/apply`: email-first interest form, including the historical contact, expertise, referral and preferred-wallet fields. Research also has requested Research roles, which do not grant capabilities.
- `/api/contributors`: host-only session, verified email and wallet challenges, reads and version-checked mutations.

Existing Admin and Contribute pages link to these routes. The legacy encrypted form and its records remain available. No historical data has been imported or overwritten.

## Agreed policy

Partners decide application outcomes and standing across Bittrees projects. Junior Partners and Associates recommend outcomes and propose changes. All three tiers can confirm monthly contributions, including their own, with evidence. Self-confirmation, actor, date and evidence are recorded. Recognition rank is not authority. Ordinary applicants cannot confirm contributions.

A memorandum has a Partner-selected end date or an ongoing term. Active, Suspended, Ended and Revoked remain distinct; ongoing terms can still be suspended or ended. Changes to level or rank require a new acknowledged memo. Ended/revoked credentials cannot be reactivated. Applicant explanations and private staff notes remain separate.

## Configuration and deliberate launch boundary

The service defaults to disabled. Configure these **server-only** values independently for each deployment before enabling it:

- `CONTRIBUTORS_ENABLED=1` (enable only after staging checks).
- `CONTRIBUTOR_STORAGE_SECRET`: at least 48 random characters, retained securely for record decryption. Rotating it requires an explicit re-encryption migration.
- `CONTRIBUTOR_IDENTITY_SECRET`: at least 48 random characters, stable for identity continuity. Use the agreed same secret where cross-project account identifiers are intended; rotation requires an identity migration.
- Existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or their Upstash equivalents). Records are in new `bittrees:contributors:v1:<project>:` namespaces; no registry keys are modified.
- `RESEND_API_KEY` and a verified sending domain. The approved default sender is `Bittrees Contributors <contributors@bittrees.org>`; `CONTRIBUTOR_EMAIL_FROM` can explicitly override it. Domain verification and production configuration remain required.
- Existing `ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY` and `ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY`, with Gov and Research enrolled and the agreed organization-wide tier policy reflected in signed Roles decisions. There is no legacy-role or client-label fallback.
- `ETHEREUM_RPC_URL` for wallet ownership verification, including contract-wallet signatures.

Sign-in codes expire in ten minutes and are single-use with bounded attempts and email/IP rate limits. Sessions are Secure, HttpOnly, SameSite=Strict, host-only cookies lasting at most one day; sessions and email addresses are encrypted at rest. No bearer credential is stored in browser storage. Requests require exact canonical Origin and CSRF protection after sign-in. Email-to-wallet linking requires a fresh signed, session-bound challenge; typing an address never proves ownership. Existing verified accounts are not silently merged. Competing record edits use an atomic compare-and-set and reject stale revisions.

The shared-login broker currently excludes Gov and Research. This implementation uses separate verified email sessions; it does not change that rollout or claim SSO. Production preview domains are not accepted as canonical mutation origins: test the handler with injected adapters, or explicitly register a separately reviewed staging-origin configuration before deployment.

## Chain execution and Roles profile sync

`/api/contributors-profile` accepts only a short-lived Roles-signed request for the signed-in profile's verified identities. Request IDs are single-use; responses are signed by the existing site key. The projection includes application state, level, recognition rank, term and credential status, with no private notes, personal contact fields, memo contents or financial allocation. Roles refreshes this view once per minute and shows unavailable sources explicitly. Email matches the verified application email; a wallet matches only after ownership verification. No automatic profile merge or permission grant occurs.

The applicant signs EIP-712 memorandum consent for the exact chain, contract, recipient, terms, nonce and deadline. The Partner prepares a transaction through `/api/contributors`; Roles separately authenticates the site's request and verifies current BGOV eligibility and majority-approved Partner membership. A dedicated, root-approved Roles signer issues a single-operation EIP-712 permit bound to actor, operation hash, nonce, authority epoch, contract and Ethereum mainnet. Permits last at most 90 seconds; the contract rejects any permit more than 120 seconds ahead. This is a trusted Roles authorization bridge, not an on-chain BGOV balance oracle. Membership/revocation changes affect new permits immediately; previously signed permits can remain usable until their short expiry. The root can invalidate all permits immediately by changing the signer/epoch, including setting it to zero.

Partners retain the existing 420 BGOV requirement and strict-majority appointment/removal rules in Roles. The credential contract does not maintain a competing Partner list. NFT possession, Full Time level and Lead Contributor recognition do not grant authority. Junior Partner/Associate proposals stay in the source workflow, with a Partner's decision required. Root-only service roles remain available for explicit root delegation; no service role is granted in the deployment package.

An operation is saved before the wallet is asked to submit it. Reconciliation requires a successful, canonical, finalized Ethereum receipt with the matching authorized-action and memorandum/standing events, plus matching on-chain credential terms. Failed, unrelated or unfinalized transactions do not create an issued record. The first root issuance is verified as credential #1 and uses the contract's root-only first-issuance gate. Once an operation is prepared, reconcile it before changing its memorandum. Expired unused permits can be replaced; a consumed nonce requires the original transaction hash. The UI retains the hash for manual reconciliation; automatic background receipt polling is not enabled.

Credential standing is rechecked on chain before monthly confirmation and private profile display. Allocation confirmation remains evidence only: no BTREE amount or payment is authorized. Historical import, allocation formula, consented decision notifications and cross-wallet recovery remain separate follow-up work.

## Release configuration

Gov and Research need `CONTRIBUTOR_CONTRACT_ADDRESS` and `CONTRIBUTOR_CONTRACT_CODE_HASH` matching the reviewed deployment. Roles needs the same pair plus its dedicated `CONTRIBUTOR_AUTHORITY_PRIVATE_KEY`. Never place this private key in a frontend variable, source control, public artifact or message. It signs bounded permits only; it never submits or pays for transactions. Existing Roles/site Ed25519 keys continue to authenticate service requests. No schema migration is needed for the profile connection.

The production sender is `Bittrees Contributors <contributors@bittrees.org>`. A sending-only Resend key restricted to bittrees.org and separate encrypted-storage secrets were configured on October 16, 2026. Feature activation remains a distinct release step. Do not rotate storage or identity secrets without a migration.

## First issuance and signing sequence

Verified mainnet names at preparation: `bittrees.eth` is the Safe `0x1B6c450FaDB7c77191f152473FC2f79dC515FA77`; `raging.eth` is `0xE5350D96FC3161BF5c385843ec5ee24E8B465B2f`, an owner of that Safe. Recheck before execution. ENS changes do not silently change authority. The existing Roles partnership policy already names this wallet as its initial Partner; current policy, votes and BGOV holdings remain authoritative at execution time.

1. The Safe owner reviews and signs deployment from the bittrees.eth Safe through the verified Safe CreateCall library. The constructor pins the root Safe and reviewed Roles permit signer. Root's default-admin role cannot be removed or renounced; Safe owner management remains with the Safe.
2. The contributor submits/verifies their application. A Partner accepts it and prepares a Full Time, Lead Contributor, ongoing memorandum with the actual responsibilities and current effective date.
3. raging.eth signs that exact memorandum's EIP-712 acknowledgment.
4. The first issuance transaction is executed by the bittrees.eth Safe. The native portal prepares a Safe owner transaction for credential #1; the contract rejects non-root first issuance. Later issuance uses current Partner authority through Roles permits.
5. Verify finalized deployment/issuance receipts, runtime code and role/profile views before calling issuance live.

`scripts/contributors/prepare-deployment.mjs` produces an unsigned, gas-simulated deployment package. It checks the official Safe CreateCall runtime hash, derives the CREATE2 address and pins every compiler immutable by AST name. It never signs or broadcasts. The release package must be rebuilt when the contract or compiler settings change.

## Verification

Run `npm run test:contributors`, `npm run test:contributors-browser`, `npm run build`, and the Solidity tests under `contributor-review`. Roles has separate signature, profile isolation, Partner-policy and permit tests. Production activation and wallet signing are not inferred from passing tests.

## Existing Base applications and wallet-only sign-in

The contributor portal supports a server-generated, browser-bound, single-use wallet sign-in challenge without an email. This creates a verified wallet identity; it does not grant staff authority or merge an existing email account. Roles receives only verified identities.

Applicants can unlock their existing Base EAS application and explicitly sync it into the private contributor workflow. The server reads the attestation at a finalized Base block, verifies schema, project, attester and validity, and decrypts the original content using only that document's random content key. The wallet-derived private key stays in the browser; no decryption key is persisted server-side. The Base UID is retained as provenance and imports are idempotent. Contact email from the old encrypted form remains unverified and cannot establish Roles profile ownership.

Import creates a submitted application, never acceptance or a credential. Partners review the same application; its contribution description prefills memorandum responsibilities. The applicant reviews and signs exact terms, then the credential follows the existing Ethereum issuance/finality checks. Existing Base submissions do not need to be submitted again or gain a new email identity.
