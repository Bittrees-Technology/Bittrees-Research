# Bittrees Research — `research.bittrees.org`

The members-only web app for **Bittrees Research**, the Bitcoin-denominated
capital-intake foundation of the Bittrees organization. It gates access to a valid
membership NFT and brings the research library, governance forum, member messaging,
and the on-chain token flows (BNOTE preferred stock, BIT index token) into one app
on the Bittrees Brand Standard design system.

Part of the Bittrees family of sites:
[bittrees.org](https://bittrees.org) · [gov.bittrees.org](https://gov.bittrees.org) ·
[capital.bittrees.org](https://capital.bittrees.org) · **research.bittrees.org**

## Features

- **Membership gate** — entry requires a non-expired ERC-1155 membership NFT, checked
  on-chain (`isExpired`, fail-closed). Non-members get a mint/renew flow.
- **Research library** — the native Bittrees Research feed, rendered from Paragraph's
  RSS (sanitized client-side); nothing private is published here.
- **Forum** — wallet-signed discussions recorded as EAS attestations on Base. Starting
  a discussion is Executive-only; any member can submit a discussion or research
  **proposal** for review.
- **Members Chat** — wallet-native direct messages over **XMTP** (V3/MLS) plus gated
  community rooms over **Push**, in a Telegram-style shell (DMs, requests, reactions,
  replies, read receipts, optional encrypted cross-device sync).
- **BNOTE** — mint Bittrees Research preferred stock; only on-chain *active* payment
  tokens are offered.
- **BIT** — lock BNOTE to mint the Bittrees Index Token, or redeem BIT back into BNOTE.
- **Structure** — where Research sits in the org and the on-chain token stack.
- **Admin** — role management for Executives (full admin + application review) and
  Assistants (moderation). The standing super-admin always has full access.
- **Contribute** — an encrypted-on-chain application form (apps are readable only by the
  applicant and the reviewing Executives).

## Stack

Vite 6 · React 19 · TypeScript · wagmi 2 / viem 2 · RainbowKit 2 · ethers 6 ·
react-router 7 · Tailwind v4 · `@xmtp/browser-sdk` 7 · `@pushprotocol/restapi` ·
audited `@noble/*` crypto. Serverless API on Vercel + Upstash KV (keys namespaced
`bittrees:research:*`).

## Local development

Requires Node 18+ and Yarn (Yarn 1 classic; this repo pins `yarn@1.22.22`).

```bash
yarn install
cp .env.example .env        # then fill in the values you need
yarn dev                    # http://localhost:3000
```

Other scripts:

```bash
yarn build        # tsc -b && vite build  → dist/
yarn preview      # serve the production build locally
yarn lint         # eslint
yarn test         # vitest run
```

To show Sepolia / Base Sepolia in the wallet picker: `VITE_ENABLE_TESTNETS=true yarn dev`.

## Environment

Copy `.env.example` and set the same values in the Vercel project. Summary:

| Variable | Side | Purpose |
| --- | --- | --- |
| `VITE_WALLETCONNECT_PROJECT_ID` | browser | WalletConnect/Reown id (injected wallets work without it) |
| `VITE_MAINNET_RPC_URL` | browser | Optional dedicated mainnet RPC (falls back to a public transport) |
| `VITE_ALCHEMY_API_KEY` | browser | Membership-NFT lookups; domain-restrict it on Alchemy |
| `VITE_ENABLE_TESTNETS` | browser | Show testnets in the wallet picker |
| `VITE_PUSH_ROOM_*` | browser | Optional Push room chatIds (the KV registry takes precedence) |
| `MAINNET_RPC_URL` | server | RPC for `/api/gate` reads — use a node with **no** domain restriction |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | server | Upstash KV for roles/rooms/moderation + cross-device sync |

The app runs without KV (built-in rooms via env, no custom rooms); membership gating and
the on-chain flows only need an RPC + a connected wallet.

## Project layout

```
api/                Vercel serverless — community (roles), gate, rooms, usersync (sync)
src/
  components/       layout (Header/Footer), forum, bnote/bit flows, messenger pieces
  pages/            Overview, Research, Forum, Messenger, Structure, Admin, members area
  hooks/            membership, payment tokens, Paragraph feed, Alchemy NFTs
  lib/              forum (EAS), xmtp, push, community/roles, userSync, appcrypto, links
```

## Deployment

Deploys to Vercel from `main`, served at `research.bittrees.org`. Set the environment
variables above in the Vercel project; connect an Upstash KV store for the roles/rooms
registry and cross-device messenger sync.

### Read-only release gate

Use the release gate before promotion, and again after any rollback. It never writes to
production; it only captures a baseline snapshot, validates a canary URL, and compares the
current surface back to the saved baseline.

```bash
yarn release:gate --mode baseline
yarn release:gate --mode canary --base-url https://<preview-host> --baseline output/release-gates/<baseline-run>/run.json
yarn release:gate --mode rollback-check --baseline output/release-gates/<baseline-run>/run.json
```

What it checks:

- SPA routes stay reachable (`/`, `/research`, `/forum`, `/chat`, `/membership`, `/bnote`,
  `/bit`, `/contribute`, `/admin`)
- `/api/community`, `/api/rooms`, `/api/usersync`, and the malformed-input `/api/gate`
  contract stay healthy
- Rollback verification compares status and structural response signatures to the saved
  baseline instead of trying to mutate live state

Each run writes `run.json` and `report.md` under `output/release-gates/`.

---

*Informational only — not investment, legal, or tax advice, and not an offer to sell any
security.*
