import {test,expect} from '@playwright/test';
import {setup} from '../app-recovery/membership-fixture';
import {emptyState,transition} from '../../server/research-requests/core.mjs';
const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
async function board(browser:any,baseURL:string,researcher=false){
 const fixture=await setup(browser,baseURL,'valid'),page=fixture.page;
 let state=emptyState();
 const create=(requester:string)=>{state=transition(state,{wallet:requester,member:true},{action:'create',commandId:crypto.randomUUID(),title:'Compare community research funding models',brief:'Compare three approaches using public sources. Explain assumptions and risks.',deliverable:'A short comparison with citations and a recommendation.'});};
 create(researcher?other:wallet);
 await page.addLocatorHandler(page.getByRole('region',{name:'Analytics preferences'}),async()=>{await page.getByRole('button',{name:'Decline',exact:true}).click();});
 await page.route('**/api/research-requests',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{session:{wallet,csrf:'test'}}});
  const input=r.request().postDataJSON();expect(input.wallet).toBe(wallet);expect(r.request().headers()['x-research-csrf']).toBe('test');
  try{if(input.action!=='list')state=transition(state,{wallet,member:true,researcher},input);await r.fulfill({json:{requests:state.requests,wallet,capabilities:{member:true,researcher,researcherUnavailable:false}}});}
  catch(e:any){await r.fulfill({status:e.status||500,json:{error:e.message}});}
 });
 await page.goto('/research/requests');await fixture.connect();
 await expect(page.getByRole('heading',{name:'Research requests',exact:true})).toBeVisible();
 return {...fixture,read:()=>state,create,act:(action:string,extra={})=>{state=transition(state,{wallet:other,member:true,researcher:true},{action,id:state.requests[0].id,expectedVersion:state.requests[0].version,commandId:crypto.randomUUID(),...extra});}};
}
test('active member opens a brief, requests revisions and accepts findings',async({browser,baseURL})=>{
 const f=await board(browser,baseURL!),p=f.page;
 await p.getByRole('button',{name:'Request research',exact:true}).click();
 await p.getByLabel('Research question',{exact:true}).fill('Assess member-led research');
 await p.getByLabel('Context and scope').fill('Assess governance and participation using published evidence.');
 await p.getByLabel('Expected deliverable',{exact:true}).fill('A sourced memo');
 await p.getByRole('button',{name:'Open request',exact:true}).click();
 await expect(p.getByRole('heading',{name:'Assess member-led research'})).toBeVisible();
 f.act('accept');f.act('submit',{summary:'First findings',url:'https://example.org/report'});
 await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await p.getByText('Request revisions or cancel',{exact:true}).click();
 await p.getByLabel('Revision notes or reason').fill('Please compare participation rates.');
 await p.getByRole('button',{name:'Request revisions',exact:true}).click();
 expect(f.read().requests[0].status).toBe('in_progress');
 f.act('submit',{summary:'Updated findings with participation rates',url:''});
 await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await p.getByRole('button',{name:'Accept findings and complete',exact:true}).click();
 await expect(p.getByRole('status').filter({hasText:'Work completed.'})).toBeVisible();
 expect(f.read().requests[0].status).toBe('completed');
 await f.context.close();
});
test('Researcher accepts and submits work; desktop and mobile stay within viewport',async({browser,baseURL})=>{
 const f=await board(browser,baseURL!,true),p=f.page;
 await p.setViewportSize({width:1440,height:1100});
 await p.screenshot({path:'/tmp/research-workflow-desktop.png',fullPage:true});
 await p.getByRole('button',{name:'Accept research',exact:true}).click();
 await expect(p.getByRole('heading',{name:'Submit your findings'})).toBeVisible();
 await p.getByLabel('Findings and sources').fill('Evidence supports a staged pilot with documented review.');
 await p.getByLabel('Deliverable link (optional)').fill('https://example.org/findings');
 await p.getByRole('button',{name:'Send for review'}).click();
 await expect(p.getByRole('heading',{name:'Latest findings'})).toBeVisible();
 expect(f.read().requests[0].status).toBe('submitted');
 await p.setViewportSize({width:390,height:844});
 await p.evaluate(()=>window.scrollTo(0,0));
 await p.screenshot({path:'/tmp/research-workflow-mobile.png',fullPage:true});
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await p.evaluate(()=>(window as any).__membershipChange('account'));
 await expect(p.getByRole('heading',{name:'Latest findings'})).toHaveCount(0);
 await expect(p.getByRole('heading',{name:'Join Bittrees Research'})).toBeVisible();
 await f.context.close();
});
test('ordinary member cannot accept research',async({browser,baseURL})=>{
 const f=await board(browser,baseURL!),p=f.page;f.create(other);
 await p.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(p.getByRole('button',{name:'Accept research',exact:true})).toBeDisabled();
 await f.context.close();
});
