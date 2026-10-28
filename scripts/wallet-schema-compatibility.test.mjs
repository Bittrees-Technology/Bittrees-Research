import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Abi, TypedData } from 'abitype/zod';

// Exercise the actual transitive schemas, rather than a lookalike Zod schema.
const require = createRequire(import.meta.url);
const walletEntry = require.resolve('@reown/appkit-wallet');
const frame = await import(pathToFileURL(resolve(dirname(walletEntry), '../src/W3mFrameSchema.js')));

test('wallet connection, network and theme payloads retain their validation', () => {
  assert.deepEqual(frame.AppSwitchNetworkRequest.parse({ chainId: '1' }), { chainId: '1' });
  assert.equal(frame.AppSwitchNetworkRequest.safeParse({ chainId: null }).success, false);
  assert.equal(frame.AppConnectEmailRequest.safeParse({ email: 'invalid' }).success, false);
  assert.equal(frame.AppConnectEmailRequest.safeParse({ email: 'test@example.org' }).success, true);
  const theme = { themeMode: 'dark', themeVariables: { color: '#fff', radius: 4 }, w3mThemeVariables: { color: '#fff' } };
  assert.deepEqual(frame.AppSyncThemeRequest.parse(theme), theme);
  assert.equal(frame.AppSyncThemeRequest.safeParse({ themeVariables: { invalid: null } }).success, false);
});

test('wallet request schemas and frame envelopes reject malformed input', () => {
  for (const [name, schema] of Object.entries(frame)) {
    // RpcResponse intentionally permits arbitrary JSON-RPC result values, including null.
    if (typeof schema?.safeParse === 'function' && name !== 'RpcResponse') {
      assert.equal(schema.safeParse(null).success, false, name);
    }
  }
  for (const schema of Object.values(frame.W3mFrameSchema)) {
    assert.equal(schema.safeParse({ type: 'UNKNOWN', payload: null }).success, false);
  }
});

test('ABI validation accepts contract interfaces and rejects invalid types', () => {
  const abi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }];
  assert.deepEqual(Abi.parse(abi), abi);
  assert.equal(Abi.safeParse([{ ...abi[0], inputs: [{ type: 'not-a-solidity-type' }] }]).success, false);
  assert.equal(Abi.safeParse([{ ...abi[0], stateMutability: 'unrestricted' }]).success, false);
});

test('typed-data schema preserves signing structure and rejects malformed definitions', () => {
  const types = { Message: [{ name: 'contents', type: 'string' }] };
  assert.deepEqual(TypedData.parse(types), types);
  assert.equal(TypedData.safeParse({ Message: [{ name: 'contents', type: null }] }).success, false);
});


test('Coinbase EIP-712 policy maps preserve validation with the patched parser', async () => {
  const sdkEntry = require.resolve('@coinbase/cdp-sdk');
  const sdkRoot = resolve(dirname(sdkEntry), '..');
  const esm = await import(pathToFileURL(resolve(sdkRoot, '_esm/policies/evmSchema.js')));
  const cjs = require(resolve(sdkRoot, '_cjs/policies/evmSchema.js'));
  const criterion = {
    type: 'evmTypedDataField',
    types: { types: { Message: [{ name: 'contents', type: 'string' }] }, primaryType: 'Message' },
    conditions: [{ path: 'contents', match: '^hello$' }],
  };
  for (const schemas of [esm, cjs]) {
    assert.deepEqual(schemas.SignEvmTypedDataFieldCriterionSchema.parse(criterion), criterion);
    assert.equal(schemas.SignEvmTypedDataFieldCriterionSchema.safeParse({ ...criterion, types: { ...criterion.types, types: { Message: [{ name: 'contents', type: null }] } } }).success, false);
    assert.equal(schemas.SignEvmTypedDataFieldCriterionSchema.safeParse({ ...criterion, conditions: [] }).success, false);
    assert.equal(schemas.EthValueCriterionSchema.safeParse({ type: 'ethValue', operator: 'unrestricted', ethValue: '1' }).success, false);
  }
});
