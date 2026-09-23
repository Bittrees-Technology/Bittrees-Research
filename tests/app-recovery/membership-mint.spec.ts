import {test,expect} from '@playwright/test';
import {setup} from './membership-fixture';

test('built app preserves a confirmed synthetic mint through delayed discovery, failure and local recovery',async({browser,baseURL},info)=>{
 const app=await setup(browser,baseURL!,'empty',false,false,true);
 try {
  await app.page.getByRole('button',{name:/^Join —/}).click();
  await expect.poll(()=>app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
  app.confirmTransaction();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toBeVisible({timeout:20000});
  await expect(app.page.getByRole('button',{name:'Check membership again'})).toBeEnabled();
  await expect(app.page.getByRole('button',{name:/^Join —/})).toHaveCount(0);
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
  await expect(app.page.getByRole('link',{name:'View confirmed transaction'})).toHaveAttribute('href',`https://etherscan.io/tx/${app.mintHash}`);
  app.setMode('failed');await app.page.getByRole('button',{name:'Check membership again'}).click();
  await expect(app.page.getByRole('alert')).toContainText('Your confirmed transaction is still recorded here');
  await app.page.setViewportSize({width:390,height:844});await app.page.getByRole('heading',{name:'Transaction confirmed',exact:true}).scrollIntoViewIfNeeded();
  expect(await app.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await app.page.screenshot({path:info.outputPath('mint-wait-mobile.png')});
  await app.page.getByRole('link',{name:'Recover local data for Chat',exact:true}).click();
  await expect(app.page.getByRole('button',{name:'Review export'})).toBeEnabled();
  await app.page.getByRole('link',{name:'Return to Research messenger'}).click();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toBeVisible();
  // Remounting after recovery can start a fresh query. Keep the failure fixture
  // until that query settles before offering valid evidence for an explicit retry.
  await expect(app.page.getByRole('alert')).toContainText('Your confirmed transaction is still recorded here');
  await expect(app.page.getByRole('button',{name:'Check membership again'})).toBeEnabled();
  app.setMode('valid');await app.page.getByRole('button',{name:'Check membership again'}).click();
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toBeVisible();
  expect(await app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
 } finally {await app.close();}
});

test('renewal confirmation remains pending while only the old membership is discoverable',async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,'valid',false,false,true);
 try {
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toBeVisible();
  await app.page.locator('a[href="/membership"]').first().click();
  await app.page.getByRole('button',{name:/^Renew —/}).click();
  await expect.poll(()=>app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
  app.confirmTransaction();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toBeVisible({timeout:20000});
  await expect(app.page.getByRole('button',{name:'Check membership again'})).toBeEnabled();
  await expect(app.page.getByRole('button',{name:/^Renew —/})).toHaveCount(0);
  app.setMode('hang');await app.page.getByRole('button',{name:'Check membership again'}).click();
  await expect(app.page.getByRole('button',{name:'Checking membership…'})).toBeDisabled();
  app.setMode('valid');app.release();
  await expect(app.page.getByRole('button',{name:'Check membership again'})).toBeEnabled();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toBeVisible();
  app.setMode('renewed');await app.page.getByRole('button',{name:'Check membership again'}).click();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toHaveCount(0);
  await expect(app.page.getByRole('button',{name:/^Renew —/})).toBeVisible();
  expect(await app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
 } finally {await app.close();}
});

test('built app clears the pending mint notice on a wallet change without carrying access',async({browser,baseURL})=>{
 const app=await setup(browser,baseURL!,'empty',false,false,true);
 try {
  await app.page.getByRole('button',{name:/^Join —/}).click();
  await expect.poll(()=>app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
  app.confirmTransaction();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toBeVisible({timeout:20000});
  await app.page.evaluate(()=>(window as any).__membershipChange('account'));
  await expect(app.page.getByRole('heading',{name:'Join Bittrees Research',exact:true})).toBeVisible();
  await expect(app.page.getByRole('heading',{name:'Transaction confirmed',exact:true})).toHaveCount(0);
  await expect(app.page.getByRole('heading',{name:'Members Chat',exact:true})).toHaveCount(0);
  expect(await app.page.evaluate(()=>(window as any).__mintTransactions)).toBe(1);
 } finally {await app.close();}
});
