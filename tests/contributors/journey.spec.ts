import {test,expect} from '@playwright/test';
const wallet='0x'+'1'.repeat(40);
function application(){return {id:'mine',identity:'owner',name:'Example contributor',project:'Bittrees Research',state:'submitted',version:1,wallet,walletVerification:'verified',specialty:'Documentation and onboarding',expertise:['Research'],region:['EMEA'],languages:['English'],heardFrom:'Website',memos:[],memoEdits:[],reviews:[],proposals:[],validations:[],credential:null};}
async function mock(page:any,get:()=>any,change?:(b:any)=>void){
 await page.route('https://insights.bittrees.org/consent.js',(r:any)=>r.abort());
 await page.route('**/graphql',(r:any)=>r.fulfill({json:{data:{attestations:[]}}}));
 await page.route('**/api/contributors',(r:any)=>{if(r.request().method()==='GET')return r.fulfill({json:{session:{wallet,csrf:'test'}}});const b=r.request().postDataJSON();change?.(b);return r.fulfill({json:{today:'2026-10-28',...get()}});});
}
test('applicant has one journey with reviewer replies, edits, signing and issued credential history',async({page})=>{
 const app:any=application();let submitted:any;
 await mock(page,()=>({applications:[app],persona:{id:'owner',canReview:false}}),b=>{if(b.action==='review'){submitted=b.change;app.state='in_review';}});
 await page.goto('/admin/contributors');const nav=page.getByRole('navigation',{name:'Contributor workspace'});await expect(nav.getByRole('button')).toHaveCount(1);await expect(nav.getByRole('button',{name:'My contribution'})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('list',{name:'Contributor progress'})).toBeVisible();await expect(page.getByText('Your application is in the review queue.',{exact:true})).toBeVisible();
 app.state='needs_info';app.reviews=[{reason:'Which projects would you like to help?',state:'needs_info'}];await page.reload();await page.getByLabel('Your response',{exact:true}).fill('Gov documentation');await page.getByRole('button',{name:'Send response',exact:true}).click();expect(submitted.action).toBe('respond_info');
 app.state='approved';app.memos=[{version:1,status:'draft',scope:app.specialty,level:'Part Time',rank:'Contributor',wallet,start:'2026-10-28',end:null}];await page.reload();await expect(page.getByRole('button',{name:'Sign memorandum with wallet',exact:true})).toHaveCount(1);await expect(page.getByText('Propose changes to this memorandum',{exact:true})).toHaveCount(1);
 await page.screenshot({path:'artifacts/guided-contributor-desktop.png',fullPage:true});
 app.memos[0].consent={};await page.reload();await expect(page.getByRole('button',{name:'Sign memorandum with wallet',exact:true})).toHaveCount(0);await expect(page.getByText('Propose changes to this memorandum',{exact:true})).toHaveCount(0);await expect(page.getByText('Already signed.',{exact:false})).toBeVisible();
 app.memos[0].status='issued';app.credential={tokenId:'1',standing:'active',termActive:true,transactionHash:'0x'+'2'.repeat(64)};app.validations=[{id:'month1',month:'2026-10',evidence:'Published documentation',validatedBy:'Partner'}];await page.reload();await expect(page.getByRole('heading',{name:'Active credential',exact:true})).toBeVisible();await page.getByText('Confirmed monthly contributions',{exact:true}).click();await expect(page.getByText('Published documentation',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'View role profile',exact:true})).toHaveAttribute('href','https://roles.bittrees.org');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/guided-contributor-mobile.png',fullPage:true});
});
test('reviewer opens application beside the sheet and proceeds directly to prefilled memorandum after acceptance',async({page})=>{
 const app:any=application();
 await mock(page,()=>({applications:[app],persona:{id:'partner',canReview:true,canDecide:true,canIssue:true}}),b=>{if(b.action==='review'&&b.change.action==='approve'){app.state='approved';app.version++;}});
 await page.goto('/admin/contributors');await page.getByRole('button',{name:'Open Example contributor',exact:true}).click();await expect(page.locator('.cp-review-layout')).toBeVisible();await page.getByLabel('Contributor-facing explanation',{exact:true}).fill('Welcome to the documentation team.');await page.screenshot({path:'artifacts/guided-reviewer-desktop.png',fullPage:true});await page.getByRole('button',{name:'Accept application',exact:true}).click();await expect(page.getByRole('button',{name:'Memoranda & issuance',exact:true})).toHaveAttribute('aria-current','page');await expect(page.getByRole('textbox',{name:'Responsibilities',exact:true})).toHaveValue(app.specialty);await expect(page.getByRole('combobox',{name:'Term',exact:true})).toHaveValue('ongoing');
 await page.getByRole('button',{name:'← All memoranda'}).click();await page.getByLabel('Show memoranda').selectOption('action');await expect(page.getByRole('button',{name:'Open Example contributor',exact:true})).toBeVisible();
});
test('signed unissued memorandum offers issuance without an impossible revise or expiry-wait path',async({page})=>{
 const app:any={...application(),state:'approved',memos:[{version:1,status:'draft',wallet,scope:'Agreed scope',start:'2026-10-28',end:null,level:'Full Time',rank:'Contributor',consent:{}}]};
 await mock(page,()=>({applications:[app],persona:{id:'partner',canReview:true,canDecide:true,canIssue:true}}));
 await page.goto('/admin/contributors');await page.getByRole('button',{name:'Memoranda & issuance',exact:true}).click();await page.getByRole('button',{name:'Open Example contributor',exact:true}).click();await expect(page.getByRole('button',{name:'Issue Memorandum of Contribution',exact:true})).toHaveCount(1);await expect(page.getByText('Prepare a revised memorandum',{exact:true})).toHaveCount(0);await expect(page.getByText('Issue and confirm this version before preparing an amendment.',{exact:false})).toBeVisible();
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

test('expired Research consent exposes recovery while server finality remains required',async({page})=>{
 const app:any={...application(),state:'approved',memos:[{version:1,status:'draft',wallet,scope:'Agreed scope',start:'2026-10-28',end:null,level:'Part Time',rank:'Contributor',consent:{typedData:{message:{deadline:1}}}}]};
 await mock(page,()=>({applications:[app],persona:{id:'reviewer',canReview:true,canDecide:true,canIssue:true}}));
 await page.goto('/admin/contributors');await page.getByRole('button',{name:'Memoranda & issuance',exact:true}).click();await page.getByRole('button',{name:'Open Example contributor',exact:true}).click();await page.getByText('Manage memorandum & history',{exact:true}).click();await expect(page.getByText('Recover expired authorization and revise memorandum',{exact:true})).toBeVisible();
});
