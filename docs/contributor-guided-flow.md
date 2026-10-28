# Research contributor journey

Applicants follow **My contribution** from their original application through reviewer messages, memorandum negotiation, signature and confirmed issuance. Reviewers use the application worksheet with selected details alongside it. Acceptance opens memorandum preparation with the applicant's contribution interests prefilled. Memoranda have action and waiting filters; Directory distinguishes accepted applicants from current issued credentials.

## Research admission and authority

The original Research form and its five requested roles are retained. Active native Research membership is required for application submission and import. The automatic intake repeats that check both when staging and when promoting a finalized application. Existing records remain readable under their current authorization. Native membership, Executive credentials, Roles decisions and Safe controls remain separate requirements. Requested roles never grant permissions.

## Private automatic intake

The successful Base receipt supplies the attestation UID. After checking the existing Research wallet session, the browser sends only that UID and its random per-document content key. Wallet-derived encryption keys are wiped and are never stored server-side. Automatic intake can be retried without another Base transaction.

The server independently verifies the latest Base source, submitting wallet, project, revocation and encrypted contents before staging. The per-document key is separately encrypted using the existing private codec and stored in Redis with an enforced 24-hour TTL. Application state and response views contain only provenance and status, never the key.

On an authorized workspace refresh, at most three due records are checked, at most once per minute each. Promotion repeats finalized source and membership checks before creating a submitted application. It does not approve an application, issue a credential or grant a role. Keys are removed after the private state commits; the TTL remains a cleanup backstop. Pending intake refreshes only while the workspace is open. There is no new scheduler.

Old submissions and intake whose key has expired use one wallet unlock to import the existing Base record. Applicants should not submit another transaction because intake is pending. Denied or superseded workspace reads clear private view data.

## Memoranda and integration

Research retains its existing contract and 24-hour contributor consent. A signed draft may be issued and reconciled before an amendment; historical expiry recovery still requires finalized on-chain verification. The interface does not imply that editing cancels a signature. Gov's non-expiring authorization behavior is not imported into Research.

Applicant edits retain the original Base source, requested roles, wallet, signed memorandum and credential. Approved profile fields continue through the existing signed Roles profile protocol. Private notes stay private. Signed responsibilities produce Workflow suggestions for Partner approval through the existing feed; no automatic assignment or execution is added. Pending Safe operations, native role credentials, policy activation and token reissue are unchanged.
