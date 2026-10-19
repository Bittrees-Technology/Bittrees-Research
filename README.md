# Bittrees Research

[research.bittrees.org](https://research.bittrees.org) is the member application for Bittrees Research: research requests, publications, contributor applications, credential management, and the BNOTE/BIT token interfaces.

This README describes the application on `main` as of **19 October 2026**. Contract addresses below come from the checked-in application configuration and deployment manifest; configurable prices, terms, eligibility, and permissions are read at runtime.

Partner applications: [Bittrees, Inc.](https://gov.bittrees.org) · [Bittrees Capital](https://capital.bittrees.org) · [Roles](https://roles.bittrees.org) · [Chat](https://chat.bittrees.org).

## Smart contracts

### Ethereum mainnet — chain ID 1

Use the **proxy addresses** for membership and credential interactions. Implementation addresses identify the code behind those proxies and are not the user-facing token addresses.

| Contract | Address / explorer | Interface and purpose |
| --- | --- | --- |
| **BIT — Bittrees Index Token** | [`0x57A447E4d5e18A9423408C365963A73F08B9d18C`](https://etherscan.io/address/0x57A447E4d5e18A9423408C365963A73F08B9d18C#code) | [ABI](src/lib/constants/bit.abi.json). ERC-20 used by the BNOTE-backed mint/redemption interface and for Research membership renewal. |
| **BNOTE** | [`0xf1AAfFc982B5F553a730a9eC134715a547f1fe80`](https://etherscan.io/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80#code) | [ABI](src/lib/constants/bnote.abi.json). Research preferred-stock token interface; mint with an enabled payment token and use eligible BNOTE in BIT operations. |
| **Research membership** | [`0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335`](https://etherscan.io/address/0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335#code) | [ABI](src/lib/constants/membership.abi.json). Non-transferable membership, fresh/gift minting, BIT renewal, expiry, revocation and burning. |
| **Research credentials** | [`0x335708826d76302E5014E6Ca41564482e38AA8B2`](https://etherscan.io/address/0x335708826d76302E5014E6Ca41564482e38AA8B2#code) | [ABI](src/lib/constants/credentials.abi.json). Non-transferable credentials linked to a parent membership token, including role credentials. |

Source of truth: [token address configuration](src/lib/constants/contracts.ts) and [Research V3 deployment manifest](src/lib/constants/research-deployment.json). The manifest pins runtime hashes, implementations, proxy administrators, authority addresses, and verification blocks. The app also contains Base/testnet BIT and BNOTE address entries; those entries alone are not evidence of a verified deployment or equivalent behavior on another network. The membership and credential addresses above are Ethereum mainnet contracts.

<details>
<summary>Membership and credential upgrade infrastructure</summary>

| Component | Ethereum address |
| --- | --- |
| Membership V3 implementation | [`0x225fd0fE7C3b326a297d1b716Cb330A1dECc8444`](https://etherscan.io/address/0x225fd0fE7C3b326a297d1b716Cb330A1dECc8444#code) |
| Credential V3 implementation | [`0x638B365f09b759947CE1e99C7c19d1764b099945`](https://etherscan.io/address/0x638B365f09b759947CE1e99C7c19d1764b099945#code) |
| Membership ProxyAdmin | [`0xCd99DDE40556c1724cd361395078368Fe80E7029`](https://etherscan.io/address/0xCd99DDE40556c1724cd361395078368Fe80E7029#code) |
| Credential ProxyAdmin | [`0x55c959ddA8D36C2F91F2443322ae5b8d5F559861`](https://etherscan.io/address/0x55c959ddA8D36C2F91F2443322ae5b8d5F559861#code) |
| Shared upgrade authority | [`0x54302a2A07298D28Ee41f6C61a280D9bD6d51765`](https://etherscan.io/address/0x54302a2A07298D28Ee41f6C61a280D9bD6d51765#code) |
| Root authority Safe (`bittrees.eth` at deployment) | [`0x1B6c450FaDB7c77191f152473FC2f79dC515FA77`](https://etherscan.io/address/0x1B6c450FaDB7c77191f152473FC2f79dC515FA77) |
| Research authority Safe / membership beneficiary (`research.bittrees.eth` at deployment) | [`0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f`](https://etherscan.io/address/0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f) |

Authority is tied to the configured addresses, not a fresh ENS-name lookup. The original Safes retain upgrade authority. An Executive credential does not grant upgrade rights or replace Safe approval requirements.

</details>

## Membership

- **Current membership only.** Legacy memberships do not grant access. Verification enumerates current-contract token IDs directly and checks ownership, active status, expiry and revocation on-chain; it does not depend on legacy NFT-indexer discovery.
- **Fresh mint.** Pay the current ETH mint price, which was initially zero and is administratively configurable. The original term was 360 days; the interface reads the current term. Gas is separate. A fresh mint creates a new token rather than extending an existing token.
- **Gift membership.** The fresh-mint tile accepts a recipient Ethereum address and calls `mintMembership(recipient)`. The recipient receives the token directly. This does not grant membership to the sender or issue credentials.
- **Renew or extend.** Existing holders select a token and number of days. The interface shows the current BIT-per-day rate, total BIT cost, and current/proposed expiry. Renewals use BIT only, with a bounded payment quote; there is no ETH renewal function. The BIT daily rate can be changed by contract administration.
- **Non-transferable and revocable.** Holders can burn their membership or individual credentials. Membership burning also burns its child credentials. Administrative revocation/burn and wallet-blocking controls remain contract-governed. Expired, revoked, burned or blocked membership does not grant access.

A transaction hash or successful receipt is not itself access: the app rechecks current membership. Verification failures show an error/retry state rather than treating the wallet as a new buyer. See the [membership rollout and gift flow](docs/membership-v2.md); V3 issuance behavior below supersedes that document's earlier Safe-only issuance sections.

## Credentials, roles and administration

Credentials are separate tokens in the credential registry, linked to a parent membership and displayed with it. Their validity depends on both their own state and the parent membership. Public metadata and labels are descriptive, not permission grants.

The contributor application and built-in catalog offer five role names:

| Credential | Type identifier | Application behavior |
| --- | --- | --- |
| Researcher | `research.role.researcher.v1` | Eligible active holders can accept and submit research requests. |
| Contributor | `research.role.contributor.v1` | Contributor recognition; no automatic extra administrative permission. |
| Assistant | `research.role.assistant.v1` | Moderation when permitted by the approved Roles policy. |
| Steward | `research.role.steward.v1` | Credential-definition creation and moderation when permitted by policy. |
| Executive | `research.role.executive.v1` | Direct credential issuance and moderation within contract and policy limits. Full app administration/review also requires the corresponding approved Roles permissions. |

On-chain type IDs are `keccak256(UTF8(type identifier))`. An application requests a role; it does not issue a credential or approve access.

**Admin → Roles separates definition from assignment.** Creating a definition saves a versioned type identifier and public HTTPS metadata reference in Research's signed catalog. It is not an on-chain type-registration transaction and does not mint a token. Assignment is a separate contract transaction. Ad hoc types do not gain permissions until explicitly mapped in Roles.

An active Executive credential holder can use `issueCredentialAsExecutive` from the owning wallet. **Only the primary administrators may issue Executive credentials.** Safe preparation remains available for administrator actions. Research and Roles verify current/finalized chain evidence, parent membership, deployment pins and policy; a pending transaction, arbitrary label or cached navigation link never authorizes an operation.

See [V3 issuance](docs/research-v3-issuance.md), [permission mapping](shared/research-permissions.mjs), and [native credential verification](server/research-native-authority.mjs). The separate [contributor memorandum contract project](contributor-review/contracts) is not the membership/credential proxy pair listed above; its preparation artifacts are not proof of an activated deployment.

## Application flows

| Area | Current behavior |
| --- | --- |
| Overview and sign-in | Connecting a wallet identifies an account; one ownership signature establishes the shared Research session. Overview, research requests and contributor records reuse that session. Access buttons recheck the server before requesting another proof. |
| Research library | Publications from the Paragraph feed, rendered in Research. |
| Research requests | An active member opens a brief; another active member with a valid Researcher credential accepts it, submits findings, and responds to revisions. The requester accepts completion or cancels with a reason. Briefs and findings are shared with active members. |
| Forum | Reading does not request a signature. Posts/replies are EAS transactions on Base; starting a discussion requires current Executive administration access, while members can propose discussions. |
| Contribute | Active members apply using the existing encrypted Base application flow. Contributor records support review, memorandum negotiation/consent and credential preparation. Existing records retain their own authenticated entry. |
| Chat | The navigation link opens [chat.bittrees.org](https://chat.bittrees.org) in a new tab. The retained `/chat` route contains the older XMTP/Push messenger; it is not the primary navigation destination. |
| BNOTE and BIT | BNOTE minting offers currently enabled payment tokens. BIT minting locks BNOTE; redemption burns BIT to retrieve BNOTE under the contract's calculation and fee rules. Required token approvals remain wallet transactions. |
| Admin | Current Roles policy and native Research credentials govern protected features. The last verified Admin link remains visible through temporary refresh errors or expired evidence; a fresh denial removes it. This navigation hint never authorizes protected actions. |

Research keeps its own visual design. A valid sign-in session does not replace membership, role or transaction checks. Initial authentication, transaction approval, memorandum consent and first-time decryption of encrypted legacy applications are distinct operations. See [research workflow](docs/research-requests.md), [contributor memorandum flow](docs/contributor-memorandum-flow.md), and the tracked [access follow-up](docs/research-access-followup.md).

## Development

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

Browser suites require the Playwright Chromium runtime. The [registry workflow](.github/workflows/registry.yml) uses Redis for integrated validation; the [membership/messenger workflow](.github/workflows/recovery.yml) lists the remaining release checks. Keep required coverage intact.

## Configuration and security

Start with [.env.example](.env.example), then configure the enabled server features. That template is not an exhaustive production secret inventory.

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

---

Informational only — not investment, legal, or tax advice, and not an offer to sell any security.
