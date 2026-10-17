import { test, expect } from '@playwright/test';
import { setup } from './membership-fixture';
// Empty current-contract ownership plus empty legacy discovery must not grant access.
test('membership NFT client accepts an empty membership response without granting member access', async ({ browser, baseURL }) => {
 const app=await setup(browser,baseURL!,'empty');
 try {
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  expect(app.stats().checks).toBeGreaterThan(0);
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
 }finally{await app.close();}
});
test('retired recovery URL has no tool or navigation link',async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,'empty');try{
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  await expect(app.page.getByRole('link',{name:'Recover local data for Chat'})).toHaveCount(0);
  await expect(app.page.getByRole('link',{name:'Apply as a contributor'})).toHaveCount(0);
  await expect(app.page.getByText('Contributor applications open after your membership is active.')).toBeVisible();
  await app.page.goto('/chat-recovery');
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  await expect(app.page.getByRole('button',{name:'Review export'})).toHaveCount(0);
  await expect(app.page.getByRole('region',{name:'Export local data to Chat'})).toHaveCount(0);
 }finally{await app.close();}
});
