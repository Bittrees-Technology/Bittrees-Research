# Research publication and search privacy

The Research app is a private member workspace. Drafts, requests, member and
administrator views, registry data, and API responses must not be submitted for
search indexing. All app routes carry noindex directives. These directives are
indexing controls; authorization protects member data separately.

Public research remains on the existing approved Paragraph publication,
https://paragraph.com/@bresearch. The app reads that publication's public RSS
feed. This repository contains no draft-to-Paragraph publishing or sync-status
manifest. A feed entry is not permission to expose a local workspace or draft.
Do not create a Research homepage sitemap, new public mirrors, or local public
article routes from private records. A future public exception requires an
explicit publication decision, successful Paragraph sync, and an authoritative
public URL. Unknown or failed publication state remains private.

Registry reads and mutations at /api/community and /api/rooms require the existing verified
Research wallet session, matching browser wallet, and fresh active membership.
The server checks before reading the registry and checks read-evidence expiry
before serializing a GET response. Mutation envelope signers must match that
session wallet; existing signed action authority and replay checks remain in
force. Successful POST responses contain only {ok, revision}, never registry
snapshots. This bounded acknowledgement can be returned after a committed
mutation even if the initial membership proof expires during the operation.
Responses are private/no-store at browser and CDN layers. Clients bind GET and
POST requests to the current wallet header and defer
these reads until the existing server session matches the connected wallet and
use wallet-scoped, uncached-after-unmount query data. The membership gate remains on the member layout. Forum, chat, and the
registry-backed administration panels use the existing wallet-verification
protocol before mounting. Contributor and research request views retain their
own server session and authorization checks.

The forum's existing publication function writes plaintext title/body data to a
public Base EAS attestation. New discussions, proposals and replies are paused
in both the UI and publication helper. The existing encrypted contributor
application channel remains available with its existing envelope format;
envelope format validation is not proof of cryptographic correctness. It does
not permit plaintext drafts or private titles to use that exception.

If historical forum attestations exist, they remain public and immutable outside
this app. Search exclusions and API authorization cannot make public blockchain
records confidential. This change neither deletes nor republishes historical
records and makes no claim about the contents of live records.

Release verification must exercise disconnected, wrong-wallet, expired-session,
expired-membership, valid-member and backend-unavailable cases in the deployed
app, including wallet switching, sign-out and signed registry mutations. Verify
the noindex/cache headers on actual responses and confirm new forum actions
open no wallet transaction. Only already approved Paragraph publications are
eligible for public discovery. Paragraph-hosted URLs are outside the
sc-domain:bittrees.org Search Console property unless served on its domain.
