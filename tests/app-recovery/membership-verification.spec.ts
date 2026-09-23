import {test,expect,type Page} from '@playwright/test';
import {setup} from './membership-fixture';
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
