import {test,expect} from '@playwright/test';
const recipient='0x3333333333333333333333333333333333333333';
async function form(page:any){await page.goto('/?gift');await page.getByText('Gift a membership',{exact:true}).click();await page.getByLabel('Recipient wallet address').fill(recipient);}
test('gift is reviewed, mints to recipient, and never verifies sender membership',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Review gift',exact:true}).click();
 await expect(page.getByRole('region',{name:'Review gift membership'})).toContainText(recipient);
 await page.getByRole('button',{name:'Confirm gift in wallet'}).click();
 await expect(page.getByText('Gift membership minted',{exact:true})).toBeVisible();
 const state=await page.evaluate(()=>({write:(window as any).__giftWrite,verification:(window as any).__verificationRequests}));
 expect(state.write.functionName).toBe('mintMembership');expect(state.write.args).toEqual([recipient]);expect(state.write.value).toBe('1');expect(state.write.account).toBe('0x1111111111111111111111111111111111111111');expect(state.verification).toBe(0);
});
test('invalid, zero and sender addresses cannot be reviewed; edits invalidate review',async({page})=>{
 await form(page);
 for(const value of ['bad.eth','0x0000000000000000000000000000000000000000','0x1111111111111111111111111111111111111111']){
 await page.getByLabel('Recipient wallet address').fill(value);await expect(page.getByRole('button',{name:'Review gift',exact:true})).toBeDisabled();}
 await page.getByLabel('Recipient wallet address').fill(recipient);await page.getByRole('button',{name:'Review gift',exact:true}).click();
 await page.getByLabel('Recipient wallet address').fill('0x4444444444444444444444444444444444444444');await expect(page.getByRole('region',{name:'Review gift membership'})).toHaveCount(0);
});
test('price change requires another review before wallet submission',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Review gift',exact:true}).click();await page.evaluate(()=>(window as any).__giftPrice=2);
 await page.getByRole('button',{name:'Confirm gift in wallet'}).click();await expect(page.getByRole('status')).toContainText('mint price or term changed');
 expect(await page.evaluate(()=>(window as any).__giftWrite)).toBeUndefined();
});
test('wallet change during simulation prevents gift submission',async({page})=>{
 await form(page);await page.getByRole('button',{name:'Review gift',exact:true}).click();await page.evaluate(()=>(window as any).__giftHold=true);
 await page.getByRole('button',{name:'Confirm gift in wallet'}).click();
 await page.waitForFunction(()=>!!(window as any).__giftRelease);
 await page.evaluate(()=>{(window as any).__membershipFixture('switch');});
 await page.getByRole('button',{name:'Review gift',exact:true}).waitFor();
 await page.evaluate(()=>(window as any).__giftRelease());
 expect(await page.evaluate(()=>(window as any).__giftWrite)).toBeUndefined();
});
for(const mode of ['missing','wrong','cancelled','reverted'])test(`${mode} receipt cannot claim a gift`,async({page})=>{
 await form(page);await page.evaluate(m=>(window as any).__giftReceipt=m,mode);await page.getByRole('button',{name:'Review gift',exact:true}).click();await page.getByRole('button',{name:'Confirm gift in wallet'}).click();
 await expect(page.getByRole('status')).toContainText('Gift was not confirmed');await expect(page.getByText('Gift membership minted',{exact:true})).toHaveCount(0);
});
test('mobile gift review fits viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await form(page);await page.getByRole('button',{name:'Review gift',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/research-gift-mobile.png',fullPage:true});
});

test('submitted gift survives wallet change and reload without enabling duplicate submission',async({page})=>{
 await form(page);await page.evaluate(()=>(window as any).__giftReceiptHold=true);
 await page.getByRole('button',{name:'Review gift',exact:true}).click();await page.getByRole('button',{name:'Confirm gift in wallet'}).click();
 await expect(page.getByRole('heading',{name:'Gift submitted',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__membershipFixture('switch'));
 await expect(page.getByRole('status')).toContainText('0x1111111111111111111111111111111111111111');
 await expect(page.getByRole('button',{name:'Review gift',exact:true})).toHaveCount(0);
 await page.reload();await page.getByText('Gift a membership',{exact:true}).click();
 await expect(page.getByRole('heading',{name:'Gift membership minted',exact:true})).toBeVisible();
 await expect(page.getByRole('status')).toContainText(recipient);
 expect(await page.evaluate(()=>(window as any).__giftWrite)).toBeUndefined();
});
