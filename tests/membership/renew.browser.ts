import {test,expect} from '@playwright/test';
test('BIT renewal approves only the displayed maximum and renews the same token',async({page})=>{
 await page.goto('/?renew');await page.evaluate(()=>(window as any).__membershipFixture('v2'));
 await expect(page.getByText('60 BIT',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Approve BIT and renew'}).click();
 await expect(page.getByText('Renewal confirmed. Checking current membership.')).toBeVisible();
 const writes=await page.evaluate(()=>(window as any).__renewWrites);
 expect(writes).toEqual([{functionName:'approve',args:['0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335','60000000000000000000']},{functionName:'renewMembership',args:['7','30','60000000000000000000']}]);
});
test('invalid day amounts cannot initiate a renewal',async({page})=>{
 await page.goto('/?renew');await page.evaluate(()=>(window as any).__membershipFixture('v2'));
 await page.getByLabel('Days to add').fill('0');await expect(page.getByRole('button',{name:'Approve BIT and renew'})).toBeDisabled();
 await page.getByLabel('Days to add').fill('1.5');await expect(page.getByRole('button',{name:'Approve BIT and renew'})).toBeDisabled();
 expect(await page.evaluate(()=>(window as any).__renewWrites)).toEqual([]);
});

test('renewal is hidden without an owned eligible token',async({page})=>{
 await page.goto('/?renew');await expect(page.getByLabel('Days to add')).toHaveCount(0);
 await page.evaluate(()=>(window as any).__membershipFixture('v2'));
 await expect(page.getByLabel('Days to add')).toBeVisible();
 await page.evaluate(()=>(window as any).__membershipFixture('empty'));
 await expect(page.getByLabel('Days to add')).toHaveCount(0);
});
test('days update BIT total and active expiration without changing the current date',async({page})=>{
 await page.clock.install({time:new Date('2026-10-17T12:00:00Z')});
 await page.goto('/?renew');await page.evaluate(()=>(window as any).__membershipFixture('active-v2'));
 const value=(label:string)=>page.locator('dt').filter({hasText:label}).locator('xpath=following-sibling::dd[1]');
 await expect(value('BIT price per day')).toHaveText('2 BIT');
 const current=await value('Current expiration').innerText();
 await page.getByLabel('Days to add').fill('10');await expect(value('Total BIT payment')).toHaveText('20 BIT');
 await expect(value('Proposed expiration')).toContainText('Nov 10, 2026');
 await expect(value('Current expiration')).toHaveText(current);
 await page.getByLabel('Days to add').fill('0');await expect(value('Proposed expiration')).toHaveText('—');
});
test('expired renewal previews from now instead of the old expiry',async({page})=>{
 await page.clock.install({time:new Date('2026-10-17T12:00:00Z')});
 await page.goto('/?renew');await page.evaluate(()=>(window as any).__membershipFixture('v2'));
 await page.getByLabel('Days to add').fill('10');
 await expect(page.getByText(/Oct 27, 2026/)).toBeVisible();
 await expect(page.getByText(/proposed date is an estimate/)).toBeVisible();
});
