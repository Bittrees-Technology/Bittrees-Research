import { test, expect } from '@playwright/test';
import { setup } from './membership-fixture';
// Empty current-contract ownership plus empty legacy discovery must not grant access.
test('membership NFT client accepts an empty membership response without granting member access', async ({ browser, baseURL }) => {
 const app=await setup(browser,baseURL!,'empty');
 try {
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  expect(app.stats().checks).toBeGreaterThan(0);
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
  await app.page.getByRole('link',{name:'Recover local data for Chat',exact:true}).click();
  await expect(app.page.getByRole('button',{name:'Review export',exact:true})).toBeEnabled();
 }finally{await app.close();}
});
