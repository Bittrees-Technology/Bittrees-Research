# Research dependency hardening

The 23 September 2026 refresh preserves the installed Push, Wagmi, RainbowKit, Alchemy and viem release lines while replacing affected transitive packages. Push remains pinned at1.7.32 with its provider/key-isolation patch. Axios is scoped to0.33.0 for Push and Alchemy, and1.18.0 for Coinbase CDP. WebSocket7 remains7.5.11 for WalletConnect's older transport; existing WebSocket8 callers use8.21.0. Coinbase's Preact dependency stays on10.27.3.

The lockfile refresh covers tar, Router, PostCSS, DOMPurify, minimatch/brace expansion, Socket.IO parser, browserslist, YAML, Hono/h3, qs, Joi, bn.js, Ajv and filesystem helpers within their existing supported release ranges. Vitest and react-cookie were unused: there are no application imports or test entry points for them. Removing them also removes their unused vulnerable dependency paths. Node and Playwright remain the test runners.

`yarn test:dependency-audit` checks Yarn's structured report and fails on high/critical findings, unavailable/truncated/invalid reports or inconsistent exit status. It does not suppress advisories or treat a failed registry request as success. Low/moderate counts remain visible. Vercel now uses `yarn install --frozen-lockfile --ignore-scripts`, matching CI; the existing prebuild step applies and verifies the Push SDK patch.

A fresh audit of the original main lockfile reported103 distinct advisories (1critical,43high,51moderate,8low). The refreshed lockfile reports3 (2moderate,1low), with no high/critical findings. These are unique advisory IDs, not repeated dependency paths.

The 24 September UUID compatibility update scopes UUID11.1.1 to Push, MetaMask SDK, its communication layer and MetaMask utils. This release retains CommonJS and ESM entry points. The only lockfile change replaces UUID8/9 with11.1.1; wallet/messaging SDK releases and the Push isolation patch are unchanged. A fresh audit now reports2 distinct advisories (1moderate,1low), with no high/critical findings.

The previous UUID9 dependency reproduced silent partial writes in the affected v3/v5 APIs. Regression tests check every installed UUID caller's resolution, invalid-buffer rejection before mutation, canonical random/deterministic v4 IDs, parse/stringify compatibility and actual Push payload/MetaMask utility callers across CommonJS and ESM. A built-browser test exercises actual Push payload and stream identifiers with external network requests denied, alongside the existing encrypted-message/provider-isolation test. These tests do not claim live wallet or private-room acceptance.

Remaining reports need coordinated compatibility work: the CommonJS query-string caller of decode-uri-component (the patched0.5 release is ESM), and elliptic's low-severity report with no patched release. Do not force major replacements or declare the whole application production-ready from this gate. Genuine wallet/device, provider/network, member-room and launch acceptance remains separate.

Validation includes registry/Redis, session/signer, encrypted local recovery, real patched Push PGP/AES/HTTP isolation, and built-app wallet/export checks. An additional built-app scenario uses the actual Alchemy SDK request path with an intercepted empty NFT response, verifies the owner/contract parameters, and confirms it cannot grant Research membership. No live member data, membership mint or messaging write is needed.

Upstream references: [node-tar resource-limit advisory](https://github.com/isaacs/node-tar/security/advisories/GHSA-23hp-3jrh-7fpw), [Axios releases](https://github.com/axios/axios/releases). The audit covers the installed lockfile and includes development dependencies; counts must distinguish unique advisory IDs from repeated dependency paths.

UUID reference: [buffer-boundary advisory and patched release lines](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq).
