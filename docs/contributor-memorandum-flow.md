# Contributor application and memorandum flow

Gov and Research use the same contributor service and native portal. Existing Base applications remain importable; importing is not approval or issuance.

1. Applicant submits an application with email or a verified wallet.
2. Partner, Junior Partner or Associate reviews it and can request more information. The applicant replies on the same record. Junior Partners and Associates recommend; Partners accept or reject.
3. A Partner prepares a versioned memorandum from the accepted application, including responsibilities, level, rank, term, historical service and allocation weight. The applicant must link their own verified wallet before signing.
4. The applicant either signs the exact draft or proposes edits. Proposed edits retain the original terms and pause signing and issuance. A Partner sees the changes and accepts or declines them with a contributor-facing explanation. A Partner cannot approve their own applicant edit proposal.
5. Accepted edits create a new memorandum version with current policy and Partner-approved weight. The reviewer confirms its effective date; it cannot be backdated. The applicant reviews and signs this new version. Declined edits leave the earlier draft available for acceptance or another proposal.
6. An eligible Partner prepares and submits issuance to the application's verified wallet. The service rechecks the signature, contract, recipient and exact terms. The existing Roles eligibility requirements remain in force; a routine issuance does not require a second Partner vote. The first credential still uses the bittrees.eth root Safe.
7. The finalized receipt must match the signed memorandum and owning wallet before the application records issuance. The record includes the memo approver, applicant acknowledgment, issuing wallet and transaction receipt. Roles receives the existing signed contributor-profile projection.

Signed terms are immutable. Before superseding a signed but unissued draft, the service checks that the consent has expired in a finalized Ethereum block and its original-contract nonce remains unused. A prepared transaction must be reconciled or safely released first. These guards also apply to amendments proposed by Junior Partners or Associates. Existing prepared raging.eth issuance is not changed by this feature release.

Applicant edit proposals cannot change the recipient wallet, staff authority or private staff notes. Optimistic record versions prevent stale approvals. Historical service is descriptive and never backdates eligibility. No payment, token reissue or new role grant is performed by this flow.

## Unified admin workspace

The admin console's Contributor applications tab embeds this same workspace. It replaces the separate legacy read-only application tab and duplicate contributor-admin banner. The direct `/admin/contributors` route remains available for existing links.

Authorized reviewers can unlock a Base application addressed to their verified wallet and add it to the private review queue. The server verifies the finalized attestation, project, encryption recipient and decryption before importing. Applicant ownership is derived from the original attester, using the existing verified account when available; the reviewer is recorded as the importer, never as the applicant. Import is idempotent by attestation UID and does not approve, issue or link an unrelated wallet. The applicant retains acknowledgment authority. Existing unmapped-account conflicts require reconciliation instead of creating duplicate contributor identities.

Publishing a reviewer public encryption key is a separate optional control for future applications. It preserves the existing application-access permission checks and cannot decrypt older ciphertext or confer contributor-review authority.

## Research application eligibility

`/contribute` is the only application form. `/contributors/apply` redirects there; it no longer bypasses the shared membership gate. All five requested roles are offered: Researcher, Contributor, Assistant, Steward, and Executive.

The form requires an active membership in the current Ethereum Research contract and performs a fresh server check before submission. The server also checks the verified Base attester's current membership before either applicant or reviewer import. Expired, revoked, burned, blocked and legacy-only memberships do not qualify; unavailable chain evidence stops admission. Existing saved applications and memoranda remain accessible through verified wallet sign-in.

Base EAS is public and cannot enforce Ethereum membership itself. External attestations can exist, but Research does not admit them without its membership check. Requested roles are application interests only. Acceptance neither mints credentials nor grants Roles permissions. Executive credentials remain issuable only by the primary authorities under the existing V3 contract; no contract or authority changes are made by this flow.
