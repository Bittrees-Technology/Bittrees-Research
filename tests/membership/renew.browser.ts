import {test,expect} from '@playwright/test';
test('BIT renewal approves only the displayed maximum and renews the same token',async({page})=>{
 await page.goto('/?renew');await page.evaluate(()=>(window as any).__membershipFixture('v2'));
 await expect(page.getByText(/Maximum payment: 60 BIT/)).toBeVisible();
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
