import { test, expect } from '@playwright/test';

// Exercise the real bundled Alchemy SDK/Axios request path with an empty,
// synthetic response. No membership cache is seeded and no chain write is allowed.
test('patched NFT client accepts an empty membership response without granting member access', async ({ browser, baseURL }) => {
  const owner = `0x${'1'.repeat(40)}`;
  const context = await browser.newContext();
  let reads = 0;
  const writes: string[] = [];
  try {
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'eth-mainnet.g.alchemy.com' && url.pathname.endsWith('/getNFTs')) {
        expect(request.method()).toBe('GET');
        expect(url.searchParams.get('owner')?.toLowerCase()).toBe(owner);
        expect(url.searchParams.getAll('contractAddresses[]').map(value => value.toLowerCase())).toEqual(['0xc8121e650bd797d8b9dad00227a9a77ef603a84a']);
        reads++;
        return route.fulfill({ json: { ownedNfts: [], totalCount: 0, validAt: { blockNumber: 1, blockHash: `0x${'0'.repeat(64)}`, blockTimestamp: '2026-01-01T00:00:00Z' } } });
      }
      if (url.origin === baseURL && ['GET', 'HEAD'].includes(request.method())) return route.continue();
      if (url.origin === baseURL && !['GET', 'HEAD'].includes(request.method())) writes.push(url.pathname);
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(address => {
      let connected = false;
      const provider = { isMetaMask: true, on() {}, removeListener() {}, async request({ method }: { method: string }) {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return '0x1';
        throw new Error('Synthetic wallet refuses ' + method);
      } };
      (window as any).ethereum = provider;
      const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: {
        info: { uuid: 'e8fedc6a-9159-4b34-8591-68a4b95bc728', name: 'MetaMask', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'io.metamask' }, provider,
      } }));
      window.addEventListener('eip6963:requestProvider', announce); announce();
    }, owner);
    const page = await context.newPage();
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Connect Wallet', exact: true }).first().click();
    await page.getByRole('button', { name: 'MetaMask', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Join Bittrees Research', exact: true })).toBeVisible();
    expect(reads).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Members Chat', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Recover local data for Chat', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Review export', exact: true })).toBeEnabled();
    expect(writes).toEqual([]);
  } finally { await context.close(); }
});
