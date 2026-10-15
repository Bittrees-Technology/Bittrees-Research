# Contributor credential review

A local review of the Bittrees contributor journey. This is an isolated workspace, not a production feature or a live eligibility system. The existing Governance build, routes, application data and authorities are unchanged.

## Open and run

From this directory:

```sh
npm ci --ignore-scripts
npm start
```

Open http://127.0.0.1:4348. The server binds only to loopback. Records use the explicitly displayed review date **October 15, 2026**. All people, wallets, permissions, acknowledgments and issuance receipts are fixtures. No wallet connection, signature request, notification, upload, shared database write, public deployment or token payment occurs.

Sample state is persisted privately in `.state/review-v2.json` (mode 0600), with serialized updates and atomic replacement. Reset sample records restores the five sample people across Governance and Research. This is local fixture storage, not a production persistence adapter. Sessions are in memory and reset when the server restarts. The persona selector is deliberately a simulation control, not authentication.

## Suggested walkthrough

1. In Applications, select Alex. Write a reason and Start review.
2. Write a decision note and Accept application. Acceptance does not create a token or a role grant.
3. Open Credentials. Prepare a memorandum, choose level/rank and effective dates.
4. View as Alex. Read the memo and acknowledge the exact version (simulated).
5. Switch back to Partner and Issue sample credential.
6. Open Monthly review. Validate October 15 using a short evidence note. The period is validated but the amount remains unconfigured and no payout is created.
7. Open Roles profile to see the proposed private profile projection.
8. In Credentials, suspend the sample credential with a reason. New monthly validation is blocked. Old records remain.
9. Reset. Choose the reviewer without decision authority and attempt a final decision: it remains Awaiting authority. The unassigned persona cannot read applications.
10. Inspect Maya's seeded credential, or Noor's information request. Alex and Research applicant Rhea have acknowledgment personas. The new-applicant persona can submit either interest form.

Rejection is final for an application; a later application must be a separate record. A rejected applicant can submit a fresh interest form. Monthly adjustments, segmented periods and applicant replies are also explicit follow-up work.

## What is implemented

- Reviewer/applicant views with bounded record visibility and server-derived fixture actors.
- Separate reviewer eligibility and final-decision authority, with project-filtered records and Partner decision authority across both registered projects.
- Start review, request information, resume, accept and reject; immutable final decisions; version checks preventing concurrent overwrites.
- Versioned memo drafts, exact-version acknowledgment and sample issuance. Old accepted terms are preserved when amendments are drafted.
- Contribution level and recognition rank independent from standing. No capability grants or access provisioning.
- Active/suspended/ended/revoked sample standing, irreversible ended/revoked states, and an audit chain.
- Monthly evidence, date bounds, one validation per month and no inferred allocation amount.
- Downloadable **sample plain-text memo**, clearly marked as not an issued agreement. This is not yet the final signed PDF template.
- A separate Solidity review candidate and in-memory EVM tests for permanent non-transferability, issuer authorization, typed consent, amendments, standing, expiry and controlled replacement.

## Contract candidate

`contracts/src/ContributorCredential.sol` uses pinned OpenZeppelin Contracts 5.6.1. It implements ERC-721, the ERC-5192 lock interface and ERC-4906 metadata events. It is **not deployed or connected to the UI**. The UI simulates receipts while the Solidity tests verify the independent contract candidate.

Authority is constructor-injected. No real Bittrees wallet or issuer is selected. Issuance, status and recovery have separate roles. Recipient consent uses EIP-712 with chain/contract domain separation, a nonce and deadline; OpenZeppelin SignatureChecker supports EOAs and ERC-1271 accounts. Consent includes subject, memo hash, policy hash, level, rank and validity dates.

The contract blocks transfers, approvals and burns; revocation keeps the historical token visible. Holders may renounce, ending their standing. Recovery invalidates the old credential and issues a replacement with new-wallet consent. Recovery authority still requires a reviewed identity-verification policy: new-wallet consent alone does not establish identity continuity. The same subject cannot have two current credentials, but deduplicating real people and project scopes is an issuer responsibility.

Contract time intervals are half-open `[validFrom, validUntil)`. UI sample dates are inclusive. The future adapter must convert an inclusive end date to midnight UTC on the following day, and must never silently use local timezone conversions.

`isCurrentAndActive` checks current standing and dates only. It deliberately does not authorize BTREE payment. A future monthly validation/allocation registry must retain historical periods independently of current standing, prevent duplicate payments, and define how revocations affect prior unpaid records. Cosmetic NFT metadata is never payment authority.

