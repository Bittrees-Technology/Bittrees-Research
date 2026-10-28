# Messenger sync sessions

Messenger retains its existing encrypted data, wallet key message, cipher and storage namespace. Research keeps the read-only Gov ciphertext fallback. This does not change application membership, contributor eligibility, roles, root recovery or Safe approval.

The encryption signature is held only in tab memory and is never used as a server write credential. Refreshing or opening a new tab requires reconnecting Messenger sync. A separate, explicit wallet message establishes a one-hour, non-sliding HttpOnly, Secure, host-only, SameSite=Strict session. The connection proof is one-use, browser-, wallet-, origin- and scope-bound; challenge creation is rate limited. Logout invalidates that sync session. Protected writes still require the exact wallet in the session. Old reusable signatures cannot authorize writes.

An older saved signature is not automatically reused. On reconnect, the original wallet must reproduce the encryption proof, existing ciphertext must decrypt, and fresh scoped authorization must succeed before the browser removes the older credential. Rejected wallet prompts, different keys, invalid ciphertext and unavailable storage preserve the existing credential and data. Removal blocked by the browser is reported as incomplete. No mass deletion or automatic re-encryption occurs.

Validation: `node --test scripts/usersync-session.test.mjs` covers the actual cipher, compatibility, replay, origin, browser binding, wrong wallets, expiry, logout, storage failure, legacy preservation and Research fallback. Real browser migration requires the owner's wallet confirmations; automated tests never sign for an owner.

## Dependency compatibility

The security refresh uses Vite 6.4.5, DOMPurify 3.4.17, Hono 4.13.11, follow-redirects 1.16.1, qs 6.17.0 and Zod 4.6.7. The existing strict audit gate is unchanged. Zod 3 has no advisory-patched release. The pinned Coinbase SDK 1.51.0 compatibility patch makes its record key schema explicit in the ESM, CommonJS and source variants; it preserves string-keyed typed-data maps. Tests exercise the actual wallet frame, ABI, typed-data and Coinbase policy schemas, including invalid payloads. No policy is created or granted by these parser checks. Existing Push/URI patches remain required.
