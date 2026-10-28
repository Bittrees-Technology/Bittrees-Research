import {test,expect} from '@playwright/test';
const wallet='0x'+'1'.repeat(40);
function application(){return {id:'mine',identity:'owner',name:'Example contributor',project:'Bittrees Research',state:'submitted',version:1,wallet,walletVerification:'verified',specialty:'Documentation and onboarding',expertise:['Research'],region:['EMEA'],languages:['English'],heardFrom:'Website',memos:[],memoEdits:[],reviews:[],proposals:[],validations:[],credential:null};}
async function mock(page:any,get:()=>any,change?:(b:any)=>void){
 await page.route('https://insights.bittrees.org/consent.js',(r:any)=>r.abort());
 await page.route('**/graphql',(r:any)=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',(r:any)=>{if(r.request().method()==='GET')return r.fulfill({json:{session:{wallet,csrf:'test'}}});const b=r.request().postDataJSON();change?.(b);return r.fulfill({json:{today:'2026-10-28',...get()}});});
}
test('applicant follows review and separate role assignment without Governance consent or duplicate account menus',async({page})=>{
 const app:any={...application(),requestedRoles:['Researcher']};let submitted:any;
 await mock(page,()=>({applications:[app],persona:{id:'owner',canReview:false}}),b=>{if(b.action==='review'){submitted=b.change;app.state='in_review';}});
 await page.goto('/admin/contributors');await expect(page.getByRole('list',{name:'Contributor progress'})).toBeVisible();await expect(page.getByText('Your application is in the review queue.',{exact:true})).toBeVisible();
 app.state='needs_info';app.reviews=[{reason:'Which projects would you like to help?',state:'needs_info'}];await page.reload();await page.getByLabel('Your response',{exact:true}).fill('Research documentation');await page.getByRole('button',{name:'Send response',exact:true}).click();expect(submitted.action).toBe('respond_info');
 app.state='approved';app.memos=[{version:1,status:'issued',scope:'Historical data'}];app.credential={tokenId:'1',standing:'active',termActive:true};await page.reload();
 await expect(page.getByText('Role credential assignment is a separate transaction;',{exact:false})).toBeVisible();
 for(const label of ['Sign memorandum with wallet','Issue Memorandum of Contribution','End Research session'])await expect(page.getByRole('button',{name:label,exact:true})).toHaveCount(0);
 await expect(page.locator('.cp-account')).toHaveCount(0);await expect(page.getByText('Wallet settings',{exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Active credential',exact:true})).toHaveCount(0);
 for(const role of ['Researcher','Contributor','Assistant','Steward','Executive'])await expect(page.getByText(role,{exact:false}).first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Executive acceptance moves to Directory and explains separate native credential assignment',async({page})=>{
 const app:any={...application(),requestedRoles:['Researcher']};
 await mock(page,()=>({applications:[app],persona:{id:'executive',canReview:true,canDecide:true,canIssue:true}}),b=>{if(b.action==='review'&&b.change.action==='approve'){app.state='approved';app.version++;}});
 await page.goto('/admin/contributors');await page.getByRole('button',{name:'Open Example contributor',exact:true}).click();await expect(page.locator('.cp-review-layout')).toBeVisible();await page.getByLabel('Contributor-facing explanation',{exact:true}).fill('Welcome to Research.');await page.getByRole('button',{name:'Accept application',exact:true}).click();
 await expect(page.getByRole('button',{name:'Directory',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByText('Acceptance does not issue credentials or grant access.',{exact:false})).toBeVisible();await expect(page.getByRole('link',{name:'Open role credential management'})).toHaveAttribute('href','/admin?tab=roles');await expect(page.getByRole('button',{name:'Memoranda & issuance',exact:true})).toHaveCount(0);
});
test('pending intake becomes the same private application on refresh without another unlock',async({page})=>{
 let ready=false;
 await mock(page,()=>({applications:ready?[application()]:[],intakes:ready?[]:[{uid:'0x'+'4'.repeat(64),wallet,status:'waiting_finality'}],persona:{id:'owner',canReview:false}}));
 await page.goto('/admin/contributors');await expect(page.getByText('Your application: waiting for Base finality;',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Unlock existing application'})).toHaveCount(0);
 ready=true;await page.reload();await expect(page.getByRole('heading',{name:'Example contributor',exact:true})).toBeVisible();await expect(page.getByRole('list',{name:'Contributor progress'})).toBeVisible();await expect(page.getByText('waiting for Base finality',{exact:false})).toHaveCount(0);
});

test('an intake refresh denied by the server removes private applicant data',async({page})=>{
 await page.clock.install();let deny=false;
 await page.route('https://insights.bittrees.org/consent.js',r=>r.abort());await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>{if(r.request().method()==='GET')return r.fulfill({json:{session:{wallet,csrf:'test'}}});return r.fulfill(deny?{status:403,json:{error:'Access unavailable'}}:{json:{today:'2026-10-28',applications:[application()],intakes:[{uid:'0x'+'4'.repeat(64),wallet,status:'waiting_finality'}],persona:{id:'owner',canReview:false}}});});
 await page.goto('/admin/contributors');await expect(page.getByRole('heading',{name:'Example contributor',exact:true})).toBeVisible();deny=true;await page.clock.fastForward(61000);await expect(page.getByRole('alert')).toContainText('Access unavailable');await expect(page.getByRole('heading',{name:'Example contributor',exact:true})).toHaveCount(0);
});

test('pending intake reads pause while hidden and resume when visible',async({page})=>{
 await page.clock.install();let reads=0;
 await page.route('https://insights.bittrees.org/consent.js',r=>r.abort());await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>{if(r.request().method()==='GET')return r.fulfill({json:{session:{wallet,csrf:'test'}}});reads++;return r.fulfill({json:{today:'2026-10-28',applications:[],intakes:[{uid:'0x'+'4'.repeat(64),wallet,status:'waiting_finality'}],persona:{id:'owner',canReview:false}}});});
 await page.goto('/admin/contributors');await expect(page.getByText('Your application: waiting for Base finality;',{exact:false})).toBeVisible();const initial=reads;
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));await page.clock.fastForward(121000);expect(reads).toBe(initial);
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}));await page.clock.fastForward(61000);await expect.poll(()=>reads).toBeGreaterThan(initial);
});

test('a session ending through the profile removes private records on refresh and stops polling',async({page})=>{
 await page.clock.install();let ended=false,reads=0;
 await page.route('https://insights.bittrees.org/consent.js',r=>r.abort());await page.route('**/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',r=>{if(r.request().method()==='GET')return r.fulfill({json:{session:ended?null:{wallet,csrf:'test'}}});reads++;return r.fulfill({json:{today:'2026-10-28',applications:[application()],intakes:[{uid:'0x'+'4'.repeat(64),wallet,status:'waiting_finality'}],persona:{id:'owner',canReview:false}}});});
 await page.goto('/admin/contributors');await expect(page.getByRole('heading',{name:'Example contributor',exact:true})).toBeVisible();ended=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'Example contributor',exact:true})).toHaveCount(0);const stopped=reads;await page.clock.fastForward(121000);expect(reads).toBe(stopped);await expect(page.getByRole('heading',{name:'Connect your wallet',exact:true})).toBeVisible();
});
