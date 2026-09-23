import { expect, type Browser } from '@playwright/test';
import { decodeFunctionData, encodeFunctionResult, encodeFunctionData, multicall3Abi, parseAbi } from 'viem';
const owner = `0x${'1'.repeat(40)}`, other = `0x${'2'.repeat(40)}`;
const contract = '0xc8121e650bd797d8b9dad00227a9a77ef603a84a';
// Production may use a dedicated RPC. Intercept its observed origin explicitly;
// do not print keys/paths or allow any wallet/network write through this fixture.
const rpcOrigin = process.env.RESEARCH_MEMBERSHIP_RPC_ORIGIN || 'https://eth.merkle.io';
const rpcUrl = new URL(rpcOrigin);
if (rpcUrl.protocol !== 'https:' || rpcUrl.origin !== rpcOrigin) throw Error('Membership test RPC must be an explicit HTTPS origin without credentials or a path.');
const abi = parseAbi(['function balanceOf(address,uint256) view returns (uint256)', 'function isExpired(uint256) view returns (bool)', 'function expirationTimestamps(uint256) view returns (uint256)', 'function mintPrice() view returns (uint256)', 'function expirationTimeframe() view returns (uint256)', 'function mintMembership(address) payable returns (uint256)']);
type Mode = 'valid' | 'failed' | 'missing' | 'expired' | 'zero' | 'transferred' | 'empty' | 'loop' | 'hang' | 'expiring' | 'renewed';
export async function setup(browser: Browser, baseURL: string, initial: Mode, cached = false, clock = false, mint = false) {
  const context = await browser.newContext();
  const mintHash=`0x${'3'.repeat(64)}`;
  const mintData=encodeFunctionData({abi,functionName:'mintMembership',args:[owner as `0x${string}`]});
  const expiry=Math.floor(Date.now()/1000)+3600;
  let receiptReady=false, receiptReads=0;
  const block=()=>receiptReady?'0x1000001':'0x1000000';
  let mode = initial, nftReads = 0, calls = 0, release = () => {};
  const writes: string[] = [], balances: string[] = [];
  const held = new Promise<void>(resolve => { release = resolve; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'eth-mainnet.g.alchemy.com' && url.pathname.endsWith('/getNFTs')) {
      nftReads++; expect(request.method()).toBe('GET');
      const requestedOwner = url.searchParams.get('owner')?.toLowerCase();
      expect([owner, other]).toContain(requestedOwner);
      expect(url.searchParams.getAll('contractAddresses[]')).toEqual([contract]);
      if (mode === 'hang') await held;
      return route.fulfill({ json: { ownedNfts: mode === 'empty' || requestedOwner === other ? [] : (mode==='renewed'?['0x01','0x02']:['0x01']).map(tokenId=>({ contract:{address:contract}, id:{tokenId,tokenMetadata:{tokenType:'ERC1155'}},title:'Synthetic membership',media:[],balance:'1'})), totalCount: 1, ...(mode === 'loop' ? { pageKey: 'repeated' } : {}) } });
    }
    if (url.origin === rpcOrigin && request.method() === 'POST') {
      const input = request.postDataJSON();
      const respond = (rpc: any) => {
        if (rpc.method === 'eth_blockNumber') return { jsonrpc: '2.0', id: rpc.id, result: block() };
        const success=(result:any)=>({jsonrpc:'2.0',id:rpc.id,result});
        const unavailable=()=>({jsonrpc:'2.0',id:rpc.id,error:{code:-32000,message:'Unrelated read unavailable'}});
        if(mint && rpc.method==='eth_chainId') return success('0x1');
        if(mint && rpc.method==='eth_getTransactionReceipt') {
          expect(rpc.params[0]).toBe(mintHash);receiptReads++;
          return success(receiptReady?{transactionHash:mintHash,transactionIndex:'0x0',blockHash:`0x${'4'.repeat(64)}`,blockNumber:block(),from:owner,to:contract,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x1',contractAddress:null,logs:[],logsBloom:`0x${'0'.repeat(512)}`,status:'0x1',type:'0x2'}:null);
        }
        if(mint && rpc.method==='eth_getTransactionByHash') {
          expect(rpc.params[0]).toBe(mintHash);
          return success({hash:mintHash,from:owner,to:contract,input:mintData,value:'0x1',nonce:'0x0',gas:'0x100000',maxFeePerGas:'0x1',maxPriorityFeePerGas:'0x1',type:'0x2',chainId:'0x1',blockHash:receiptReady?`0x${'4'.repeat(64)}`:null,blockNumber:receiptReady?block():null,transactionIndex:receiptReady?'0x0':null});
        }
        if(mint && rpc.method==='eth_call' && rpc.params[0]?.to?.toLowerCase()===contract) {
          const call=decodeFunctionData({abi,data:rpc.params[0].data});
          if(call.functionName!=='mintMembership')return unavailable();
          expect([owner,other]).toContain(call.args[0].toLowerCase());
          return success(encodeFunctionResult({abi,functionName:'mintMembership',result:1n}));
        }
        if (rpc.method !== 'eth_call') return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Synthetic read-only RPC' } };
        let outer: any;
        try { outer = decodeFunctionData({ abi: multicall3Abi, data: rpc.params[0].data }); } catch { return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Unrelated read unavailable' } }; }
        const batch = outer.args[0];
        const membership = batch.every((item: any) => item.target.toLowerCase() === contract);
        if (!membership) return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Unrelated read unavailable' } };
        try { batch.forEach((item: any) => decodeFunctionData({ abi, data: item.callData })); } catch { return { jsonrpc:'2.0', id:rpc.id, error:{code:-32000,message:'Unrelated membership read unavailable'} }; }
        const decodedCalls=batch.map((item:any)=>decodeFunctionData({abi,data:item.callData}));
        const verification=decodedCalls.every((call:any)=>['balanceOf','isExpired','expirationTimestamps'].includes(call.functionName));
        if(!verification && !mint)return unavailable();
        if(verification){calls++;expect(rpc.params[1]).toBe(block());}
        const returned = batch.map((item: any) => {
          const decoded = decodeFunctionData({ abi, data: item.callData });
          if (decoded.functionName === 'balanceOf') { expect(decoded.args[0].toLowerCase()).toBe(owner); balances.push(decoded.args[0]); }
          const value = decoded.functionName === 'mintPrice' ? 1n : decoded.functionName === 'expirationTimeframe' ? 31104000n : decoded.functionName === 'balanceOf' ? (mode === 'transferred' ? 0n : 1n)
            : decoded.functionName === 'isExpired' ? mode === 'expired'
            : mode === 'zero' ? 0n : BigInt(mode==='expiring'?Math.floor(Date.now()/1000)+3:expiry);
          return { success: !(mode === 'failed' && decoded.functionName === 'isExpired'), returnData: encodeFunctionResult({ abi, functionName: decoded.functionName, result: value } as any) };
        });
        if (mode === 'missing') returned.pop();
        return { jsonrpc: '2.0', id: rpc.id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: returned }) };
      };
      return route.fulfill({ json: Array.isArray(input) ? input.map(respond) : respond(input) });
    }
    if (url.origin === baseURL && ['GET','HEAD'].includes(request.method())) return route.continue();
    if (url.origin === baseURL) writes.push(url.pathname);
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ owner, other, contract, cached, mint, mintHash, mintData }) => {
    if (cached) {
      localStorage.setItem(`br_membership_${owner}`, JSON.stringify([{ tokenId: '1', isExpired: false, expiresAt: 9999999999 }]));
      localStorage.setItem(`br_nfts_1_${owner}_${contract}`, JSON.stringify([{ tokenId: '1', contract: { address: contract } }]));
    }
    (window as any).__mintTransactions=0;
    let connected = false, address = owner, chain = '0x1';
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(fn => fn(value));
    (window as any).__membershipChange = (kind: string) => {
      if (kind === 'account') { address = other; emit('accountsChanged', [address]); }
      if (kind === 'return') { address = owner; emit('accountsChanged', [address]); }
      if (kind === 'chain') { chain = '0x2105'; emit('chainChanged', chain); }
      if (kind === 'disconnect') { connected = false; emit('accountsChanged', []); emit('disconnect', {code:4900,message:'Synthetic disconnect'}); }
    };
    const provider = { isMetaMask: true,
      on(event: string, fn: (...args: any[]) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
      removeListener(event: string, fn: (...args: any[]) => void) { listeners.get(event)?.delete(fn); },
      async request({ method, params }: { method: string; params?: any[] }) {
        if (method === 'eth_accounts') return connected ? [address] : [];
        if (method === 'eth_requestAccounts') { connected = true; return [address]; }
        if (method === 'eth_chainId') return chain;
        if(mint && method==='eth_sendTransaction') {
          const tx=params?.[0];
          if(!connected || address!==owner || chain!=='0x1' || tx?.to?.toLowerCase()!==contract || tx?.from?.toLowerCase()!==owner || tx?.data?.toLowerCase()!==mintData.toLowerCase() || BigInt(tx?.value||'0')!==1n) throw Error('Synthetic wallet rejected unexpected transaction');
          (window as any).__mintTransactions++; return mintHash;
        }
        throw Error('Synthetic wallet refuses ' + method);
      },
    };
    (window as any).ethereum = provider;
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'e8fedc6a-9159-4b34-8591-68a4b95bc728', name: 'MetaMask', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'io.metamask' }, provider } }));
    window.addEventListener('eip6963:requestProvider', announce); announce();
  }, { owner, other, contract, cached, mint, mintHash, mintData });
  const page = await context.newPage();
  if (clock) await page.clock.install();
  const connect = async () => { await page.getByRole('button', { name: 'Connect Wallet', exact: true }).first().click(); await page.getByRole('button', { name: /^MetaMask(?:\s|$)/ }).click(); };
  await page.goto('/chat'); await connect();
  return { page, context, connect, mintHash, confirmTransaction:()=>{receiptReady=true;}, setMode: (value: Mode) => { mode = value; }, release,
    stats: () => ({ nftReads, calls, writes, balances, receiptReads }), close: async () => { release(); expect(writes).toEqual([]); await context.close(); } };
}
