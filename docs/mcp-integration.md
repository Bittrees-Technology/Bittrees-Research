# Research integration discovery

Research publishes its source-owned tool manifest in [`bittrees.tools.json`](../bittrees.tools.json). The existing Vite build emits that same metadata at [`/.well-known/bittrees-tools.json`](https://research.bittrees.org/.well-known/bittrees-tools.json). The central discovery endpoint is [Bittrees MCP](https://mcp.bittrees.org/mcp).

The manifest intentionally contains **zero connections and zero callable tools**. Research currently has no MCP endpoint, `tools/list` implementation, reviewed agent adapter or agent-specific authorization setup. The gateway's Research route allowlist is empty. A successfully synchronized empty manifest records that state; it does not establish execution support or private access.

## Existing API boundaries

These source-inspected HTTP APIs are existing application interfaces, **not MCP tools**. Their configuration and current availability must be checked by the existing caller. A catalog entry or API name never grants permission.

| Interface | Existing behavior | Authority and limits |
| --- | --- | --- |
| `GET /api/shared-roles-health` | Reports the shared Roles protocol and whether its key configuration is present. | Public configuration-presence metadata only; not a complete health or authorization check. |
| `GET /api/community` | Reads the public community registry, credential definitions and reviewer-key metadata. | These records do not establish current native credential validity or authorize writes. Writes retain signed requests and current source policy. |
| `GET /api/rooms` | Reads published room configuration and proposals. | Room eligibility and signed mutations keep their separate source checks. |
| `/api/contributors` | Session inspection, private application reads, private intake and authorized review actions. | Existing verified wallet session, same-origin POST, CSRF and fresh Research authority checks. Some reads can settle finalized intake and consume temporary keys, so they are not a general side-effect-free agent read API. |
| `/api/research-requests` | Private request board reads and member/researcher workflow actions. | Existing verified wallet session, matching wallet, same-origin POST, CSRF and current membership/credential eligibility. The wallet signature and session are not supplied by directory discovery. |
| `POST /api/contributors-profile` | Identity-scoped projection for the existing Roles service connection. | Existing signed request, identity binding, freshness, replay protection and configured service keys. It still contains legacy memorandum-shaped fields; it is not a native membership or role-credential authority adapter. |
| `POST /api/workflow-catalogue` | Subject-scoped workflow projection for the existing Workflows service connection. | Existing signed, expiring, replay-protected requests. The legacy contributor-planning projection is not Research role assignment, request-board acceptance or agent execution authority. |

No service keys, browser sessions, CSRF values, wallet signatures or credentials are published in this manifest or documentation. Existing authentication must not be weakened or converted into arbitrary bearer access for a new caller. No API is invoked by reading the manifest.

## Remaining adapter work

A callable Research integration needs a separate source review: choose bounded native Research reads or draft preparation, implement actual input/output contracts and `tools/list`, bind an existing approved caller to current source authority, and review its exact gateway route and setup. Preserve membership and credential checks, private application encryption, freshness, replay and revision protections, and all wallet/Safe approvals. A draft must remain a draft; it cannot silently submit, issue a credential, accept work or grant a role.

Until that review and implementation exist, keep `connections: []`. Do not list browser-session endpoints, legacy memorandum projections, or proposed future function names as callable MCP tools.
