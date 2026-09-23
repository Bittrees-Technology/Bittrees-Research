import {test,expect} from '@playwright/test';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {hexToString} from 'viem';
import {decryptRecoveryArchive} from '../../src/lib/chatRecoveryArchive';

test('connected wallets export local data without enabling messaging',async({browser,baseURL},info)=>{
 const account=privateKeyToAccount(generatePrivateKey()),owner=account.address.toLowerCase(),peer='0x'+'2'.repeat(40);
 const password='synthetic recovery acceptance passphrase';
 const original={
  [`bittrees.contacts.${owner}`]:JSON.stringify([{address:peer,label:'Synthetic contact'}]),
  [`bittrees.dm.saved.${owner}`]:JSON.stringify([{id:'synthetic-note',text:'Synthetic local note',sentAtMs:123}]),
  'bittrees.dm.settings':JSON.stringify({readReceipts:true}),
  'bittrees.dm.blocked':JSON.stringify([peer]),
  'bittrees.dm.prefs':JSON.stringify({'test-dm':{readReceipts:true},'room:safe-gov.bittrees.eth':{pinned:true,lastReadAt:123}}),
  'bittrees.synthetic-secret-canary':'must-not-be-exported',
 };
 const context=await browser.newContext(),signatures:string[]=[],writes:string[]=[];
 try{
  await context.route('**/*',route=>{
   const request=route.request();if(!['GET','HEAD'].includes(request.method()))writes.push(new URL(request.url()).pathname);
   return new URL(request.url()).origin===baseURL&&['GET','HEAD'].includes(request.method())?route.continue():route.abort('blockedbyclient');
  });
  await context.exposeFunction('__exportSign',async(params:string[])=>{
   expect(params[1]?.toLowerCase()).toBe(owner);const message=hexToString(params[0] as `0x${string}`);
   const match=/^Chat local data export\nOrigin: (.+)\nWallet: (.+)\nChain: (\d+)\nNonce: ([a-f0-9-]{36})\nExpires: (\d+)\nThis proof authorizes only this local encrypted export\. It grants no messaging, sync or spending authority\.$/.exec(message);
   if(!match)throw Error('Synthetic wallet declines unrelated signing.');
   expect(match[1]).toBe(baseURL);expect(match[2]).toBe(owner);expect(match[3]).toBe('1');expect(Number(match[5])).toBeGreaterThan(Date.now());expect(Number(match[5])).toBeLessThanOrEqual(Date.now()+120000);
   signatures.push(message);return account.signMessage({message});
  });
  await context.addInitScript(({address,original})=>{
   for(const [key,value]of Object.entries(original))localStorage.setItem(key,value);
   let connected=false;
   (window as any).ethereum={isMetaMask:true,on(){},removeListener(){},async request({method,params}:any){
    if(method==='eth_accounts')return connected?[address]:[];if(method==='eth_requestAccounts'){connected=true;return [address];}if(method==='eth_chainId')return '0x1';
    if(method==='personal_sign')return (window as any).__exportSign(params);
    throw Error('Synthetic wallet declines '+method);
   }};
   // Announce the synthetic extension through the standard discovery event.
   // This exercises the injected connector rather than emulating MetaMask SDK transport.
   const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{
    info:{uuid:'e8fedc6a-9159-4b34-8591-68a4b95bc728',name:'MetaMask',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'io.metamask'},
    provider:(window as any).ethereum,
   }}));
   window.addEventListener('eip6963:requestProvider',announce);announce();
  },{address:account.address,original});
  const page=await context.newPage();await page.goto('/chat');
  await expect(page.getByRole('heading',{name:'Members Chat'})).toHaveCount(0);
  await page.getByRole('link',{name:'Recover local data for Chat'}).click();
  await expect(page.getByRole('heading',{name:'Export local data to Chat'})).toHaveCount(0);
  await page.getByRole('button',{name:'Connect Wallet',exact:true}).first().click();await page.getByRole('button',{name:'MetaMask',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Export local data to Chat'})).toBeVisible();

  const panel=page.getByRole('region',{name:'Export local data to Chat'});
  await expect(panel.getByRole('button',{name:'Review export'})).toBeEnabled();expect(signatures).toHaveLength(0);
  for(const shared of [false,true]){
   await panel.getByRole('checkbox').setChecked(shared);await panel.getByRole('button',{name:'Review export'}).click();
   await panel.getByLabel('Recovery passphrase (at least 12 characters)').fill(password);await panel.getByLabel('Confirm passphrase',{exact:true}).fill(password);
   const waiting=page.waitForEvent('download');await panel.getByRole('button',{name:'Verify wallet and download'}).click();
   const download=await waiting,stream=await download.createReadStream(),chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));
   const raw=Buffer.concat(chunks).toString('utf8'),data=await decryptRecoveryArchive(raw,password,owner);
   expect(data.source).toBe('research');expect(data.contacts).toEqual(JSON.parse(original[`bittrees.contacts.${owner}`]));expect(data.notes).toEqual(JSON.parse(original[`bittrees.dm.saved.${owner}`]));
   expect(data.preferences).toEqual({readReceiptsDefault:shared,blocked:shared?[peer]:[],readReceiptOverrides:shared?{'xmtp:production:test-dm':true}:{}});
   expect(JSON.stringify(data)).not.toContain(original['bittrees.synthetic-secret-canary']);
   expect(await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(original))).toEqual(original);
  }
  expect(signatures).toHaveLength(2);expect(new Set(signatures).size).toBe(2);expect(writes.filter(path=>path.startsWith('/api/'))).toEqual([]);
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('export-before-messaging-mobile.png'),fullPage:true});
  await page.getByRole('link',{name:'Return to Research messenger'}).click();
  await expect(page.getByText('Verifying membership…',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Members Chat'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Enable direct messages',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Recover local data for Chat'}).click();
  await expect(panel.getByRole('button',{name:'Review export'})).toBeEnabled();
 }finally{await context.close().catch(()=>{});}
});
