import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decryptRecoveryArchive } from '../../src/lib/chatRecoveryArchive';
const password = 'test-browser-passphrase';
async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Review export' })).toBeEnabled();
  const owner = await page.evaluate(() => {
    const owner = (window as any).testWallet.toLowerCase();
    localStorage.setItem(`bittrees.contacts.${owner}`, JSON.stringify([{ address: `0x${'2'.repeat(40)}`, label: 'Friend' }]));
    localStorage.setItem(`bittrees.dm.saved.${owner}`, JSON.stringify([{ id: 'saved-1', text: 'Private local note', sentAtMs: 123 }]));
    localStorage.setItem('bittrees.dm.settings', '{"readReceipts":true}');
    localStorage.setItem('bittrees.dm.prefs', JSON.stringify({ 'room:safe-gov.bittrees.eth': { pinned: true, order: 0, lastReadAt: 123 } }));
    return owner;
  });
  await page.getByRole('button', { name: 'Review export' }).click();
  await page.getByLabel('Recovery passphrase (at least 12 characters)').fill(password);
  await page.getByLabel('Confirm passphrase', { exact: true }).fill(password);
  return owner;
}
test('exports real encrypted data after wallet proof and preserves originals', async ({ page }, info) => {
  const owner = await prepare(page);
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('export-mobile.png'), fullPage: true });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Verify wallet and download' }).click();
  const download = await pending; const raw = await readFile((await download.path())!, 'utf8');
  const data = await decryptRecoveryArchive(raw, password, owner);
  expect(data.source).toBe('research'); expect(data.notes[0].text).toBe('Private local note');
  expect(data.preferences.readReceiptsDefault).toBe(false);
  await expect(page.getByRole('status')).toContainText('Encrypted file prepared');
  expect(await page.evaluate(owner => localStorage.getItem(`bittrees.dm.saved.${owner}`), owner)).toContain('Private local note');
  await page.getByRole('button', { name: 'Review export' }).click();
  await expect(page.getByLabel('Confirm passphrase', { exact: true })).toHaveValue('');
});
test('rejects changed data and requires a new review', async ({ page }) => {
  const owner = await prepare(page);
  await page.evaluate(owner => localStorage.setItem(`bittrees.contacts.${owner}`, '[]'), owner);
  await page.getByRole('button', { name: 'Verify wallet and download' }).click();
  await expect(page.getByRole('alert')).toContainText('Local data changed');
});
test('wallet disconnect during signing produces no download or leaked review', async ({ page }) => {
  await prepare(page); let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { (window as any).delayProof = true; });
  await page.getByRole('button', { name: 'Verify wallet and download' }).click();
  await page.waitForFunction(() => !!(window as any).finishProof);
  await page.evaluate(() => { (window as any).disconnect(); (window as any).finishProof(); });
  await expect(page.getByRole('button', { name: 'Review export' })).toBeDisabled();
  await expect(page.getByLabel('Confirm passphrase', { exact: true })).toHaveCount(0);
  expect(downloads).toBe(0);
});
test('shared settings are separately opted in and invalid source records remain visible failures', async ({ page }) => {
  const owner = await prepare(page);
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Review export' }).click();
  await page.getByText('Inspect data to include').click();
  await expect(page.getByText('Default receipts in file:', { exact: false })).toContainText('on');
  await page.evaluate(owner => localStorage.setItem(`bittrees.dm.saved.${owner}`, '{bad'), owner);
  await page.getByRole('button', { name: 'Review export' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(owner => localStorage.getItem(`bittrees.dm.saved.${owner}`), owner)).toBe('{bad');
});

test('source edits while wallet approval is pending cancel the encrypted download', async ({ page }) => {
  const owner = await prepare(page); let downloads = 0; page.on('download', () => downloads++);
  await page.evaluate(() => { (window as any).delayProof = true; });
  await page.getByRole('button', { name: 'Verify wallet and download' }).click();
  await page.waitForFunction(() => !!(window as any).finishProof);
  await page.evaluate(owner => { localStorage.setItem(`bittrees.dm.saved.${owner}`, '[]'); (window as any).finishProof(); }, owner);
  await expect(page.getByRole('alert')).toContainText('Local data changed');
  await expect(page.getByLabel('Confirm passphrase', { exact: true })).toHaveValue('');
  expect(downloads).toBe(0);
});

test('contract signature encoding reaches the connected-chain verifier', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => { (window as any).contractProof = true; });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Verify wallet and download' }).click();
  await pending;
  expect(await page.evaluate(() => (window as any).contractVerificationCalled)).toBe(true);
});
