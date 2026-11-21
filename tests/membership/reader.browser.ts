import {test, expect} from '@playwright/test';
import {decodeFunctionData, encodeFunctionResult, multicall3Abi, toHex} from 'viem';
import {fileURLToPath} from 'node:url';
import membershipAbi from '../../src/lib/constants/membership.abi.json' with {type: 'json'};

const owner = '0x1111111111111111111111111111111111111111';
const membership = '0xCecD807193Cf79B59e9C849b9CCCbA10DD6f8335';
const source = '/@fs' + fileURLToPath(new URL('../../src/lib/membershipReader.ts', import.meta.url));

for (const scenario of ['active', 'primary timeout', 'blocked', 'revoked', 'expired', 'wrong chain', 'stale', 'reorg', 'outage']) {
  test(`membership reader survives a primary quota limit with ${scenario} evidence`, async ({page}) => {
    let primaryCalls = 0, publicCalls = 0, blocks = 0;
    const now = Math.floor(Date.now() / 1000);
    await page.route('https://membership-primary.invalid/rpc', async route => {
      primaryCalls++;
      if (scenario === 'primary timeout') return;
      await route.fulfill({status: 429, body: 'Quota exhausted'});
    });
    const value = (functionName: string) => {
      switch (functionName) {
        case 'blockedWallets': return scenario === 'blocked';
        case 'lastTokenId': return 1n;
        case 'balanceOf': return 1n;
        case 'isActiveMember': return !['revoked', 'expired'].includes(scenario);
        case 'expirationTimestamps': return BigInt(now + (scenario === 'expired' ? -100 : 3600));
        case 'revokedMemberships': return scenario === 'revoked';
        default: throw Error(`Unexpected function ${functionName}`);
      }
    };
    await page.route('https://ethereum-rpc.publicnode.com/', async route => {
      publicCalls++;
      if (scenario === 'outage') return route.fulfill({status: 503, body: 'Unavailable'});
      const respond = (request: {id: number; method: string; params: [{data: `0x${string}`}]}) => {
        let result;
        switch (request.method) {
          case 'eth_chainId': result = scenario === 'wrong chain' ? '0x2105' : '0x1'; break;
          case 'eth_getBlockByNumber': {
            blocks++;
            const hash = scenario === 'reorg' && blocks > 1 ? '2' : '1';
            result = {number: '0x1900000', timestamp: toHex(now - (scenario === 'stale' ? 120 : 0)), hash: `0x${hash.repeat(64)}`}; break;
          }
          case 'eth_call': {
            const data = request.params[0].data;
            if (data.startsWith('0x82ad56cb')) {
              const decoded = decodeFunctionData({abi: multicall3Abi, data});
              if (decoded.functionName !== 'aggregate3') throw Error('Unexpected multicall');
              const results = decoded.args[0].map(call => {
                const {functionName} = decodeFunctionData({abi: membershipAbi, data: call.callData});
                return {success: true, returnData: encodeFunctionResult({abi: membershipAbi, functionName, result: value(functionName)})};
              });
              result = encodeFunctionResult({abi: multicall3Abi, functionName: 'aggregate3', result: results});
            } else {
              const {functionName} = decodeFunctionData({abi: membershipAbi, data});
              result = encodeFunctionResult({abi: membershipAbi, functionName, result: value(functionName)});
            }
            break;
          }
          default: throw Error(`Unexpected RPC ${request.method}`);
        }
        return {jsonrpc: '2.0', id: request.id, result};
      };
      const body = route.request().postDataJSON();
      await route.fulfill({json: Array.isArray(body) ? body.map(respond) : respond(body)});
    });
    await page.goto('/');
    const result = await page.evaluate(async ({source, owner, membership}) => {
      const {readMembership} = await import(source);
      try {return {tokens: await readMembership(owner, membership, new AbortController().signal, () => {})};}
      catch (error) {return {unavailable: true, error: String(error)};}
    }, {source, owner, membership});
    expect(primaryCalls).toBe(1);
    expect(publicCalls, JSON.stringify(result)).toBeGreaterThan(0);
    if (['blocked', 'wrong chain', 'stale', 'reorg', 'outage'].includes(scenario)) expect(result).toMatchObject({unavailable: true});
    else {
      expect(result, JSON.stringify(result)).toHaveProperty('tokens');
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0].active).toBe(['active', 'primary timeout'].includes(scenario));
      expect(result.tokens[0].revoked).toBe(scenario === 'revoked');
      expect(result.tokens[0].isExpired).toBe(scenario === 'expired');
    }
  });
}
