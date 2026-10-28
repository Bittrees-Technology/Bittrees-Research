# Bittrees Research

**A member workspace for research, collaboration and credentials.**

Bittrees Research brings publications, member research requests, contributor applications and credential management into one application. Members can join or renew, collaborate on research, and manage their BNOTE and BIT holdings through the connected contract interfaces.

[Open Research](https://research.bittrees.org) · [Membership](https://research.bittrees.org/membership) · [Chat](https://chat.bittrees.org) · [Developer guide](docs/development.md)

## Explore the application

| Area | What you can do |
| --- | --- |
| Research library | Read publications from the Bittrees Research feed. |
| Research requests | Submit a brief as an active member. Holders of an active Researcher credential can accept work, submit findings and respond to revisions; the requester reviews completion. |
| Membership | Mint a membership for yourself or another wallet, or renew an existing membership with BIT. |
| Contribute | Apply for a role as an active member and follow the application, review and memorandum process. |
| Forum | Read discussions and participate through the supported proposal, post and reply flows. |
| Credentials | View membership-linked credentials. Authorized users can define credential types and assign credentials in separate workflows. |
| BNOTE and BIT | Use the enabled minting and redemption interfaces, with prices and eligibility determined by the contracts. |

Research reuses a verified wallet session across its protected application views. Membership and role checks still apply to each protected action. Transactions, token approvals, memorandum consent and first-time decryption of legacy applications retain their own authorization requirements.

## Verified smart contracts

All addresses below are on **Ethereum mainnet (chain ID 1)**. Explorer statuses were checked on **19 October 2026**.

Use **Read data** to inspect live contract state without connecting a wallet. For tokens, these links open **Read as Proxy**, which uses the implementation's ABI against the token's own state. Use the token proxy addresses for application integrations and token interactions.

**Exact Match** means Etherscan verified the submitted source and deployment match. **Similar Match** means Etherscan exposes source and an ABI from a matching deployed contract; it is not an exact verification of that address's deployment inputs. Source verification is not a security audit.

### Tokens and membership

| Contract | Ethereum address | Proxy source status | Explorer and interface |
| --- | --- | --- | --- |
| **BIT — Bittrees Index Token** | `0x57A447E4d5e18A9423408C365963A73F08B9d18C` | Similar Match | [Source](https://etherscan.io/address/0x57A447E4d5e18A9423408C365963A73F08B9d18C#code) · [Read data](https://etherscan.io/address/0x57A447E4d5e18A9423408C365963A73F08B9d18C#readProxyContract) · [ABI](src/lib/constants/bit.abi.json) |
| **BNOTE** | `0xf1AAfFc982B5F553a730a9eC134715a547f1fe80` | Exact Match | [Source](https://etherscan.io/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80#code) · [Read data](https://etherscan.io/address/0xf1AAfFc982B5F553a730a9eC134715a547f1fe80#readProxyContract) · [ABI](src/lib/constants/bnote.abi.json) |
| **Research membership** | `0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335` | Exact Match | [Source](https://etherscan.io/address/0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335#code) · [Read data](https://etherscan.io/address/0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335#readProxyContract) · [ABI](src/lib/constants/membership.abi.json) |
| **Research credentials** | `0x335708826d76302E5014E6Ca41564482e38AA8B2` | Exact Match | [Source](https://etherscan.io/address/0x335708826d76302E5014E6Ca41564482e38AA8B2#code) · [Read data](https://etherscan.io/address/0x335708826d76302E5014E6Ca41564482e38AA8B2#readProxyContract) · [ABI](src/lib/constants/credentials.abi.json) |

BIT is used for membership renewals and the BNOTE-backed mint/redemption interface. BNOTE provides the preferred-stock token interface. Research membership and credentials are non-transferable tokens; credentials are linked to a parent membership.

### Implementation source

Each implementation below has **Exact Match** source verification. Read token balances, membership expiry and credential state through the proxies above; implementations identify the code used by those proxies.

| Implementation | Ethereum address | Source |
| --- | --- | --- |
| BIT | `0xa27b118c0770939295f052ae1b003366e5ef806f` | [Verified source](https://etherscan.io/address/0xa27b118c0770939295f052ae1b003366e5ef806f#code) |
| BNOTE | `0x0358631d5b844a06f001946ceb88112530046cbf` | [Verified source](https://etherscan.io/address/0x0358631d5b844a06f001946ceb88112530046cbf#code) |
| Membership V3 | `0x225fd0fE7C3b326a297d1b716Cb330A1dECc8444` | [Verified source](https://etherscan.io/address/0x225fd0fE7C3b326a297d1b716Cb330A1dECc8444#code) |
| Credentials V3 | `0x638B365f09b759947CE1e99C7c19d1764b099945` | [Verified source](https://etherscan.io/address/0x638B365f09b759947CE1e99C7c19d1764b099945#code) |

### Administration and upgrade authority

| Component | Ethereum address | Source status | Explorer |
| --- | --- | --- | --- |
| Membership ProxyAdmin | `0xCd99DDE40556c1724cd361395078368Fe80E7029` | Exact Match | [Source](https://etherscan.io/address/0xCd99DDE40556c1724cd361395078368Fe80E7029#code) · [Read data](https://etherscan.io/address/0xCd99DDE40556c1724cd361395078368Fe80E7029#readContract) |
| Credential ProxyAdmin | `0x55c959ddA8D36C2F91F2443322ae5b8d5F559861` | Similar Match | [Source](https://etherscan.io/address/0x55c959ddA8D36C2F91F2443322ae5b8d5F559861#code) · [Read data](https://etherscan.io/address/0x55c959ddA8D36C2F91F2443322ae5b8d5F559861#readContract) |
| Shared upgrade authority | `0x54302a2A07298D28Ee41f6C61a280D9bD6d51765` | Exact Match | [Source](https://etherscan.io/address/0x54302a2A07298D28Ee41f6C61a280D9bD6d51765#code) · [Read data](https://etherscan.io/address/0x54302a2A07298D28Ee41f6C61a280D9bD6d51765#readContract) |
| Root authority Safe | `0x1B6c450FaDB7c77191f152473FC2f79dC515FA77` | Similar Match | [Source](https://etherscan.io/address/0x1B6c450FaDB7c77191f152473FC2f79dC515FA77#code) · [Read data](https://etherscan.io/address/0x1B6c450FaDB7c77191f152473FC2f79dC515FA77#readProxyContract) |
| Research authority Safe / beneficiary | `0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f` | Similar Match | [Source](https://etherscan.io/address/0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f#code) · [Read data](https://etherscan.io/address/0x2F8f86e6E1Ff118861BEB7E583DE90f0449A264f#readProxyContract) |

The credential ProxyAdmin automatically inherits Etherscan's Similar Match source from the identical membership ProxyAdmin. Its live `owner()` read returns the shared upgrade authority. Etherscan currently does not permit a separate exact-match submission for that address with the verification session used.

The Root and Research Safes resolved from `bittrees.eth` and `research.bittrees.eth` at deployment. Contract authority follows the configured **addresses**, not subsequent ENS changes. Both original Safes retain upgrade authority, subject to their Safe approvals. Executive credentials grant no upgrade rights.

The [deployment manifest](src/lib/constants/research-deployment.json) records the Research implementations, runtime hashes and authority addresses. The [token configuration](src/lib/constants/contracts.ts) records token addresses. Base and testnet configuration entries are separate from the verified Ethereum deployment documented here.

## Membership

- **Join or gift.** Mint a fresh membership for your wallet or a recipient address at the current ETH mint price. The configured price may be zero; network gas applies separately.
- **Renew with BIT.** Existing holders select the membership and number of days. The app displays the current daily BIT rate, total cost, current expiry and proposed expiry. ETH is used for fresh minting; renewals use BIT.
- **Keep credentials together.** Credentials remain linked to their parent membership. Burning a membership also burns its child credentials; holders can burn individual credentials independently.
- **Current eligibility.** Access requires an active membership in the current contract. Expiry, revocation, burning and wallet restrictions are checked on-chain. Legacy memberships do not grant access.

Mint prices and the daily BIT renewal rate are administratively configurable. The application reads contract values rather than treating this README as a price quote. See the [membership guide](docs/membership-v2.md) for the mint, gift and renewal flows; [V3 issuance](docs/research-v3-issuance.md) documents current credential authority.

## Credentials and roles

Credentials are separate non-transferable tokens, displayed with their parent membership. Their validity depends on their own status and an active parent membership. The contributor application offers five roles:

| Role | Credential type | Scope |
| --- | --- | --- |
| Researcher | `research.role.researcher.v1` | Accept and complete member research requests. |
| Contributor | `research.role.contributor.v1` | Contributor recognition. |
| Assistant | `research.role.assistant.v1` | Moderation under the approved Roles policy. |
| Steward | `research.role.steward.v1` | Credential-definition creation and moderation under policy. |
| Executive | `research.role.executive.v1` | Direct credential issuance within contract limits; administration, application review and moderation require the corresponding Roles permissions. |

**Definition and assignment are separate.** Creating a credential definition saves its type and public metadata in Research's signed catalog. Issuing it to a member is an on-chain transaction. Additional types can be defined over time; they gain application permissions only through explicit Roles mappings.

Active Executive credential holders can issue eligible credentials directly from their wallet. **Only the primary contract administrators can issue Executive credentials.** Applying for a role, creating a label or submitting a transaction does not itself grant access. Research and Roles verify current credentials, parent membership and policy before authorizing protected actions.

## Documentation

- [Development, configuration and release checks](docs/development.md)
- [Research request workflow](docs/research-requests.md)
- [Membership, renewal and gifting](docs/membership-v2.md)
- [V3 credential issuance and authority](docs/research-v3-issuance.md)
- [Contributor journey and private intake](docs/contributor-guided-flow.md)
- [Contributor memorandum workflow](docs/contributor-memorandum-flow.md)
- [Session and access verification notes](docs/research-access-followup.md)
- [Permission mappings](shared/research-permissions.mjs)

## Bittrees ecosystem

Research works alongside [Bittrees, Inc.](https://gov.bittrees.org) and [Bittrees Capital](https://capital.bittrees.org), with [Roles](https://roles.bittrees.org) for shared permissions and [Chat](https://chat.bittrees.org) for conversations.

Licensed under the [MIT License](LICENSE).

---

Informational only — not investment, legal, or tax advice, and not an offer to sell any security.