Amendment history is emitted as events and must be indexed; private agreement bytes are stored outside the chain. The contract is unaudited. No production upgrade policy, multisig/timelock configuration, chain selection, deployment scripts or payout contract is supplied here.

## Historical conflicts represented

- Advisor multiplier is proposed as 1/10, not silently imported from the ledger's apparent 1/15 figures.
- The October 1, 2026 calendar rate of 1.25% is informational. No rate policy is activated.
- Treasury basis/snapshot, denominator, proration, rounding, funding limits, adjustment procedure and payment cutoff remain unresolved. Every validation has `allocationStatus: blocked_policy`, `amount: null`.
- Level, rank, governance power, administrative permission and beneficiary eligibility remain distinct.
- Existing paid distributions and unresolved historical claims must be reconciled, not erased by a fresh start.

## Integration contract for the next phase

Governance owns application review and versioned memorandum records. Roles displays the authenticated contributor profile and provides explicit, independently scoped authority decisions. Capital consumes validated eligibility periods and approved allocation batches. A shared database does not merge these authorities.

Production must replace the fixture session/persona adapter with verified wallet sessions, including contract wallets; validate the payout-wallet link; read separate reviewer, decision, issuer, status and validation permissions from current Roles policy; and deny missing/stale policy. Never map a UI role name or token balance directly to authority.

Use durable private storage for application/memo content, an append-only audit log, transactions and idempotency keys. Index existing Base EAS application UIDs without copying private payloads into public metadata. Applications encrypted to old reviewers need an explicit consent/re-encryption path; no newly appointed reviewer can automatically decrypt historical ciphertext. Block or clearly hold new submissions with no available reviewer recipient.

Issuance should be a retryable outbox job: approved application + acknowledged immutable memo -> authorized transaction -> confirmed receipt -> profile projection. A failed or reorganized transaction must not show an active credential. Define the same receipt lifecycle for amendment, suspension and recovery. Do not store signing keys in this app.

Publish only the minimum consented verification data on-chain. Opaque subject identifiers must not encode names or emails; private document commitments need a privacy review. Private reasons and applications stay off-chain. Display only authorized summaries in Roles and Chat. Notification delivery requires separate configuration and recipient consent.

Before connecting production, approve the exact authority policy, memo text, acknowledgment format, record retention, revocation/appeal/recovery rules, level/rank definitions, period semantics, allocation formula, chain/contract deployment, and a contract security review. No production grants or payments are authorized by this review workspace.

## Validation

```sh
npm test
npm run test:browser
npm run build
npm run test:contracts
```

Browser tests use a separate loopback port and fixture file. Contract tests run in Foundry's in-memory EVM using dummy signing keys. They do not call live RPC services. The current suite covers workflow authorization, optimistic version conflicts, invalid dates, exact-version consent, no automatic grants, no transfers, stale signature replay, expiry, recovery and browser/mobile layout.

## Governance and Research administration

The dedicated contributor workspace is proposed at `/admin/contributors` on each site, linked from its existing `/admin` page. The isolated review uses `/gov/admin/contributors` and `/research/admin/contributors`; `/gov/admin` and `/research/admin` preview the Admin entry. `/gov/contribute` and `/research/contribute` preview interest forms. These do not replace production routes yet.

To run Research separately: `REVIEW_SITE=research REVIEW_PORT=4350 npm start`. Each checkout has its own private fixture store. Neither copy reads or synchronizes live records. A future shared package should provide the common schema and policy implementation to prevent divergent copies.

The server resolves the actor and project scope. A verified Partner can directly change standing across all Bittrees projects. Governance and Research are the two registered projects in this preview. Junior Partners and Associates can propose standing, level or recognition changes; a Partner must approve or reject with a reason. Proposals record their target credential revision; stale proposals cannot overwrite newer changes. Final proposal decisions are immutable. A terms approval creates a new memo draft and leaves the current credential unchanged until acknowledgment and issuance. No title, checkbox, requested role, legacy Executive/Assistant label or recognition rank confers Partner authority.

The dedicated Directory includes accepted applications only. Staff can maintain ENS, sector, groups, group leadership, title, specialties, other positions, private notes and follow-up. Start date derives from the first issued memo; validation, standing and current memo derive from their respective records. Staff-only directory fields and proposals are excluded from applicant responses.

