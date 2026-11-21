import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient, decodeFunctionData, encodeFunctionResult, parseAbi, toHex} from 'viem';
import {mainnet} from 'viem/chains';
import {mainnetTransport, PUBLIC_MAINNET_RPC} from '../shared/mainnet-rpc.mjs';
import {readResearchCredentials} from '../server/research-native-authority.mjs';
import {chainFixture, wallet} from '../tests/fixtures/research-native.mjs';
import membershipAbi from '../src/lib/constants/membership.abi.json' with {type: 'json'};
import credentialsAbi from '../src/lib/constants/credentials.abi.json' with {type: 'json'};

const primary = 'https://configured-provider.invalid';
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
function client(fetchFn, options = {}) {
  return createPublicClient({chain: mainnet, transport: mainnetTransport(primary, {batch: false, fetchFn: (url, init) => fetchFn(String(url).replace(/\/$/, ''), init), ...options})});
}
for (const failure of ['http quota', 'rpc quota', 'timeout', 'network']) {
  test(`${failure} switches to public mainnet and skips the failed provider on subsequent reads`, async () => {
    const calls = [];
    const reader = client(async (url, init) => {
      calls.push(url);
      if (url === primary) {
        if (failure === 'http quota') return new Response('Quota exhausted', {status: 429});
        if (failure === 'rpc quota') return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, error: {code: -32005, message: 'Limit exceeded'}});
        if (failure === 'network') throw new TypeError('Connection failed');
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true}));
      }
      return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, result: '0x1'});
    }, {timeout: 20});
    assert.equal(await reader.getChainId(), 1);
    assert.equal(await reader.getChainId(), 1);
    assert.deepEqual(calls, [primary, PUBLIC_MAINNET_RPC, PUBLIC_MAINNET_RPC]);
  });
}
test('healthy primary does not contact the fallback', async () => {
  const calls = [];
  assert.equal(await client(async (url, init) => {
    calls.push(url);
    return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, result: '0x1'});
  }).getChainId(), 1);
  assert.deepEqual(calls, [primary]);
});
test('all providers unavailable rejects after one attempt per endpoint', async () => {
  const calls = [];
  await assert.rejects(client(async url => {calls.push(url); return new Response('Unavailable', {status: 503});}).getChainId());
  assert.deepEqual(calls, [primary, PUBLIC_MAINNET_RPC]);
});
test('contract reverts do not retry against another provider', async () => {
  const calls = [];
  await assert.rejects(client(async (url, init) => {
    calls.push(url);
    return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, error: {code: 3, message: 'execution reverted'}});
  }).request({method: 'eth_call', params: [{to: wallet, data: '0x'}, 'latest']}));
  assert.deepEqual(calls, [primary]);
});
for (const error of [
  {code: 3, message: 'Transaction failed'},
  {code: -32000, message: 'Custom contract error', data: '0x08c379a0'},
  {code: -32005, message: 'Transaction failed', data: '0x08c379a0'},
  {code: -32000, message: 'Custom contract error', data: {data: '0x08c379a0'}},
]) {
  test(`generic RPC revert stays terminal ${JSON.stringify(error)}`, async () => {
    const calls = [];
    await assert.rejects(client(async (url, init) => {
      calls.push(url);
      return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, error});
    }).request({method: 'eth_call', params: [{to: wallet, data: '0x'}, 'latest']}));
    assert.deepEqual(calls, [primary]);
  });
}
test('a quota JSON-RPC envelope still recovers after HTTP status decoding', async () => {
  const calls = [];
  const reader = client(async (url, init) => {
    calls.push(url);
    const request = JSON.parse(init.body);
    if (url === primary) return new Response(JSON.stringify({jsonrpc: '2.0', id: request.id, error: {code: -32000, message: 'Monthly capacity limit exceeded'}}), {status: 429, headers: {'content-type': 'application/json'}});
    return json({jsonrpc: '2.0', id: request.id, result: '0x1'});
  });
  assert.equal(await reader.getChainId(), 1);
  assert.equal(await reader.getChainId(), 1);
  assert.deepEqual(calls, [primary, PUBLIC_MAINNET_RPC, PUBLIC_MAINNET_RPC]);
});
test('cancelled reads never contact either provider', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(client(async () => {calls++; return json({result: '0x1'});}, {fetchOptions: {signal: controller.signal}}).getChainId());
  assert.equal(calls, 0);
});
test('a caller cancellation signal preserves the per-provider timeout and fallback budget', async () => {
  const calls = [], controller = new AbortController();
  const reader = client(async (url, init) => {
    calls.push(url);
    if (url === primary) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true}));
    return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, result: '0x1'});
  }, {timeout: 20, fetchOptions: {signal: controller.signal}});
  assert.equal(await reader.getChainId(), 1);
  assert.equal(controller.signal.aborted, false);
  assert.deepEqual(calls, [primary, PUBLIC_MAINNET_RPC]);
});
test('cancellation during a stalled request prevents contacting the fallback', async () => {
  const calls = [], controller = new AbortController();
  const reader = client(async (url, init) => {
    calls.push(url);
    controller.abort();
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  }, {fetchOptions: {signal: controller.signal}});
  await assert.rejects(reader.getChainId());
  assert.deepEqual(calls, [primary]);
});
test('public default is deduplicated and a healthy primary is retried after cooldown', async () => {
  const calls = [];
  const now = Date.now;
  let clock = now();
  Date.now = () => clock;
  try {
    const reader = client(async (url, init) => {
      calls.push(url);
      if (calls.length === 1) return new Response('Quota exhausted', {status: 429});
      return json({jsonrpc: '2.0', id: JSON.parse(init.body).id, result: '0x1'});
    });
    await reader.getChainId(); clock += 60_001; await reader.getChainId();
    assert.deepEqual(calls, [primary, PUBLIC_MAINNET_RPC, primary]);
    let defaults = 0;
    const transport = mainnetTransport(PUBLIC_MAINNET_RPC, {batch: false, fetchFn: async () => {defaults++; return new Response('Unavailable', {status: 503});}});
    await assert.rejects(createPublicClient({chain: mainnet, transport}).getChainId());
    assert.equal(defaults, 1);
  } finally {Date.now = now;}
});

