import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WalletClient } from 'viem';
import { guardPushWallet, retireRecoveredPushKey } from './pushSessionWallet.ts';
const owner = `0x${'a'.repeat(40)}`;
function wallet() { return { account: { address: owner }, chain: { id: 1 }, getAddresses: async () => [owner], getChainId: async () => 1,
  signMessage: async (_args: unknown) => '0x01', signTypedData: async (_args: unknown) => '0x02' } as unknown as WalletClient; }
test('guarded viem methods retain SDK-detected arity and check before and after approval', async () => {
  const raw = wallet(); let guards = 0; const guarded = guardPushWallet(raw, owner, () => { guards++; });
  assert.equal(guarded.signMessage.length, 1); assert.equal(guarded.signTypedData.length, 1);
  assert.equal(await guarded.signMessage({ account: owner as `0x${string}`, message: 'test' }), '0x01'); assert.ok(guards >= 5);
});
test('wallet changes while signing reject the result rather than forwarding old authority', async () => {
  const raw = wallet(); let alive = true;
  raw.signMessage = async () => { alive = false; return '0x01'; };
  const guarded = guardPushWallet(raw, owner, () => { if (!alive) throw new Error('disconnected'); });
  await assert.rejects(guarded.signMessage({ account: owner as `0x${string}`, message: 'test' }), /disconnected/);
});
test('provider account and chain mismatch reject before signing', async () => {
  const raw = wallet(); let signed = false; raw.signMessage = async () => { signed = true; return '0x01'; };
  const guarded = guardPushWallet(raw, owner, () => {});
  raw.getChainId = async () => 10; await assert.rejects(guarded.signMessage({ account: owner as `0x${string}`, message: 'test' })); assert.equal(signed, false);
});
test('only the exact verified legacy key is removed; mismatch and unavailable storage preserve originals', () => {
  const key = `bittrees.push.pgp.${owner}`; const data = new Map([[key, 'old-key'], ['unrelated', 'keep']]);
  const storage = { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => { data.delete(k); } };
  assert.throws(() => retireRecoveredPushKey(storage, owner, 'different-key')); assert.equal(data.get(key), 'old-key');
  assert.throws(() => retireRecoveredPushKey({ ...storage, removeItem() { throw new Error('blocked'); } }, owner, 'old-key'));
  assert.equal(data.get(key), 'old-key'); retireRecoveredPushKey(storage, owner, 'old-key');
  assert.equal(data.has(key), false); assert.equal(data.get('unrelated'), 'keep');
});

test('signer cannot override the session account in a message or typed-data request', async () => {
  const raw = wallet(); let signed = false; raw.signMessage = async () => { signed = true; return '0x01'; };
  const guarded = guardPushWallet(raw, owner, () => {});
  await assert.rejects(guarded.signMessage({ account: `0x${'b'.repeat(40)}` as `0x${string}`, message: 'test' }));
  await assert.rejects(guarded.signTypedData({ account: `0x${'b'.repeat(40)}` as `0x${string}`, domain: { name: 'test' }, types: { Test: [{ name: 'value', type: 'string' }] }, primaryType: 'Test', message: { value: 'x' } }));
  assert.equal(signed, false);
});

test('legacy recovery permits only the bound owner and recovery RPC methods', async () => {
  const raw = wallet(); let calls = 0; raw.request = (async () => { calls++; return 'synthetic-key'; }) as any;
  const guarded = guardPushWallet(raw, owner, () => {}) as any;
  assert.equal(await guarded.provider.provider.request({ method: 'eth_decrypt', params: ['cipher', owner] }), 'synthetic-key');
  await assert.rejects(guarded.provider.provider.request({ method: 'eth_sendTransaction', params: [{}] }), /Unsupported/);
  await assert.rejects(guarded.provider.provider.request({ method: 'eth_decrypt', params: ['cipher', `0x${'b'.repeat(40)}`] }), /Unsupported/);
  assert.equal(calls, 1);
});
test('legacy recovery result is rejected after a silent account change', async () => {
  const raw = wallet(); raw.request = (async () => { raw.getAddresses = async () => []; return 'synthetic-key'; }) as any;
  const guarded = guardPushWallet(raw, owner, () => {}) as any;
  await assert.rejects(guarded.provider.provider.request({ method: 'eth_decrypt', params: ['cipher', owner] }), /session changed/);
});
