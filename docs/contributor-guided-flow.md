# Research membership and role credentials

Research uses its Ethereum membership and credential contracts. Its five standard roles are Researcher, Contributor, Assistant, Steward and Executive. Executive is the Research admin role.

An active member submits the original encrypted Base application and selects requested roles. The existing membership checks, reviewer encryption, private intake, finality checks and duplicate protection remain in place. Requested roles are requests, not grants.

An authorized Executive reviews the application, requests information or accepts/rejects with an explanation. Applicants can reply and follow the same private record. Acceptance is separate from credential assignment and never indicates that a credential has been issued.

After acceptance, credential assignment opens with the verified member wallet and requested role prefilled. The issuer confirms the membership token, credential type, metadata and optional expiry. Existing on-chain checks run before preparation and execution. An active Executive can issue non-Executive credentials directly. Only the primary admin Safes may issue Executive credentials. Roles still verifies its approved permission mappings and the current parent membership.

The credential status panel reads the published Research contracts. Expiry, revocation, burning and membership validity determine current status. A stale application record or historical memorandum cannot establish active credentials.

Research does not issue a Memorandum of Contribution or calculate monthly contribution allocations. Those Governance flows are not exposed through Research; direct attempts to use their API actions are rejected. Historical stored records are preserved.

Connected-account controls belong in the top-right profile. The contributor page has no duplicate verified-wallet row or wallet-settings menu. A missing or mismatched session still requires valid ownership proof; a current Research session is reused.