// Exercise native authority through real Viem decoding and the fallback transport.
// All chain data comes from the existing negative-authority fixtures, never a live wallet.
for (const scenario of [{}, {revoked: true}, {parentExpired: true}, {badCode: true}, {stale: true}, {chain: 8453}, {reorg: true, midway: true}]) {
  test(`native authority on quota fallback preserves validity checks ${JSON.stringify(scenario)}`, async () => {
    const fixture = chainFixture(scenario);
    const adminAbi = parseAbi(['function owner() view returns(address)', 'function rootAuthority() view returns(address)', 'function researchAuthority() view returns(address)']);
    const abi = [...membershipAbi, ...credentialsAbi, ...adminAbi];
    const seen = [];
    const rpc = client(async (url, init) => {
      seen.push(url);
      if (url === primary && (!scenario.midway || seen.filter(endpoint => endpoint === primary).length > 2)) return new Response('Quota exhausted', {status: 429});
      const request = JSON.parse(init.body), params = request.params || [];
      let result;
      switch (request.method) {
        case 'eth_chainId': result = toHex(await fixture.client.getChainId()); break;
        case 'eth_getCode': result = await fixture.client.getCode(); break;
        case 'eth_getStorageAt': result = await fixture.client.getStorageAt({address: params[0], slot: params[1]}); break;
        case 'eth_getBlockByNumber': {
          const tag = params[0];
          const block = await fixture.client.getBlock(tag.startsWith('0x') ? {blockNumber: BigInt(tag)} : {blockTag: tag});
          result = {...block, number: toHex(block.number), timestamp: toHex(block.timestamp)}; break;
        }
        case 'eth_call': {
          const {functionName, args} = decodeFunctionData({abi, data: params[0].data});
          const value = await fixture.client.readContract({address: params[0].to, functionName, args, blockNumber: BigInt(params[1])});
          result = encodeFunctionResult({abi, functionName, result: value}); break;
        }
        default: throw Error(`Unexpected RPC method ${request.method}`);
      }
      return json({jsonrpc: '2.0', id: request.id, result});
    });
    const proof = await readResearchCredentials(wallet, {...fixture, client: rpc});
    if (Object.keys(scenario).length === 0) {
      assert.equal(proof.status, 'current'); assert(proof.actions.includes('research.credentials.assign'));
    } else assert.deepEqual(proof.actions, []);
    assert(seen.includes(PUBLIC_MAINNET_RPC));
    assert(seen.filter(url => url === primary).length <= (scenario.midway ? 3 : 2));
  });
}
