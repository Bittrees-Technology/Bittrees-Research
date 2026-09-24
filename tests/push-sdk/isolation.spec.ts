import { readFileSync } from 'node:fs';
const corpus = JSON.parse(readFileSync(new URL('../../scripts/fixtures/uri-decoder-corpus.json', import.meta.url), 'utf8'));
import { test, expect } from '@playwright/test';
test('patched UUID browser resolution preserves real Push payload and stream identifiers without network access', async ({ page, baseURL }) => {
  const external: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto('/'); await expect(page.locator('body')).toHaveText('Ready');
  const ids = await page.evaluate(() => (window as any).checkPushUuid());
  const all = [...ids.payloads, ids.stream];
  expect(new Set(all).size).toBe(33);
  for (const id of all) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(external).toEqual([]);
});
test('encrypted group secrets do not cross wallet keys and recovery stays with the bound provider', async ({ page, baseURL }) => {
  let secretRequests = 0; const external: string[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === 'https://backend.epns.io/apis/v1/chat/encryptedsecret/sessionKey/synthetic-session-key' && route.request().method() === 'GET') {
      secretRequests++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ encryptedSecret: await page.evaluate(() => (window as any).encryptedSecret) }) });
    }
    if (url.origin === new URL(baseURL!).origin) return route.continue();
    external.push(url.href); return route.abort();
  });
  await page.goto('/'); await expect(page.locator('body')).toHaveText('Ready');
  expect(await page.evaluate(() => (window as any).checkPushIsolation())).toEqual({ firstRead: 'Private room content', secondRead: 'Unable to Decrypt Message', absentRecovery: true, absentPublicKey: true, boundRecovery: true, wrongProviderCalls: 0, staleRejected: true });
  expect(secretRequests).toBe(2); expect(external).toEqual([]);
});

test('built decoder preserves query and pairing semantics and bounds malformed input', async ({ page, baseURL }) => {
  const external: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(baseURL!).origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await page.goto('/'); await expect(page.locator('body')).toHaveText('Ready');
  // Preserve special own keys across Playwright serialization.
  const result = JSON.parse(await page.evaluate(() => (window as any).checkUriCompatibility()));
  expect(result).toEqual({
    query: corpus.query.map(({ output }: { output: unknown }) => output), fragment: corpus.fragment, malformedPreserved: true,
    pairing: { protocol: '', topic: 'a'.repeat(64), version: 2, symKey: 'b'.repeat(64), relay: { protocol: 'irn' }, methods: ['eth_sendTransaction', 'personal_sign'], expiryTimestamp: 2000000000 },
  });
  expect(external).toEqual([]);
});
