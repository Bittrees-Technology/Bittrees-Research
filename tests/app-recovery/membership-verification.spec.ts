import { test, expect, type Browser, type Page } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, parseAbi } from 'viem';
const owner = `0x${'1'.repeat(40)}`, other = `0x${'2'.repeat(40)}`;
const contract = '0xc8121e650bd797d8b9dad00227a9a77ef603a84a';
const abi = parseAbi(['function balanceOf(address,uint256) view returns (uint256)', 'function isExpired(uint256) view returns (bool)', 'function expirationTimestamps(uint256) view returns (uint256)']);
type Mode = 'valid' | 'failed' | 'missing' | 'expired' | 'zero' | 'transferred' | 'empty' | 'loop' | 'hang' | 'expiring';
async function setup(browser: Browser, baseURL: string, initial: Mode, cached = false, clock = false) {
  const context = await browser.newContext();
  let mode = initial, nftReads = 0, calls = 0, release = () => {};
  const writes: string[] = [], balances: string[] = [];
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'eth-mainnet.g.alchemy.com' && url.pathname.endsWith('/getNFTs')) {
      nftReads++; expect(request.method()).toBe('GET');
      const requestedOwner = url.searchParams.get('owner')?.toLowerCase();
      expect([owner, other]).toContain(requestedOwner);
      expect(url.searchParams.getAll('contractAddresses[]')).toEqual([contract]);
      if (mode === 'hang') await held;
      return route.fulfill({ json: { ownedNfts: mode === 'empty' || requestedOwner === other ? [] : [{ contract: { address: contract }, id: { tokenId: '0x01', tokenMetadata: { tokenType: 'ERC1155' } }, title: 'Synthetic membership', media: [], balance: '1' }], totalCount: 1, ...(mode === 'loop' ? { pageKey: 'repeated' } : {}) } });
    }
    if (url.hostname === 'eth.merkle.io' && request.method() === 'POST') {
      const input = request.postDataJSON();
      const respond = (rpc: any) => {
        if (rpc.method === 'eth_blockNumber') return { jsonrpc: '2.0', id: rpc.id, result: '0x1000000' };
        if (rpc.method !== 'eth_call') return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Synthetic read-only RPC' } };
        let outer: any;
        try { outer = decodeFunctionData({ abi: multicall3Abi, data: rpc.params[0].data }); } catch { return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Unrelated read unavailable' } }; }
        const batch = outer.args[0];
        const membership = batch.every((item: any) => item.target.toLowerCase() === contract);
        if (!membership) return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Unrelated read unavailable' } };
        try { batch.forEach((item: any) => decodeFunctionData({ abi, data: item.callData })); } catch { return { jsonrpc:'2.0', id:rpc.id, error:{code:-32000,message:'Unrelated membership read unavailable'} }; }
        calls++; expect(rpc.params[1]).toBe('0x1000000');
        const returned = batch.map((item: any) => {
          const decoded = decodeFunctionData({ abi, data: item.callData });
          if (decoded.functionName === 'balanceOf') { expect(decoded.args[0].toLowerCase()).toBe(owner); balances.push(decoded.args[0]); }
          const value = decoded.functionName === 'balanceOf' ? (mode === 'transferred' ? 0n : 1n)
            : decoded.functionName === 'isExpired' ? mode === 'expired'
            : mode === 'zero' ? 0n : BigInt(Math.floor(Date.now() / 1000) + (mode === 'expiring' ? 3 : 3600));
          return { success: !(mode === 'failed' && decoded.functionName === 'isExpired'), returnData: encodeFunctionResult({ abi, functionName: decoded.functionName, result: value } as any) };
        });
        if (mode === 'missing') returned.pop();
        return { jsonrpc: '2.0', id: rpc.id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: returned }) };
      };
      return route.fulfill({ json: Array.isArray(input) ? input.map(respond) : respond(input) });
    }
    if (url.origin === baseURL && ['GET','HEAD'].includes(request.method())) return route.continue();
    if (url.origin === baseURL) writes.push(url.pathname);
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ owner, other, contract, cached }) => {
    if (cached) {
      localStorage.setItem(`br_membership_${owner}`, JSON.stringify([{ tokenId: '1', isExpired: false, expiresAt: 9999999999 }]));
      localStorage.setItem(`br_nfts_1_${owner}_${contract}`, JSON.stringify([{ tokenId: '1', contract: { address: contract } }]));
    }
    let connected = false, address = owner, chain = '0x1';
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(fn => fn(value));
    (window as any).__membershipChange = (kind: string) => {
      if (kind === 'account') { address = other; emit('accountsChanged', [address]); }
      if (kind === 'return') { address = owner; emit('accountsChanged', [address]); }
      if (kind === 'chain') { chain = '0x2105'; emit('chainChanged', chain); }
      if (kind === 'disconnect') { connected = false; emit('accountsChanged', []); emit('disconnect', {code:4900,message:'Synthetic disconnect'}); }
    };
    const provider = { isMetaMask: true,
      on(event: string, fn: (...args: any[]) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
      removeListener(event: string, fn: (...args: any[]) => void) { listeners.get(event)?.delete(fn); },
      async request({ method }: { method: string }) {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return chain;
        throw Error('Synthetic wallet refuses ' + method);
      },
    };
    (window as any).ethereum = provider;
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'e8fedc6a-9159-4b34-8591-68a4b95bc728', name: 'MetaMask', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'io.metamask' }, provider } }));
    window.addEventListener('eip6963:requestProvider', announce); announce();
  }, { owner, other, contract, cached });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  const connect = async () => { await page.getByRole('button', { name: 'Connect Wallet', exact: true }).first().click(); await page.getByRole('button', { name: /^MetaMask(?:\s|$)/ }).click(); };
  await page.goto('/chat'); await connect();
  return { page, context, connect, setMode: (value: Mode) => { mode = value; }, release,
    stats: () => ({ nftReads, calls, writes, balances }), close: async () => { release(); expect(writes).toEqual([]); await context.close(); } };
}
const member = (page: Page) => page.getByRole('heading', { name: 'Members Chat', exact: true });
for (const mode of ['failed', 'missing', 'expired', 'zero', 'transferred', 'loop'] as const) {
  test(`membership denies ${mode} evidence and preserves recovery access`, async ({browser, baseURL}) => {
    const app = await setup(browser, baseURL!, mode);
    try {
      await expect(app.page.getByRole('heading', { name: /Membership verification unavailable|Your membership has expired|Join Bittrees Research/ })).toBeVisible({ timeout: 20000 });
      await expect(member(app.page)).toHaveCount(0);
      expect(app.stats().nftReads).toBeGreaterThan(0);
      if (mode !== 'loop') expect(app.stats().calls).toBeGreaterThan(0);
      await app.page.getByRole('link', { name: 'Recover local data for Chat', exact: true }).click();
      await expect(app.page.getByRole('button', { name: 'Review export', exact: true })).toBeEnabled();
    } finally { await app.close(); }
  });
}
test('forged local caches cannot grant membership while verification is pending or timed out; retry succeeds', async ({browser, baseURL}, info) => {
  const app = await setup(browser, baseURL!, 'hang', true);
  try {
    await expect(app.page.getByText('Verifying membership…', {exact:true})).toBeVisible();
    await expect(member(app.page)).toHaveCount(0);
    await expect(app.page.getByRole('heading', {name:'Membership verification unavailable'})).toBeVisible({timeout:20000});
    await expect(member(app.page)).toHaveCount(0);
    await app.page.setViewportSize({width:390,height:844});
    await app.page.getByRole('heading', {name:'Membership verification unavailable'}).scrollIntoViewIfNeeded();
    expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await app.page.screenshot({path:info.outputPath('membership-error-mobile.png')});
    app.setMode('valid'); app.release();
    await app.page.getByRole('button', {name:'Retry membership check'}).click();
    await expect(member(app.page)).toBeVisible(); expect(app.stats().balances.length).toBeGreaterThan(0);
  } finally { await app.close(); }
});
for (const change of ['account', 'chain', 'disconnect'] as const) {
  test(`verified membership is invalidated on ${change}, with fresh evidence required`, async ({browser, baseURL}) => {
    const app = await setup(browser, baseURL!, 'valid');
    try {
      await expect(member(app.page)).toBeVisible();
      const priorReads = app.stats().nftReads; app.setMode('hang');
      await app.page.evaluate(change => (window as any).__membershipChange(change), change);
      await expect(member(app.page)).toHaveCount(0);
      if (change === 'disconnect') await app.connect();
      await expect.poll(() => app.stats().nftReads).toBeGreaterThan(priorReads);
      await expect(member(app.page)).toHaveCount(0);
      app.setMode('valid'); app.release();
      if (change === 'account') {
        await expect(app.page.getByRole('heading', {name:'Join Bittrees Research'})).toBeVisible();
        await app.page.evaluate(() => (window as any).__membershipChange('return'));
      }
      await expect(member(app.page)).toBeVisible();
    } finally { await app.close(); }
  });
}
test('a delayed old-wallet verification cannot open the new wallet session', async ({browser, baseURL}) => {
  const app = await setup(browser, baseURL!, 'hang');
  try {
    await expect.poll(() => app.stats().nftReads).toBe(1);
    await app.page.evaluate(() => (window as any).__membershipChange('account'));
    await expect.poll(() => app.stats().nftReads).toBe(2);
    app.setMode('valid'); app.release();
    await expect(app.page.getByRole('heading', {name:'Join Bittrees Research'})).toBeVisible();
    await expect(member(app.page)).toHaveCount(0); expect(app.stats().balances).toEqual([]);
  } finally { await app.close(); }
});

test('membership access ends at token expiry without a route change', async ({browser, baseURL}) => {
  const app = await setup(browser, baseURL!, 'expiring');
  try {
    await expect(member(app.page)).toBeVisible();
    await expect(app.page.getByRole('heading', {name:'Your membership has expired'})).toBeVisible({timeout:7000});
    await expect(member(app.page)).toHaveCount(0);
  } finally { await app.close(); }
});
test('a failed periodic refresh removes access and settles on explicit retry', async ({browser, baseURL}) => {
  const app = await setup(browser, baseURL!, 'valid', false, true);
  try {
    await expect(member(app.page)).toBeVisible();
    app.setMode('failed');
    await app.page.clock.fastForward(30_100);
    await expect(app.page.getByRole('heading', {name:'Membership verification unavailable'})).toBeVisible();
    await expect(member(app.page)).toHaveCount(0);
    const requests = app.stats().nftReads;
    await app.page.clock.fastForward(60_100);
    expect(app.stats().nftReads).toBe(requests);
    expect(requests).toBe(2);
  } finally { await app.close(); }
});
