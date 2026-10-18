import {test,expect} from '@playwright/test';
import {setup} from '../app-recovery/membership-fixture';
test('one wallet proof on Overview opens board and contributor records without another sign-in',async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),p=f.page,wallet='0x'+'1'.repeat(40);let verified=false,finishes=0;
 const session=()=>verified?{wallet,csrf:'shared',expiresAt:Date.now()+86400000}:null;
 try{
  await p.addLocatorHandler(p.getByRole('region',{name:'Analytics preferences'}),async()=>{await p.getByRole('button',{name:'Decline',exact:true}).click();});
  await p.evaluate(()=>{
   const provider=(window as any).ethereum,original=provider.request.bind(provider);(window as any).__researchSignatures=0;
   provider.request=async(args:any)=>{if(args.method==='personal_sign'){(window as any).__researchSignatures++;return '0x'+'1'.repeat(130);}return original(args);};
  });
  await p.route('**/api/contributors',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{configured:true,session:session()}});
   const input=r.request().postDataJSON();
   if(input.action==='wallet_login_start')return r.fulfill({json:{challenge:'fixture',message:'Bittrees Research sign-in'}});
   if(input.action==='wallet_login_finish'){verified=true;finishes++;return r.fulfill({json:{ok:true}});}
   expect(verified).toBe(true);expect(input.action).toBe('list');expect(r.request().headers()['x-contributor-csrf']).toBe('shared');
   return r.fulfill({json:{applications:[],persona:{id:'member',canReview:false},today:'2026-10-18'}});
  });
  await p.route('**/api/research-requests',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{session:session()}});
   const input=r.request().postDataJSON();expect(verified).toBe(true);expect(input.action).toBe('list');expect(r.request().headers()['x-research-csrf']).toBe('shared');
   return r.fulfill({json:{requests:[],wallet,capabilities:{member:true,researcher:false}}});
  });
  await p.getByRole('link',{name:'Overview',exact:true}).click();
  await p.getByRole('button',{name:'Verify wallet for Research',exact:true}).click();
  await expect(p.getByRole('heading',{name:'Wallet verified for Research'})).toBeVisible();
  await p.screenshot({path:'/tmp/research-shared-session-home.png',fullPage:true});
  await p.route('https://base.easscan.org/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
  await p.getByRole('banner').getByRole('link',{name:'Forum',exact:true}).click();
  await expect(p.getByRole('heading',{name:'Forum',exact:true})).toBeVisible();
  expect(await p.evaluate(()=>(window as any).__researchSignatures)).toBe(1);
  await p.getByRole('banner').getByRole('link',{name:'Research',exact:true}).click();
  await p.getByRole('link',{name:'Research requests',exact:true}).click();
  await expect(p.getByRole('button',{name:'Request research',exact:true})).toBeVisible();
  await expect(p.getByRole('button',{name:'Verify wallet and open board'})).toHaveCount(0);
  await p.getByRole('banner').getByRole('link',{name:'Contribute',exact:true}).click();
  await p.getByRole('link',{name:'View my application and memorandum'}).click();
  await expect(p.getByText(/^Verified wallet ·/)).toBeVisible();
  await expect(p.getByRole('button',{name:'Verify wallet and continue'})).toHaveCount(0);
  expect(finishes).toBe(1);expect(await p.evaluate(()=>(window as any).__researchSignatures)).toBe(1);
 }finally{await f.context.close();}
});

// The page rendered signed out, then another tab completed wallet verification.
// Clicking the stale button must reopen the shared session without signing again.
test('contributor entry rechecks an existing session before requesting a signature',async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),p=f.page,wallet='0x'+'1'.repeat(40);let verified=false,starts=0;
 try{
  await p.addLocatorHandler(p.getByRole('region',{name:'Analytics preferences'}),async()=>{await p.getByRole('button',{name:'Decline',exact:true}).click();});
  await p.evaluate(()=>{const provider=(window as any).ethereum,original=provider.request.bind(provider);(window as any).__extraSignatures=0;provider.request=async(args:any)=>{if(args.method==='personal_sign'){(window as any).__extraSignatures++;throw Error('Unexpected access signature');}return original(args);};});
  await p.route('**/api/contributors',r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{configured:true,session:verified?{wallet,csrf:'shared',expiresAt:Date.now()+86400000}:null}});
   const input=r.request().postDataJSON();if(input.action==='wallet_login_start')starts++;
   expect(input.action).toBe('list');return r.fulfill({json:{applications:[],persona:{id:'member',canReview:false},today:'2026-10-18'}});
  });
  await p.route('https://base.easscan.org/graphql',r=>r.fulfill({json:{data:{attestations:[]}}}));
  await p.getByRole('banner').getByRole('link',{name:'Contribute',exact:true}).click();
  await p.getByRole('link',{name:'View my application and memorandum'}).click();
  const button=p.getByRole('button',{name:'Verify wallet and continue'});await expect(button).toBeVisible();
  verified=true;await button.click();
  await expect(p.getByText(/^Verified wallet ·/)).toBeVisible();
  await p.getByRole('banner').getByRole('link',{name:'Forum',exact:true}).click();
  await expect(p.getByRole('heading',{name:'Forum',exact:true})).toBeVisible();
  expect(starts).toBe(0);expect(await p.evaluate(()=>(window as any).__extraSignatures)).toBe(0);
 }finally{await f.context.close();}
});
