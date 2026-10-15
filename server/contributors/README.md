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

## What remains before end-to-end live issuance

- Deploy and review the credential contract and select the chain, issuer, status and recovery signers.
- Add signed on-chain consent, transaction submission/outbox, receipt/finality/reorganization verification and return/reissue workflow. The API deliberately rejects `issue`, on-chain standing changes and approval of credential amendments until that adapter exists. It never creates a simulated credential. Applicant memo acknowledgment is an authenticated account acknowledgment, not a blockchain signature.
- Reconcile/import historical contributor records and their memo/validation evidence with identity review. There is no import endpoint that lets client data claim an issued credential.
- Integrate authenticated profile projection into Roles; private records are not published to a public feed.
- Approve allocation formula and implement Capital payment authorization separately. Confirmations have `amount: null`; no BTREE payment is created.
- Add applicant replies to information requests and consented decision notifications; only sign-in email delivery is implemented.

No live environment variables, database records, email deliveries, role grants, contract deployments or token transactions were changed while implementing this feature. The feature must remain disabled until the relevant configuration and launch gates are met.

## Checks

`npm run test:contributors` tests encrypted storage, concurrent edits, email/wallet replay protection, role authority, authenticated HTTP access, private-field redaction, and absence of simulated issuance. `npm run test:contributors-browser` exercises the native routes with intercepted API responses, including unavailable-service behavior, email sign-in and ongoing terms. `npm run build` checks the complete site. The fixture package separately exercises the proposed full credential lifecycle and Solidity candidate.

## Approved mainnet authority setup (pending deployment)

Ethereum mainnet is the proposed chain. Before signing, resolve and independently verify the wallet addresses for `bittrees.eth` and `raging.eth`; record chain ID 1, both addresses, deployment transaction and contract address. ENS names are labels, not transaction signers. Later ENS changes do not automatically change contract authority.

Deploy from the verified `bittrees.eth` wallet and pass that same wallet as `administrator`. It remains the immutable root authority: it can administer every operation and grant/revoke Partner and service roles. Its default-admin role cannot be granted, removed or renounced. This preserves override authority but means root-key loss requires a separate recovery/migration design; no automatic root rotation is implemented.

Use `bootstrapPartner` with the verified `raging.eth` wallet, approved Full Time memorandum terms and that wallet's exact EIP-712 consent. This atomically issues credential #1 and appoints the first Partner; only root can call it and only before any other issuance. Full Time is a contribution level, independent of the Partner authority role. Do not infer a recognition rank, term end or financial allocation from that role.

Partners can issue/amend credentials, change standing, recover credentials, and appoint/remove other Partners. Root can override Partner membership and retain operation access even when no Partners remain. Partners cannot change root or grant service roles. Revoking Partner membership removes its implicit operational powers; any independently root-granted service role must be revoked separately. Membership changes emit AccessControl events. Root override does not bypass contributor consent, terminal-standing rules or the audit trail. An override changes current membership; it does not permanently prevent another current Partner from reappointing someone.

Partner membership and credential standing are separate: suspension/expiry of a memo does not silently revoke administrative access. Staff offboarding must explicitly revoke the Partner role. Likewise, changing contribution level never silently changes administrative access.

This is a contract candidate, not a live grant. Native Gov/Research authorization still uses signed Roles decisions. Before enabling operations, implement and test a chain-confirmed Roles adapter for these Partner events, root override handling, reorg/revocation invalidation, and cross-project grants. Do not derive permission from token ownership or cache an unconfirmed appointment. Sign-in email delivery, wallet signing, deployment and role projection still require live configuration.

Research contributor-entry routes intentionally sit outside the membership gate so email-first applications do not require a wallet or membership token. The contributor API independently enforces identity and role access. Existing research-content routes retain their membership gate.