Production must resolve Partner/status authority from the existing server-authorized Roles policy, with organization-wide Partner authority and an explicit project registry. Only the approved Partner executor may hold the contract STATUS_ROLE; Junior Partners and Associates must never receive it to enable proposals. Off-chain approval must be linked to a confirmed transaction before projecting a live status. The contract candidate itself does not implement the proposal queue.

## Historical form and directory mapping

Sources reviewed locally: `BITTREES CONTRIBUTOR APPLICATION  (Responses) - Form Responses 1.pdf` and `Master Contributor Directory - Contributor Directory.pdf`. No personal rows from those documents are included in this workspace.

| Historical field | Review representation |
| --- | --- |
| Timestamp | Server-created application date; future import retains original timestamp separately |
| Name, email, Twitter, Telegram | Private application contact fields |
| Area of expertise, expert field | Separate expertise selections and expert-field text |
| Specialty / contribution interests | Applicant scope statement; not an accepted memo |
| Region, how heard, referrer | Application fields; languages retained from current site forms |
| Preferred ETH wallet | Separate payout-wallet field; mismatch with sample session is unverified and blocks final acknowledgment and issuance |
| Research requested roles | Separate Research-only selections; never capability grants |
| Follow up, start date | Staff follow-up; start date derived from issued memo |
| Contributor ID, ENS, sector, group leader, group | Accepted contributor directory |
| Title, specialty 1/2, other positions, notes | Staff-maintained directory fields |
| Status, status change | Current standing plus audited transitions and Partner decisions |
| Level, rate | Agreed memo level; allocation rate remains unconfigured |
| Last validation | Latest validated contribution period |
| Current/live memorandum | Issued version and credential reference; drafts are separately displayed |

Future imports must stage historical status, rate, validation date and memo references as unverified evidence, reconcile duplicate identities, preserve source IDs/timestamps and obtain a Partner decision before promoting records. Historical spreadsheet status does not activate a token or payment. No import has been performed. Email-to-wallet identity linking, agent delegation, live Roles profile sync, applicant replies and notification delivery remain production integration work.

## Review decisions and UX follow-up

Confirmed by the user in this review:
- Partners have authority across all Bittrees projects. The fixture policy covers the two currently registered projects; production must resolve this organization-wide grant from the authoritative role service, never from a client title.
- Junior Partners and Associates recommend acceptance/rejection; Partners finalize decisions.
- Contributor-facing explanations are separate from optional private staff notes. Applicant responses omit private notes, internal recommendations and proposals. Approved standing changes show their public explanation in the credential profile.

The revised interface adds search, a contextual next step, pending-proposal indicators, role-appropriate decision labels, collapsed contact details/history, and proposal fields limited to the selected type. Mobile layout and keyboard focus are checked. The role selector is still a review control only.

Additional decisions confirmed:
- Active, Suspended, Ended and Revoked remain the four statuses. Ended and revoked credentials are terminal. Returning requires a new credential.
- Level and recognition-rank changes both require fresh memo acknowledgment.
- Applications require email; wallet is optional at application time. Acceptance and draft terms can proceed before linking a wallet. Final acknowledgment and issuance require a verified wallet matching the memo.

The preview includes an applicant-only simulated wallet-link action using a fixed fixture-session wallet. Linking supersedes previous drafts so the final wallet-bound memo must be prepared and acknowledged again. Production must implement verified email sessions, account linking and wallet ownership proof; typing an email or wallet is not verification.

Before production there are additional implementation and policy gates: final memorandum wording; approved contribution levels and rate formula (including the historical Advisor-rate discrepancy); confirmed issuer/signing account and chain; private record retention and identity recovery; applicant replies, notification delivery and historical-record import reconciliation. These are not activated by this UI review. Live Roles synchronization and payments remain separate integrations.

## Term and monthly confirmation decisions

Partners choose either a fixed end date or an ongoing term (in perpetuity). Ongoing means no automatic expiry, not immunity from suspension, ending or revocation. Both term types require exact-version contributor acknowledgment. The private memo schema uses `end: null` for ongoing terms; the contract candidate uses `validUntil: 0`. Fixed dates retain inclusive UI / exclusive contract conversion. The term choice is part of signed consent and cannot be changed using an old signature.

Partners, Junior Partners and Associates may each confirm completed monthly contributions directly, without another Partner approval. This permission is separate from application acceptance, status changes and memo issuance. Dates, active standing, evidence, duplicate prevention and the allocation-policy block still apply. Confirmation is not authorization to pay. The fixed-end-date form no longer inserts an arbitrary default term.
