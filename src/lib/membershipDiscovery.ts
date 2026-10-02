import { candidateTokenIds, MembershipReadError, MEMBERSHIP_UNAVAILABLE } from './membershipVerification.ts';

/** Keep the existing NFT API endpoint, but avoid metadata and SDK background retries. */
export async function discoverMembershipPage(apiKey: string, owner: string, contract: string, signal: AbortSignal, pageKey?: string) {
  const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v2/${encodeURIComponent(apiKey)}/getNFTs`);
  url.searchParams.set('owner', owner);
  url.searchParams.append('contractAddresses[]', contract);
  url.searchParams.set('withMetadata', 'false');
  if (pageKey) url.searchParams.set('pageKey', pageKey);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new MembershipReadError('The membership lookup service denied access. The site operator needs to check its API configuration.');
      }
      throw new MembershipReadError('The membership lookup service is unavailable. Please try again.',
        response.status === 408 || response.status === 429 || response.status >= 500);
    }
    const data = await response.json();
    if (!data || data.error || !Array.isArray(data.ownedNfts) || data.ownedNfts.length > 1_000) throw new Error(MEMBERSHIP_UNAVAILABLE);
    // The v2 wire format nests tokenId under id; metadata is irrelevant to ownership.
    const ids = candidateTokenIds(data.ownedNfts.map((nft: { id?: { tokenId?: unknown }; contract?: unknown } | null) =>
      ({ tokenId: nft?.id?.tokenId, contract: nft?.contract })), contract);
    return { ids, pageKey: data.pageKey as unknown };
  } catch (error) {
    if (signal.aborted) throw new Error(MEMBERSHIP_UNAVAILABLE);
    if (error instanceof MembershipReadError) throw error;
    if (controller.signal.aborted || error instanceof TypeError) {
      throw new MembershipReadError('The membership lookup service could not be reached. Please try again.', true);
    }
    throw new Error(MEMBERSHIP_UNAVAILABLE);
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', abort);
  }
}
