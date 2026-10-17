# Research V3 credential issuance

The existing membership and credential proxies now use the verified V3 implementations pinned in `src/lib/constants/research-deployment.json`. Both original Safes retain upgrade authority.

The Roles tab separates definition creation from credential assignment. An active Executive credential holder can issue directly from the wallet owning that credential, using `issueCredentialAsExecutive`. The UI checks the credential and parent membership, simulates the exact call, and repeats these checks before submission. Only primary administrators can issue Executive credentials. Safe preparation remains available; direct calls cannot be exported as Safe batches.

Roles verifies current and finalized contract state. Researcher retains its existing role mapping. Assistant grants moderation; Steward grants definition creation and moderation; Executive grants assignment and moderation. These capabilities require the matching existing approved staff definition and do not grant general administration, revocation, or upgrade authority. Contributor and ad hoc types have no automatic extra permission mapping. Expired, revoked, burned, suspended, or unverifiable credentials grant no access.

After issuance, refresh Roles to verify effective access. Chain finality can delay recognition. A transaction receipt alone does not grant application permissions.
