import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByTestId('status')).toHaveText('idle'); });
test('fresh recovery removes only the matching old key and reload requires enabling again', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem(`bittrees.push.pgp.${(window as any).walletA}`, 'synthetic-key'); localStorage.setItem('keep', 'original'); });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  expect(await page.evaluate(() => localStorage.getItem(`bittrees.push.pgp.${(window as any).walletA}`))).toBeNull();
  expect(await page.evaluate(() => (window as any).sdkOptions)).toEqual([{ env: 'prod', autoUpgrade: false }]);
  await page.getByRole('button', { name: 'Toggle view' }).click(); await page.getByRole('button', { name: 'Toggle view' }).click();
  await expect(page.getByTestId('status')).toHaveText('ready');
  await page.reload(); await expect(page.getByTestId('status')).toHaveText('idle'); expect(await page.evaluate(() => localStorage.getItem('keep'))).toBe('original');
});
test('mismatched recovery key remains preserved and no client is exposed', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem(`bittrees.push.pgp.${(window as any).walletA}`, 'different-key'));
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('error');
  await expect(page.getByRole('alert')).toContainText('original is preserved'); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem(`bittrees.push.pgp.${(window as any).walletA}`))).toBe('different-key');
});
test('disconnect during initialization cannot restore a client on reconnect', async ({ page }) => {
  await page.evaluate(() => { (window as any).delaySignature = true; });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await page.waitForFunction(() => !!(window as any).finishSignature);
  await page.evaluate(() => { (window as any).disconnectWallet(); (window as any).connectA(); (window as any).finishSignature(); });
  await expect(page.getByTestId('status')).toHaveText('idle'); await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
});
test('root observer invalidates a disconnected session even when the room view is unmounted', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  await page.getByRole('button', { name: 'Toggle view' }).click();
  await page.evaluate(() => { (window as any).disconnectWallet(); (window as any).connectA(); });
  await page.getByRole('button', { name: 'Toggle view' }).click(); await expect(page.getByTestId('status')).toHaveText('idle');
});
for (const change of ['switchWallet', 'switchChain', 'switchConnector']) test(`${change} clears client and view state`, async ({ page }) => {
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  const before = await page.getByTestId('session-key').textContent(); await page.evaluate(change => (window as any)[change](), change);
  await expect(page.getByTestId('status')).toHaveText('idle'); await expect(page.getByTestId('session-key')).not.toHaveText(before!);
});
test('late creation cannot publish to the registry after disconnect', async ({ page }) => {
  let posts = 0; await page.route('**/api/rooms', async route => { if (route.request().method() === 'POST') posts++; await route.fulfill({ json: { revision: 1 } }); });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  await page.evaluate(() => { (window as any).delayAction = true; }); await page.getByRole('button', { name: 'Create and publish' }).click();
  await page.waitForFunction(() => !!(window as any).finishAction); await page.evaluate(() => { (window as any).disconnectWallet(); (window as any).finishAction(); });
  await expect(page.getByTestId('status')).toHaveText('idle'); await expect(page.getByTestId('result')).toHaveText(''); expect(posts).toBe(0);
});
test('disconnect during registry signing prevents the signed POST', async ({ page }) => {
  let posts = 0; await page.route('**/api/rooms', async route => { if (route.request().method() === 'POST') posts++; await route.fulfill({ json: { revision: 1 } }); });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  await page.evaluate(() => { (window as any).delaySignature = true; }); await page.getByRole('button', { name: 'Create and publish' }).click();
  await page.waitForFunction(() => !!(window as any).finishSignature); await page.evaluate(() => { (window as any).disconnectWallet(); (window as any).finishSignature(); });
  await expect(page.getByTestId('status')).toHaveText('idle'); expect(posts).toBe(0);
});
test('provider account is rechecked before sending even without an account-change event', async ({ page }) => {
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  await page.evaluate(() => (window as any).silentProviderSwitch());
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('status')).toHaveText('idle');
  expect(await page.evaluate(() => (window as any).sdkCalls)).toEqual([]);
});

test('legacy key recovery uses the bound wallet and does not invoke another injected wallet', async ({ page }) => {
  await page.evaluate(() => { (window as any).legacyRecovery = true; (window as any).ethereum = { request: () => { throw new Error('Wrong provider'); } }; });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await expect(page.getByTestId('status')).toHaveText('ready');
  expect(await page.evaluate(() => (window as any).recoveryCalls)).toEqual(['eth_decrypt']);
});
test('disconnect during legacy recovery cannot restore a client or retire its old key', async ({ page }) => {
  await page.evaluate(() => { (window as any).legacyRecovery = true; (window as any).delayRecovery = true; localStorage.setItem(`bittrees.push.pgp.${(window as any).walletA}`, 'synthetic-key'); });
  await page.getByRole('button', { name: 'Enable', exact: true }).click(); await page.waitForFunction(() => !!(window as any).finishRecovery);
  await page.evaluate(() => { (window as any).disconnectWallet(); (window as any).connectA(); (window as any).finishRecovery(); });
  await expect(page.getByTestId('status')).toHaveText('idle');
  expect(await page.evaluate(() => localStorage.getItem(`bittrees.push.pgp.${(window as any).walletA}`))).toBe('synthetic-key');
});
