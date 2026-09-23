import {test,expect} from '@playwright/test';
test('a confirmed mint requests verification once and never independently opens member content',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Join Bittrees Research'})).toBeVisible();
 await page.evaluate(()=>(window as any).__membershipFixture('receipt'));
 await expect(page.getByText('Your transaction is confirmed.',{exact:false})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Synthetic member content'})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
 await page.evaluate(()=>(window as any).__membershipFixture('render'));
 expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
 await page.evaluate(()=>(window as any).__membershipFixture('verified'));
 await expect(page.getByRole('heading',{name:'Synthetic member content'})).toBeVisible();
 await page.evaluate(()=>(window as any).__membershipFixture('switch'));
 await expect(page.getByRole('heading',{name:'Synthetic member content'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Join Bittrees Research'})).toBeVisible();
 await page.evaluate(()=>(window as any).__membershipFixture('receipt'));
 await expect(page.getByRole('heading',{name:'Synthetic member content'})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__verificationRequests)).toBe(2);
});
