import {setup} from '../app-recovery/membership-fixture';
import {test,expect} from '@playwright/test';
for(const state of ['valid','expired','v2-revoked','v2-blocked','legacy-only','unavailable'] as const)test(`one application route requires current membership: ${state}`,async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,state),page=f.page;
 try{
  await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});
  await page.goto('/contributors/apply');await expect(page).toHaveURL(/\/contribute$/);await f.connect();await expect(page).toHaveURL(baseURL!+'/');await page.evaluate(()=>{history.pushState(null,'','/contribute');dispatchEvent(new PopStateEvent('popstate'));});
  if(state==='valid'){
   await expect(page.getByRole('heading',{name:'Apply to contribute',exact:true})).toBeVisible();
   for(const role of ['Researcher','Contributor','Assistant','Steward','Executive'])await expect(page.getByRole('button',{name:role,exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Executive',exact:true}).click();
   await expect(page.getByText(/Only the primary admin authorities can issue an Executive credential/)).toBeVisible();
   await page.getByRole('textbox',{name:'Name or handle *',exact:true}).fill('Executive applicant');
   await page.getByRole('textbox',{name:'What would you like to contribute? *',exact:true}).fill('Research strategy');
   await page.getByRole('button',{name:'EMEA',exact:true}).click();
   await page.getByRole('textbox',{name:'How did you learn about Bittrees Research? *',exact:true}).fill('Website');
   await page.evaluate(()=>(window as any).__membershipChange('chain'));
   await expect(page.getByRole('textbox',{name:'Name or handle *',exact:true})).toHaveValue('Executive applicant');
   await expect(page.getByRole('button',{name:'Executive',exact:true})).toHaveAttribute('aria-pressed','true');
   await page.route('**/api/gate/token/**',r=>r.fulfill({status:403,json:{access:false}}));
   await page.getByRole('button',{name:'Submit application',exact:true}).click();
   await expect(page.getByRole('alert')).toContainText('An active Research membership is required');
   expect(f.stats().writes).toEqual([]);
  }else{
   await expect(page.getByRole('heading',{name:'Your contribution',exact:true})).toHaveCount(0);
   await expect(page.getByRole('link',{name:'Manage membership',exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Submit application',exact:true})).toHaveCount(0);
  }
 }finally{await f.close();}
});

for(const existing of ['application','intake','unverified'])test(`${existing==='unverified'?'unverified declaration permits preflight':'existing '+existing+' prevents duplicate submission'} before encryption or transaction`,async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),page=f.page,wallet='0x'+'1'.repeat(40);let signatures=0;
 try{
  await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});
  await page.route('**/api/gate/token/**',r=>r.fulfill({json:{access:true}}));
  await page.route('**/api/contributors',r=>r.fulfill({json:r.request().method()==='GET'?{session:{wallet,csrf:'shared',expiresAt:Date.now()+86400000}}:{applications:existing!=='intake'?[{wallet,walletVerification:existing==='unverified'?'unverified':'verified',state:'approved'}]:[],intakes:existing==='intake'?[{wallet,status:'waiting_finality'}]:[]}}));
  await page.evaluate(()=>{const provider=(window as any).ethereum,original=provider.request.bind(provider);(window as any).__duplicateSignatures=0;(window as any).__duplicateSwitches=0;provider.request=async(args:any)=>{if(args.method==='wallet_switchEthereumChain'){(window as any).__duplicateSwitches++;throw Error('Synthetic network switch stopped');}if(args.method==='personal_sign'){(window as any).__duplicateSignatures++;throw Error('Unexpected encryption signature');}return original(args);};});
  await page.getByRole('link',{name:'Contribute',exact:true}).click();
  await page.getByRole('textbox',{name:'Name or handle *',exact:true}).fill('Existing member');await page.getByRole('button',{name:'Researcher',exact:true}).click();await page.getByRole('textbox',{name:'What would you like to contribute? *',exact:true}).fill('Research and documentation');await page.getByRole('button',{name:'EMEA',exact:true}).click();await page.getByRole('textbox',{name:'How did you learn about Bittrees Research? *',exact:true}).fill('Website');
  await page.getByRole('button',{name:'Submit application',exact:true}).click();if(existing==='unverified'){await expect.poll(()=>page.evaluate(()=>(window as any).__duplicateSwitches)).toBeGreaterThan(0);await expect(page.getByRole('alert')).not.toContainText('already have an application in progress');}else{await expect(page.getByRole('alert')).toContainText('already have an application in progress');expect(await page.evaluate(()=>(window as any).__duplicateSwitches)).toBe(0);}signatures=await page.evaluate(()=>(window as any).__duplicateSignatures);expect(signatures).toBe(0);expect(await page.evaluate(()=>(window as any).ethereum.request({method:'eth_chainId'}))).toBe('0x1');expect(f.stats().writes).toEqual([]);
 }finally{await f.close();}
});
