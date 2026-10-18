# Research access follow-up — 18 October 2026

Owner: Research chat. Reopened after the user reported that the earlier release did not resolve repeated access signatures and a disappearing Admin tab.

## Required behavior

- A valid Research wallet session opens the research board and contributor records without another access signature.
- Viewing the Forum, including navigation from contributor records, must not request a wallet signature or transaction.
- Clicking an outdated verification button must recheck the server session before requesting a new signature. Session-check outages must show an error, not trigger a new signature.
- Permission refresh failures and already-expired empty evidence must not erase the last verified Admin navigation hint. A fresh verified denial removes it. Protected controls must reject unavailable or expired authority.
- Wallet changes must not complete an old wallet's sign-in or display its contributor data.

## Scope of signatures

Wallet connection is not ownership verification. Initial Research sign-in still needs one ownership signature when no valid matching server session exists. Transaction approvals, memorandum consent and explicit first-time decryption of encrypted legacy applications remain separate authorizations. No private encryption key is stored to suppress a prompt.

## Evidence and closure

Track release and live verification in `operations/research-access-followup-2026-10-18/status.json` in the shared project workspace. Regression tests cover expired empty authority responses, Forum/contributor navigation, existing-session reuse, session-check errors, and wallet changes during signing.

The reported Forum signature has not yet been reproduced from simply viewing the page. Do not mark that specific report resolved solely because synthetic tests pass: if it persists, capture the exact wallet prompt and preceding action. This issue must remain visible across handoffs.
