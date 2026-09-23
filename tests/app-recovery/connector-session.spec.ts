import {test,expect} from '@playwright/test';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {hexToString} from 'viem';
import {decryptRecoveryArchive} from '../../src/lib/chatRecoveryArchive';

// Use the production RainbowKit/Wagmi stack. Only the injected wallet boundary is
// synthetic; no connector hooks or wallet clients are substituted.
for(const change of ['account','chain','disconnect'] as const){
 test(`real connector cancels an export across ${change} changes and permits a fresh review`,async({browser,baseURL})=>{
  const accounts=[privateKeyToAccount(generatePrivateKey()),privateKeyToAccount(generatePrivateKey())];
  const owners=accounts.map(a=>a.address.toLowerCase());
  const original=Object.fromEntries(owners.map((owner,i)=>[`bittrees.dm.saved.${owner}`,JSON.stringify([{id:`note-${i}`,text:`Synthetic note ${i}`,sentAtMs:123}]) ]));
  const password='synthetic connector recovery passphrase';
  const context=await browser.newContext();
  let release:()=>void=()=>{};let signing=false;let signatures=0;const writes:string[]=[];
  try{
   await context.route('**/*',route=>{
    const request=route.request();if(new URL(request.url()).origin===baseURL&&!['GET','HEAD'].includes(request.method()))writes.push(request.url());
    return new URL(request.url()).origin===baseURL&&['GET','HEAD'].includes(request.method())?route.continue():route.abort('blockedbyclient');
   });
   await context.exposeFunction('__connectorSign',async(params:string[])=>{
    const index=owners.indexOf(params[1]?.toLowerCase());expect(index).toBeGreaterThanOrEqual(0);
    const message=hexToString(params[0] as `0x${string}`);
    const match=/^Chat local data export\nOrigin: (.+)\nWallet: (.+)\nChain: (\d+)\nNonce: ([a-f0-9-]{36})\nExpires: (\d+)\nThis proof authorizes only this local encrypted export\. It grants no messaging, sync or spending authority\.$/.exec(message);
    if(!match)throw Error('Unrelated signature declined.');
    expect(match[1]).toBe(baseURL);expect(match[2]).toBe(owners[index]);
    expect(Number(match[3])).toBe(signatures===0||change!=='chain'?1:8453);
    expect(Number(match[5])).toBeGreaterThan(Date.now());expect(Number(match[5])).toBeLessThanOrEqual(Date.now()+120000);
    signatures++;
    if(signatures===1){signing=true;await new Promise<void>(resolve=>{release=resolve;});}
    return accounts[index].signMessage({message});
   });
   await context.addInitScript(({addresses,original})=>{
    for(const [key,value]of Object.entries(original))localStorage.setItem(key,value);
    let connected=false,address=addresses[0],chain='0x1';
    const listeners=new Map<string,Set<(...args:any[])=>void>>();
    const emit=(event:string,value:unknown)=>listeners.get(event)?.forEach(fn=>fn(value));
    (window as any).__connectorChange=(kind:string)=>{
     if(kind==='account'){address=addresses[1];emit('accountsChanged',[address]);}
     if(kind==='chain'){chain='0x2105';emit('chainChanged',chain);}
     if(kind==='disconnect'){connected=false;emit('accountsChanged',[]);emit('disconnect',{code:4900,message:'Synthetic disconnect'});}
    };
    (window as any).__signFinished=0;
    (window as any).ethereum={isMetaMask:true,
     on(event:string,fn:(...args:any[])=>void){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn);},
     removeListener(event:string,fn:(...args:any[])=>void){listeners.get(event)?.delete(fn);},
     async request({method,params}:any){
      if(method==='eth_accounts')return connected?[address]:[];
      if(method==='eth_requestAccounts'){connected=true;return[address];}
      if(method==='eth_chainId')return chain;
      if(method==='personal_sign'){try{return await(window as any).__connectorSign(params);}finally{(window as any).__signFinished++;}}
      throw Error('Synthetic wallet declines '+method);
     }};
   // Announce the synthetic extension through the standard discovery event.
   // This exercises the injected connector rather than emulating MetaMask SDK transport.
   const announce=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{
    info:{uuid:'e8fedc6a-9159-4b34-8591-68a4b95bc728',name:'MetaMask',icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',rdns:'io.metamask'},
    provider:(window as any).ethereum,
   }}));
   window.addEventListener('eip6963:requestProvider',announce);announce();
   },{addresses:accounts.map(a=>a.address),original});
   const page=await context.newPage();let downloads=0;page.on('download',()=>downloads++);
   await page.goto('/chat-recovery');
   const connect=async()=>{
    await page.getByRole('button',{name:'Connect Wallet',exact:true}).first().click();
    await page.getByRole('button',{name:/^MetaMask(?:\s|$)/}).click();
    await expect(page.getByRole('heading',{name:'Export local data to Chat'})).toBeVisible();
   };
   await connect();

   const panel=page.getByRole('region',{name:'Export local data to Chat'});
   const review=async()=>{
    await panel.getByRole('button',{name:'Review export',exact:true}).click();
    await panel.getByLabel('Recovery passphrase (at least 12 characters)').fill(password);
    await panel.getByLabel('Confirm passphrase',{exact:true}).fill(password);
   };
   await review();await panel.getByRole('button',{name:'Verify wallet and download'}).click();
   await expect.poll(()=>signing).toBe(true);
   await page.evaluate(kind=>(window as any).__connectorChange(kind),change);
   await expect(page.getByLabel('Recovery passphrase (at least 12 characters)')).toHaveCount(0);
   release();await page.waitForFunction(()=>(window as any).__signFinished===1);
   if(change==='disconnect'){
    await connect();
   }
   await review();expect(downloads).toBe(0);
   const expected=change==='account'?owners[1]:owners[0];
   await expect(panel).toContainText(`Wallet: ${expected}`);
   const waiting=page.waitForEvent('download');await panel.getByRole('button',{name:'Verify wallet and download'}).click();
   const download=await waiting,stream=await download.createReadStream(),chunks:Buffer[]=[];
   for await(const chunk of stream)chunks.push(Buffer.from(chunk));
   const data=await decryptRecoveryArchive(Buffer.concat(chunks).toString('utf8'),password,expected);
   expect(data.notes).toEqual(JSON.parse(original[`bittrees.dm.saved.${expected}`]));
   expect(downloads).toBe(1);expect(signatures).toBe(2);expect(writes).toEqual([]);
   expect(await page.evaluate(keys=>Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)])),Object.keys(original))).toEqual(original);
  }finally{release();await context.close().catch(()=>{});}
 });
}
