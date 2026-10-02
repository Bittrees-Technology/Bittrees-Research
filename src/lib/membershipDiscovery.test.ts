import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverMembershipPage } from './membershipDiscovery.ts';
import { boundedMembershipRead, retryMembershipRead, MembershipReadError } from './membershipVerification.ts';
const contract = `0x${'1'.repeat(40)}`;
const owner = `0x${'2'.repeat(40)}`;

test('discovery accepts metadata-free v2 tokens, filters the contract and carries pagination', async t => {
  t.mock.method(globalThis, 'fetch', async (input: URL) => {
    assert.equal(input.searchParams.get('withMetadata'), 'false');
    assert.equal(input.searchParams.get('owner'), owner);
    assert.deepEqual(input.searchParams.getAll('contractAddresses[]'), [contract]);
    assert.equal(input.searchParams.get('pageKey'), 'next');
    return Response.json({ ownedNfts: [{ contract: { address: contract }, id: { tokenId: '0x01' } }], pageKey: 'last' });
  });
  assert.deepEqual(await discoverMembershipPage('test-key', owner, contract, new AbortController().signal, 'next'), { ids: ['1'], pageKey: 'last' });
});

test('provider failures have safe messages and only temporary failures permit one retry', async t => {
  for (const status of [401, 403, 400, 408, 429, 500, 503]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('private provider details', { status }));
    await assert.rejects(discoverMembershipPage('test-key', owner, contract, new AbortController().signal), error => {
      assert.ok(error instanceof MembershipReadError);
      assert.equal(retryMembershipRead(0, error), [408, 429, 500, 503].includes(status));
      assert.equal(retryMembershipRead(1, error), false);
      assert.doesNotMatch(error.message, /test-key|private provider details/);
      return true;
    });
    mock.mock.restore();
  }
});

test('deadline cancels the actual fetch; cancelled sessions are not retryable', async t => {
  let aborted = false;
  t.mock.method(globalThis, 'fetch', (_input: URL, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')); });
  }));
  await assert.rejects(boundedMembershipRead((_check, signal) => discoverMembershipPage('test-key', owner, contract, signal), new AbortController().signal, 10));
  assert.equal(aborted, true);
  const controller = new AbortController();
  const pending = boundedMembershipRead((_check, signal) => discoverMembershipPage('test-key', owner, contract, signal), controller.signal);
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, error => { assert.equal(retryMembershipRead(0, error), false); return true; });
});

test('malformed or wrong-contract responses cannot become membership candidates', async t => {
  for (const data of [{}, { ownedNfts: [null] }, { error: 'failure', ownedNfts: [] }, { ownedNfts: [{ contract: { address: owner }, id: { tokenId: '1' } }] }]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(data));
    await assert.rejects(discoverMembershipPage('test-key', owner, contract, new AbortController().signal));
    mock.mock.restore();
  }
});
