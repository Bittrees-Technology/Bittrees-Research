# Development and operations

React 19 · TypeScript · Vite 6 · React Router 7 · wagmi 2 / viem 2 · RainbowKit 2 · Tailwind 4. Vercel serverless endpoints use Redis/KV for signed registries and encrypted member/contributor records. The retained messenger uses XMTP and Push.

Use **Node.js 24** (the CI runtime) and the pinned **Yarn 1.22.22**. Reuse a suitable existing dependency installation when available.

```bash
yarn install --frozen-lockfile
cp .env.example .env.local
yarn dev                         # http://localhost:3000
```

Vite serves the frontend; a local preview alone does not provide the Vercel API handlers or production backend configuration. Tests use their own fixtures where indicated.

```bash
yarn build                       # TypeScript + production frontend build
yarn preview                     # Serve dist locally
yarn test                        # Node test runner, scripts/*.test.mjs
yarn test:contributors           # Contributor server/authentication tests
yarn test:contributors-browser   # Built-app browser tests
yarn test:membership-unit
yarn test:membership-browser
yarn test:integrated              # Integration suite; see CI service requirements
yarn lint
```

Browser suites require the Playwright Chromium runtime. The [registry workflow](../.github/workflows/registry.yml) uses Redis for integrated validation; the [membership/messenger workflow](../.github/workflows/recovery.yml) lists the remaining release checks. Keep required coverage intact.

## Configuration and security

Start with [.env.example](../.env.example), then configure the enabled server features. That template is not an exhaustive production secret inventory.

| Configuration | Purpose |
| --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | Browser WalletConnect/Reown project ID. |
| `VITE_MAINNET_RPC_URL` | Optional browser Ethereum transport. Every `VITE_*` value is public in the bundle. |
| `VITE_ENABLE_TESTNETS` | Optional testnet picker entries; not proof that contracts exist there. |
| `RESEARCH_RPC_URL`, `MAINNET_RPC_URL`, `ETHEREUM_RPC_URL` | Server Ethereum transports; native Research authority uses these in that fallback order. Authentication and other handlers select their documented transport. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Server Redis/KV connection; `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are supported aliases in the registry client. |
| `CONTRIBUTORS_ENABLED`, `CONTRIBUTOR_IDENTITY_SECRET`, `CONTRIBUTOR_STORAGE_SECRET` | Contributor feature gate, private identity derivation and encrypted storage. Research requests reuse the identity/storage configuration and session namespace. |
| `ROLES_ECOSYSTEM_REQUEST_PRIVATE_KEY`, `ROLES_ECOSYSTEM_DECISION_PUBLIC_KEY` | Server-side signed requests to Roles and verification of its decisions. |
| `CAPITAL_SYNC_TOKEN` | Optional server-only bearer authorization for holder-sync maintenance; configuring it does not schedule synchronization. |

Legacy Alchemy and Push variables remain for older surfaces; **current Research membership discovery does not require Alchemy**. Missing backend/authority configuration must not grant access. Never commit credentials, private operational receipts, encryption keys, or full authenticated provider URLs. Never place server secrets in `VITE_*` variables.

## Repository layout

```text
api/                        Vercel API entry points
server/                     Authentication, authority checks, registries and workflows
shared/                     Signed payload and permission rules
src/components/             Membership, credentials, contributor and token interfaces
src/pages/                  Overview, Research, Forum, Contribute, Admin and token pages
src/lib/constants/          Contract addresses, ABIs and deployment manifest
contributor-review/         Separate memorandum credential/artwork contract project
docs/                       Workflow, security and rollout documentation
scripts/ and tests/         Server, integration and browser verification
```

## Release and verification

The existing Vercel project serves `research.bittrees.org` from GitHub `main`. Review the exact change, pass the required checks, and verify the production domain's deployed source after release. A successful homepage response alone does not prove membership, sessions, permissions or transaction behavior. A documentation-only update does not change contract deployment or grants.

The optional read-only release gate captures a baseline and compares a preview or rollback surface:

```bash
yarn release:gate --mode baseline
yarn release:gate --mode canary --base-url https://<preview-host> --baseline output/release-gates/<baseline-run>/run.json
yarn release:gate --mode rollback-check --baseline output/release-gates/<baseline-run>/run.json
```

It writes `run.json` and `report.md` under `output/release-gates/`; these route/API checks supplement, rather than replace, authenticated and negative-authority tests. Retain private evidence outside public commits. Do not infer free hosting, new spending authorization, or migration readiness from a build succeeding.
