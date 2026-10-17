import {test,expect} from '@playwright/test';
import {setup} from './membership-fixture';
test('current active membership grants access without legacy NFT indexer',async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,'v2-valid');try{
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toBeVisible();
  expect(app.stats().nftReads).toBe(0);
 }finally{await app.close();}
});
for(const mode of ['v2-revoked','v2-blocked'] as const)test(`${mode} denies access even with an unexpired owned token`,async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,mode);try{
  if(mode==='v2-blocked')await expect(app.page.getByText(/This wallet is blocked/)).toBeVisible();
  else await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
 }finally{await app.close();}
});

test('legacy-only holdings never grant access or trigger legacy discovery',async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,'legacy-only');try{
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
  expect(app.stats().checks).toBeGreaterThan(0);expect(app.stats().nftReads).toBe(0);
 }finally{await app.close();}
});

test('new holders see only fresh minting; existing holders get a separate renewal flow',async({browser,baseURL})=>{
 const empty=await setup(browser,baseURL!,'empty',false,false,true);try{
  await expect(empty.page.getByRole('region',{name:'Mint a fresh membership'})).toBeVisible();
  const fresh=empty.page.getByRole('region',{name:'Mint a fresh membership'});
  await fresh.getByText('Gift a membership',{exact:true}).click();
  await expect(fresh.getByLabel('Recipient wallet address')).toBeVisible();
  await expect(empty.page.getByRole('region',{name:'Renew or extend membership'})).toHaveCount(0);
 }finally{await empty.close();}
 const member=await setup(browser,baseURL!,'v2-valid',false,false,true);try{
  await expect(member.page.getByRole('heading',{name:'Members Chat',exact:true})).toBeVisible();
  await member.page.locator('a[href="/membership"]').first().click();
  await expect(member.page.getByRole('region',{name:'Renew or extend membership'})).toBeVisible();
  await expect(member.page.getByRole('region',{name:'Mint a fresh membership'})).toBeVisible();
  await expect(member.page.getByText('Current expiration',{exact:true})).toBeVisible();
  await expect(member.page.getByText('Proposed expiration',{exact:true})).toBeVisible();
 }finally{await member.close();}
});
