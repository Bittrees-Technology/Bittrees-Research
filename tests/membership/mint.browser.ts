import {test,expect,type Page} from '@playwright/test';
const change=(page:Page,kind:string)=>page.evaluate(kind=>(window as any).__membershipFixture(kind),kind);
const member=(page:Page)=>page.getByRole('heading',{name:'Synthetic member content'});
const confirmed=(page:Page)=>page.getByRole('heading',{name:'Transaction confirmed',exact:true});
async function confirm(page:Page) {
 await page.goto('/');
 await page.getByRole('button',{name:/^Join —/}).click();
 await change(page,'receipt');
 await expect(confirmed(page)).toBeVisible();
 await expect(page.getByRole('button',{name:'Checking membership…'})).toBeDisabled();
}
test('confirmed mint remains visible through loading, delayed discovery and errors until verification succeeds',async({page},info)=>{
 await confirm(page);
 await expect(member(page)).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
 await change(page,'render'); expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
 await change(page,'empty');
 await expect(confirmed(page)).toBeVisible();
 await expect(page.getByRole('button',{name:/^Join —/})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'View confirmed transaction'})).toHaveAttribute('href',`https://etherscan.io/tx/0x${'1'.repeat(64)}`);
 await page.getByRole('button',{name:'Check membership again'}).click();
 await expect(page.getByRole('button',{name:'Checking membership…'})).toBeDisabled();
 await change(page,'error');
 await expect(page.getByRole('alert')).toContainText('Your confirmed transaction is still recorded here');
 await expect(member(page)).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await confirmed(page).scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('pending-mint-mobile.png')});
 await page.getByRole('button',{name:'Check membership again'}).click();
 await change(page,'verified');
 await expect(member(page)).toBeVisible();await expect(confirmed(page)).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(3);
});
for(const kind of ['switch','chain','disconnect']) {
 test(`confirmed receipt cannot follow a ${kind} into another wallet session`,async({page})=>{
  await confirm(page);await change(page,kind);
  await expect(confirmed(page)).toHaveCount(0);await expect(member(page)).toHaveCount(0);
  await change(page,'late_receipt');await expect(confirmed(page)).toHaveCount(0);
  if(kind==='disconnect'){await change(page,'reconnect');await expect(confirmed(page)).toHaveCount(0);}
  expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
 });
}
test('reverted or unsolicited receipts do not create a pending-verification notice',async({page})=>{
 await page.goto('/');await change(page,'receipt');await expect(confirmed(page)).toHaveCount(0);
 await change(page,'reconnect');await page.getByRole('button',{name:/^Join —/}).click();
 await change(page,'reverted');await expect(confirmed(page)).toHaveCount(0);await expect(member(page)).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(0);
});

test('cancelled or replaced purchases require review instead of a confirmed membership notice',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/^Join —/}).click();
 await change(page,'cancelled');
 await expect(page.getByRole('heading',{name:'Transaction changed'})).toBeVisible();
 await expect(confirmed(page)).toHaveCount(0);await expect(member(page)).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(0);
 await page.getByRole('button',{name:'Return to membership options'}).click();
 await expect(page.getByRole('button',{name:/^Join —/})).toBeEnabled();
});
test('a repriced purchase records its confirmed replacement hash without granting membership',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/^Join —/}).click();
 await change(page,'repriced');
 await expect(confirmed(page)).toBeVisible();
 await expect(page.getByRole('link',{name:'View confirmed transaction'})).toHaveAttribute('href',`https://etherscan.io/tx/0x${'4'.repeat(64)}`);
 await expect(member(page)).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__verificationRequests)).toBe(1);
});
