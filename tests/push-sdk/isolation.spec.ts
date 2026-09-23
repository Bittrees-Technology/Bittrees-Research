import { test, expect } from '@playwright/test';
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
