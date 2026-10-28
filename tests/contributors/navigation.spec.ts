import {test,expect} from '@playwright/test';
import {setup} from '../app-recovery/membership-fixture';
test('sign-in lands on overview; Contribute retains the shared header and draft across network changes',async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),p=f.page;
 try{
  await p.addLocatorHandler(p.getByRole('region',{name:'Analytics preferences'}),async()=>{await p.getByRole('button',{name:'Decline',exact:true}).click();});
  await p.goto('/contribute');await f.connect();
  await expect(p).toHaveURL(baseURL!+'/');await expect(p.getByRole('heading',{name:'Welcome to Bittrees Research'})).toBeVisible();
  await expect(p.getByRole('textbox',{name:'Name or handle *',exact:true})).toHaveCount(0);
  await p.getByRole('link',{name:'Contribute',exact:true}).click();
  await expect(p.getByRole('banner').getByRole('link',{name:/Bittrees Research/})).toBeVisible();
  await expect(p.getByRole('link',{name:'Contribute',exact:true})).toHaveAttribute('aria-current','page');
  await p.getByRole('textbox',{name:'Name or handle *',exact:true}).fill('Draft applicant');
  await p.evaluate(()=>(window as any).__membershipChange('chain'));
  await expect(p.getByRole('textbox',{name:'Name or handle *',exact:true})).toHaveValue('Draft applicant');
  await expect(p.getByRole('banner').getByRole('link',{name:'Overview'})).toBeVisible();
  await p.screenshot({path:'/tmp/research-contribute-navigation.png',fullPage:true});
  await p.getByRole('link',{name:'My contribution'}).click();
  await expect(p.getByRole('banner').getByRole('link',{name:/Bittrees Research/})).toBeVisible();
 }finally{await f.close();}
});
test('desktop and mobile Chat open a separate tab and leave Research open',async({browser,baseURL})=>{
 const f=await setup(browser,baseURL!,'valid'),p=f.page;
 try{
  await p.addLocatorHandler(p.getByRole('region',{name:'Analytics preferences'}),async()=>{await p.getByRole('button',{name:'Decline',exact:true}).click();});
  await p.getByRole('link',{name:'Overview',exact:true}).click();
  await f.context.route('https://chat.bittrees.org/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Chat destination</h1>'}));
  for(const mobile of [false,true]){
   if(mobile){await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Toggle navigation'}).click();}
   const link=p.getByRole('link',{name:'Chat',exact:true}).filter({visible:true});
   await expect(link).toHaveAttribute('href','https://chat.bittrees.org');await expect(link).toHaveAttribute('target','_blank');
   const opened=f.context.waitForEvent('page');await link.click();const chat=await opened;
   await expect(chat.getByRole('heading',{name:'Chat destination'})).toBeVisible();await expect(p).toHaveURL(baseURL!+'/');await chat.close();
  }
 }finally{await f.close();}
});
