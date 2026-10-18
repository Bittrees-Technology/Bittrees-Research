import {test,expect} from '@playwright/test';
import {setup} from '../app-recovery/membership-fixture';
test('Admin navigation stays during expired evidence and refresh failures; actions stay closed and fresh denial removes link',async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),p=f.page;
 let mode='grant',reads=0;
 try{
  await p.addLocatorHandler(p.getByRole('region',{name:'Analytics preferences'}),async()=>{await p.getByRole('button',{name:'Decline',exact:true}).click();});
  await p.route('**/api/authority-access?*',r=>{
   reads++;if(mode==='failure')return r.fulfill({status:503,json:{error:'Synthetic unavailable'}});
   return r.fulfill({json:{configured:true,permissions:mode==='denied'?[]:['community.moderation.manage'],expiresAt:Date.now()+(mode==='expired'?-1000:30000)}});
  });
  await p.getByRole('link',{name:'Overview',exact:true}).click();
  const admin=p.getByRole('banner').getByRole('link',{name:'Admin',exact:true});
  await expect(admin).toBeVisible({timeout:10000});
  mode='expired';const previous=reads;await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThan(previous);
  await expect(admin).toBeVisible();await admin.click();
  await expect(p.getByRole('button',{name:'Moderation',exact:true})).toHaveCount(0);
  mode='failure';const beforeFailure=reads;await expect.poll(()=>reads,{timeout:10000}).toBeGreaterThan(beforeFailure);
  await expect(admin).toBeVisible();await expect(p.getByRole('button',{name:'Moderation',exact:true})).toHaveCount(0);
  mode='denied';await expect(admin).toHaveCount(0,{timeout:10000});
 }finally{await f.context.close();}
});
