import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateTokenIds, verifiedMembershipTokens, boundedMembershipRead, createMembershipSession } from './membershipVerification.ts';
const contract = `0x${'1'.repeat(40)}`;
const ok = (result: unknown) => ({ status: 'success', result });
const nft = (tokenId: unknown, address = contract) => ({ tokenId, contract: { address } });
test('candidate discovery validates contract and uint256 IDs and deduplicates normalized tokens', () => {
  assert.deepEqual(candidateTokenIds([nft('0x01'), nft('1'), nft('2')], contract), ['1', '2']);
  for (const bad of [null, {}, [null], [nft('-1')], [nft('NaN')], [nft(1)], [nft('2', `0x${'2'.repeat(40)}`)], [nft((2n ** 256n).toString())], Array(1001).fill(nft('1'))]) assert.throws(() => candidateTokenIds(bad, contract));
});
test('access needs positive ownership and valid current expiry; stale indexer ownership cannot grant access', () => {
  assert.deepEqual(verifiedMembershipTokens(['1', '2', '3', '4'], [ok(1n), ok(false), ok(200n), ok(0n), ok(false), ok(300n), ok(1n), ok(true), ok(400n), ok(1n), ok(false), ok(100n)], 100), [
    { tokenId: '1', expiresAt: 200, isExpired: false }, { tokenId: '3', expiresAt: 400, isExpired: true }, { tokenId: '4', expiresAt: 100, isExpired: true },
  ]);
  assert.equal(verifiedMembershipTokens(['1'], [ok(1n), ok(false), ok(0n)], 100)[0].isExpired, true);
});
test('partial, reverted, missing or ill-typed contract results never become active membership', () => {
  const valid = [ok(1n), ok(false), ok(200n)];
  for (let index = 0; index < 3; index++) for (const bad of [undefined, null, {}, {status:'failure'}, ok('false'), ok(null)]) {
    const values = [...valid]; values[index] = bad as any; assert.throws(() => verifiedMembershipTokens(['1'], values, 100));
  }
  for (const results of [[], valid.slice(0, 2), [...valid, ok(1n)], [ok(-1n),ok(false),ok(200n)], [ok(1n),ok(false),ok(8_640_000_000_001n)]]) assert.throws(() => verifiedMembershipTokens(['1'], results, 100));
});
test('a bounded read settles on deadline and prevents late follow-up work', async () => {
  let release!: () => void, followed = false;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const result = boundedMembershipRead(async check => { await wait; check(); followed = true; return true; }, new AbortController().signal, 10);
  await assert.rejects(result); release(); await Promise.resolve(); await Promise.resolve(); assert.equal(followed, false);
});
test('aborted verification cannot start or publish, while successful reads return evidence', async () => {
  const cancelled = new AbortController(); cancelled.abort(); let ran = false;
  await assert.rejects(boundedMembershipRead(async () => { ran = true; }, cancelled.signal)); assert.equal(ran, false);
  const active = new AbortController(); let release!: () => void;
  const result = boundedMembershipRead(async check => { await new Promise<void>(resolve => { release = resolve; }); check(); return true; }, active.signal);
  await Promise.resolve(); active.abort(); await assert.rejects(result); release();
  assert.equal(await boundedMembershipRead(async () => 'verified', new AbortController().signal), 'verified');
});
test('wallet, chain, connector and same-wallet reconnects have distinct verification sessions', () => {
  let scope: string | null = 'a:1:extension'; const session = createMembershipSession(() => scope);
  const original = session.getSnapshot(); let notices = 0; const unsubscribe = session.subscribe(() => notices++);
  session.observe(); assert.equal(session.getSnapshot(), original);
  for (const next of ['b:1:extension', 'a:1:extension', 'a:8453:extension', 'a:8453:other', null, 'a:1:extension']) { scope = next; session.observe(); }
  assert.equal(session.getSnapshot().revision, 6); assert.equal(notices, 6); assert.notEqual(session.getSnapshot(), original);
  unsubscribe(); session.invalidate(); assert.equal(notices, 6);
});
