import {setup} from '../app-recovery/membership-fixture';
import {test,expect} from '@playwright/test';
for(const role of ['Partner','Junior Partner','Associate','Research admin'])test(`${role} with native Executive setup lives in settings and disappears when registered`,async({browser,baseURL})=>{
 const fixture=await setup(browser,baseURL!,"valid"),page=fixture.page;
 const wallet='0x1111111111111111111111111111111111111111';let registered=false;
 await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});

 await page.route('**/api/authority-access?*',r=>r.fulfill({json:{configured:true,reviewer:true,permissions:[],roles:[{label:role}],expiresAt:Date.now()+30000}}));
 await page.route('**/api/community',r=>r.fulfill({json:{roles:{},flags:{},roledefs:[],enckeys:registered?{[wallet]:'a'.repeat(64)}:{},reviewerAuthority:{mode:'roles',ready:true,reviewers:registered?[wallet]:[],expiresAt:Date.now()+30000}}}));
 await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>r.fulfill({json:r.request().method()==='GET'?{session:{wallet,csrf:'test'}}:{applications:[],persona:{id:'staff',canReview:true}}}));
 await page.goto('/admin');await page.getByRole('button',{name:'Connect Wallet',exact:true}).first().click();await page.getByRole('button',{name:/^MetaMask(?:\s|$)/}).click();
 await expect(page.getByText('Encryption access for future applications')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Enable application access'})).toHaveCount(0);
 await page.getByRole('button',{name:'Admin settings',exact:true}).click();await expect(page.getByRole('button',{name:'Enable application access',exact:true})).toBeVisible();
 registered=true;await page.getByRole('button',{name:'Contributor applications',exact:true}).click();await page.getByRole('button',{name:'Admin settings',exact:true}).click();
 await expect(page.getByText('Application access enabled.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Enable application access',exact:true})).toHaveCount(0);
 await fixture.context.close();
});
test('Partner labels and legacy Executive labels alone never show admin settings',async({browser,baseURL})=>{
 const fixture=await setup(browser,baseURL!,"valid"),page=fixture.page;
 await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});
 await page.route('**/api/authority-access?*',r=>r.fulfill({json:{configured:true,reviewer:false,permissions:[],roles:[{label:'Partner'},{label:'executive'}],expiresAt:Date.now()+30000}}));
 await page.route('**/api/community',r=>r.fulfill({json:{roles:{'0x1111111111111111111111111111111111111111':[{label:'Executive'}]},flags:{},roledefs:[],enckeys:{}}}));
 await page.route('**/api/contributors',r=>r.fulfill({json:{configured:true,session:null}}));
 await page.goto('/admin');await page.getByRole('button',{name:'Connect Wallet',exact:true}).first().click();await page.getByRole('button',{name:/^MetaMask(?:\s|$)/}).click();
 await expect(page.getByRole('button',{name:'Contributor applications',exact:true})).toBeVisible();
 for(const name of ['Admin settings','Roles','Moderation'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
 await fixture.context.close();
});
