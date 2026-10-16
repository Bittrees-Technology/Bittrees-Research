import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});});
test('native contributor page fails closed and retains legacy access',async({page})=>{await page.route('**/api/contributors',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({configured:false,error:'Contributor administration is being configured.'})}));await page.goto('/admin/contributors');await expect(page.locator('.cp-error')).toContainText('being configured');await expect(page.getByRole('link',{name:'Base application form'})).toBeVisible();await expect(page.getByText('Review as',{exact:true})).toHaveCount(0);});
test('email sign-in exposes no fixture selector or secret token',async({page})=>{await page.route('**/api/contributors',r=>{const request=r.request();if(request.method()==='GET')return r.fulfill({json:{configured:true,session:null}});return r.fulfill({json:{challenge:'test-challenge'}});});await page.goto('/contributors/apply');await page.getByLabel('Email',{exact:true}).fill('test@example.invalid');await page.getByRole('button',{name:'Send sign-in code'}).click();await expect(page.getByLabel('Six-digit email code')).toBeVisible();await expect(page.getByLabel('Six-digit email code')).toHaveValue('');await expect(page.getByText('Check your email for a sign-in code.')).toBeVisible();await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/contributor-login-mobile.png',fullPage:true});});
test('Partner can prepare ongoing terms without an automatic end date',async({page})=>{const app={id:'test-app',identity:'other',name:'Test contributor',project:'Bittrees Governance',state:'approved',version:1,specialty:'Documentation',wallet:null,walletVerification:'not_connected',reviews:[],memos:[],proposals:[],validations:[],credential:null};const data={today:'2026-10-15',applications:[app],persona:{id:'partner',canReview:true,canDecide:true,canIssue:true},audit:[]};let submitted:any;await page.route('**/api/contributors',r=>{const req=r.request();if(req.method()==='GET')return r.fulfill({json:{session:{email:'partner@example.invalid',csrf:'test-csrf'}}});const body=req.postDataJSON();if(body.action==='review')submitted=body;return r.fulfill({json:data});});await page.goto('/admin/contributors');await page.getByRole('button',{name:'Review memorandum',exact:true}).click();await page.getByText('Prepare the memorandum',{exact:true}).click();await page.getByRole('combobox',{name:'Term',exact:true}).selectOption('ongoing');await expect(page.getByLabel('Effective through')).toHaveCount(0);await page.getByLabel('Historical service start (optional)',{exact:true}).fill('2020-03-27');await expect(page.getByLabel('Effective from',{exact:true})).toHaveValue('2026-10-15');await page.getByRole('button',{name:'Prepare for acknowledgment'}).click();await expect(page.getByRole('status')).toHaveText('Saved.');expect(submitted.change.end).toBe(null);expect(submitted.change.historicalServiceStart).toBe('2020-03-27');expect(submitted.change.start).toBe('2026-10-15');expect(submitted.change.action).toBe('draft_memo');});

test('wallet-only imported application keeps source and responsibilities through memo preparation',async({page})=>{
 const wallet='0x'+'1'.repeat(40),uid='0x'+'2'.repeat(64);
 const app={id:'base-app',identity:'wallet:owner',name:'Wallet applicant',project:'Bittrees Governance',state:'approved',version:3,specialty:'Maintain contributor governance tooling',wallet,walletVerification:'verified',sourceAttestation:{uid,chainId:8453},reviews:[],memos:[],proposals:[],validations:[],credential:null};
 const data={today:'2026-10-16',applications:[app],persona:{id:'wallet:owner',canReview:true,canDecide:true,canIssue:true},audit:[]};
 await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>r.fulfill({json:r.request().method()==='GET'?{session:{email:null,wallet,csrf:'test'}}:data}));
 await page.goto('/admin/contributors');await expect(page.getByRole('link',{name:'Base application',exact:true})).toHaveAttribute('href',`https://base.easscan.org/attestation/view/${uid}`);
 await expect(page.getByLabel('Email',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Review memorandum',exact:true}).click();await page.getByText('Prepare the memorandum',{exact:true}).click();await expect(page.getByRole('textbox',{name:'Responsibilities',exact:true})).toHaveValue(app.specialty);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('memorandum has one acknowledgment action and hides completed sync and redundant wallet verification',async({page})=>{
 const wallet='0x'+'1'.repeat(40),uid='0x'+'2'.repeat(64);
 const memo={version:1,status:'draft',scope:'Founder stewardship\nMetaverse strategy\nTalent acquisition',level:'Full Time',rank:'Lead contributor',start:'2026-10-16',end:null,historicalServiceStart:'2020-03-27',hash:'a'.repeat(64)};
 const app={id:'base-app',identity:'owner',name:'Founder',project:'Bittrees Governance',state:'approved',version:4,specialty:'Original interests',wallet,walletVerification:'verified',sourceAttestation:{uid},reviews:[],memos:[memo],proposals:[],validations:[],credential:null};
 await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>r.fulfill({json:r.request().method()==='GET'?{session:{wallet,email:null,csrf:'test'}}:{today:'2026-10-16',applications:[app],persona:{id:'owner',canReview:true,canDecide:true,canIssue:true}}}));
 await page.goto('/admin/contributors');await page.getByRole('button',{name:'Review memorandum',exact:true}).click();
 await expect(page.getByText('Historical service since 2020-03-27.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Acknowledge these exact terms'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Sign memorandum with wallet',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Continue a Base application'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Verify connected wallet'})).not.toBeVisible();
 await expect(page.getByText('Document fingerprint:',{exact:false})).not.toBeVisible();
 await page.getByText('Prepare a revised memorandum',{exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Contribution level',exact:true})).toHaveValue('Full Time');
 await expect(page.getByRole('combobox',{name:'Term',exact:true})).toHaveValue('ongoing');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/contributor-memo-cleanup-mobile.png',fullPage:true});
});
