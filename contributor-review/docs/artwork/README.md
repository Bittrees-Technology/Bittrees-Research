# Contributor credential artwork and consent release

The credential uses the original `public/bittrees_logo_tree.png`, embedded byte-for-byte in each of 72 SVG cards. Its SHA-256 is `25d7f75c06fb2678e13f7c96da5b1274d2168263a3b6176a012dc08bb364a774`. Generated flag designs and the previous hand-drawn circle-tree approximation are not part of this release.

## Artwork and metadata

`ContributorArtwork.imageUri` selects a card from a fixed Git commit (`1fb88b5ba11bfc000f8feb87c3320483b2726d87`) in the public Gov repository. The path includes level, rank and display status. There is no image-base setter. Image availability depends on GitHub's asset hosting; the images are not stored on-chain. Each SVG embeds the original PNG and needs no further external image fetch. The original image is scaled proportionally without redrawing or changing its source pixels.

- Levels: Advisor, Part Time, Half Time, Full Time; text and one to four markers distinguish them.
- Recognition ranks: Contributor, Senior Contributor, Lead Contributor; text and one to three borders distinguish them.
- Standings: Active, Suspended, Ended, Revoked. Active records outside their term display Not yet effective or Expired.
- The card does not display a generic allocation weight that could contradict an individual's agreement. Exact weight, revision, level, rank and standing are in on-chain metadata. The token name includes its unique credential number; ownership remains on-chain.
- Partner authority is separate from the credential. Recognition rank does not multiply allocations or grant authority.
- Authorized amendments and standing changes emit metadata refresh events. Wallet/indexer refresh timing varies; time-based expiry changes returned metadata without emitting a transaction event.

Run `node scripts/build-contributor-artwork.mjs` and `node --test scripts/contributor-artwork.test.mjs` in Gov to regenerate and validate the cards. Research uses the same pinned Gov assets. Changing the committed asset content requires reviewing a new contract deployment, not overwriting an existing card at a mutable URL.

## Signed allocation terms

Standard relative weights are Full Time 1, Half Time 1/2, Part Time 1/6 and Advisor 1/10. Partner-approved individual exceptions require an explanation and fresh contributor acknowledgment. Fractions are normalized uint32 numerator/denominator pairs; denominator must be nonzero, and zero numerator represents no relative allocation.

Memorandum policy `contributor-policy-v3-credential-terms` includes an allocation notice in the hashed document. It does not promise a fixed BTREE payout, authorize payments or grant reissue claims. Monetary allocations require a separately approved funded policy and confirmed eligible contributions. Historical service does not create retroactive accrual. Legacy memoranda without these terms cannot authorize this release. Weight changes require newly signed terms. Token reissue remains deferred and is not activated here.

## Validation and release ordering

Run `forge test` in `contributor-review/contracts`. Tests cover all 72 artwork paths, future/expired terms, authorization, consent replay, exact custom weights, transfer restrictions, amendments, status changes, and the 24,576-byte runtime limit. The release runtime is 18,140 bytes. Hosted original-logo artwork was also rendered in a browser image context.

This replaces the old contract at `0x878158700D57b1f20c69A0871e9667c1eb2Da219`; it does not upgrade it. The replacement is prepared at `0x23Fe7Df0612dB13221c2eE6e8Cf2f8a972740A01` through TLD's root Safe CREATE2 package. Root remains `0x1B6c450FaDB7c77191f152473FC2f79dC515FA77`; Roles signer remains `0xb59ee6D9cc1fb532d3d1A2F590681e22E4ED6A49`.

Verify live old-contract issuance state and retire any stale prepared operation through the supported flow. The user must sign the reviewed TLD deployment; verify finalized runtime, root and signer afterward. Only then coordinate Gov, Research and Roles address/code-hash configuration and deploy the revised application ABI. Prepare a fresh memorandum and obtain raging.eth consent bound to the replacement contract before the root Safe issues credential #1. Verify finality, the directory, metadata and Roles profile. Never reuse the old contract's consent or prepared transaction.
