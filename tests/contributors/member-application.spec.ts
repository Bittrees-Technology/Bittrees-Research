import {setup} from '../app-recovery/membership-fixture';
import {test,expect} from '@playwright/test';
for(const state of ['valid','expired','v2-revoked','v2-blocked','legacy-only','unavailable'] as const)test(`one application route requires current membership: ${state}`,async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,state),page=f.page;
 try{
  await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});
  await page.goto('/contributors/apply');await expect(page).toHaveURL(/\/contribute$/);await f.connect();
  if(state==='valid'){
   await expect(page.getByRole('heading',{name:'Apply to contribute',exact:true})).toBeVisible();
   for(const role of ['Researcher','Contributor','Assistant','Steward','Executive'])await expect(page.getByRole('button',{name:role,exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Executive',exact:true}).click();
   await expect(page.getByText(/Only the primary admin authorities can issue an Executive credential/)).toBeVisible();
   await page.getByRole('textbox',{name:'Name or handle *',exact:true}).fill('Executive applicant');
   await page.getByRole('textbox',{name:'What would you like to contribute? *',exact:true}).fill('Research strategy');
   await page.getByRole('button',{name:'EMEA',exact:true}).click();
   await page.getByRole('textbox',{name:'How did you learn about Bittrees Research? *',exact:true}).fill('Website');
   await page.route('**/api/gate/token/**',r=>r.fulfill({status:403,json:{access:false}}));
   await page.getByRole('button',{name:'Submit application',exact:true}).click();
   await expect(page.getByRole('alert')).toContainText('An active Research membership is required');
   expect(f.stats().writes).toEqual([]);
  }else{
   await expect(page.getByText('Members only',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Submit application',exact:true})).toHaveCount(0);
  }
 }finally{await f.close();}
});
