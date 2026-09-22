import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertExportUnchanged, proveExportWallet, reviewChatExport, type ExportWallet } from '../../src/lib/chatRecoveryExport.ts';
import { decryptRecoveryArchive, encryptRecoveryArchive } from '../../src/lib/chatRecoveryArchive.ts';
const owner = `0x${'a'.repeat(40)}`;
const peer = `0x${'b'.repeat(40)}`;
const contacts = `bittrees.contacts.${owner}`;
const notes = `bittrees.dm.saved.${owner}`;
function storage(values: Record<string, string> = {}) {
  const reads: string[] = [];
  return { values, reads, getItem(key: string) { reads.push(key); return values[key] ?? null; } };
}
test('reads only connected wallet data and preserves optional labels, note IDs and timestamps', () => {
  const s = storage({ [contacts]: JSON.stringify([{ address: peer }]), [notes]: JSON.stringify([{ id: 'saved-1', text: 'Private note', sentAtMs: 9 }]),
    [`bittrees.sync.sig.${owner}`]: 'never read', [`bittrees.push.pgp.${owner}`]: 'never read', 'bittrees.dm.settings': '{broken' });
  const review = reviewChatExport(s, owner.toUpperCase().replace('0X', '0x'), false, 'governance', 10);
  assert.deepEqual(s.reads, [contacts, notes]);
  assert.deepEqual(review.data.contacts, [{ address: peer, label: '' }]);
  assert.equal(review.data.notes[0].id, 'saved-1');
  assert.equal(review.data.preferences.readReceiptsDefault, false);
  assert.equal(Object.keys(s.values).length, 5);
});
test('shared preferences require opt-in and map receipt overrides only to the production XMTP route', () => {
  const s = storage({ 'bittrees.dm.settings': '{"readReceipts":false}', 'bittrees.dm.blocked': JSON.stringify([peer]),
    'bittrees.dm.prefs': '{"abc":{"readReceipts":true,"pinned":true,"archived":false,"lastReadAt":9,"order":1}}' });
  const review = reviewChatExport(s, owner, true, 'research');
  assert.deepEqual(review.data.preferences, { blocked: [peer], readReceiptsDefault: false, readReceiptOverrides: { 'xmtp:production:abc': true } });
  assert.equal(JSON.stringify(review.data).includes('pinned'), false);
  assert.equal(reviewChatExport(storage(), owner, true, 'governance').data.preferences.readReceiptsDefault, true);
});
test('rejects malformed, credential-shaped, duplicate and oversized records without changing raw storage', () => {
  for (const raw of ['{broken', '{}', '[null]', JSON.stringify([{ address: peer, privateKey: 'secret' }]), JSON.stringify([{ address: peer }, { address: peer.toUpperCase().replace('0X', '0x') }]), ' '.repeat(512 * 1024 + 1)]) {
    const s = storage({ [contacts]: raw }); assert.throws(() => reviewChatExport(s, owner, false, 'governance')); assert.equal(s.values[contacts], raw);
  }
  assert.throws(() => reviewChatExport(storage({ [notes]: '[{"id":"x","text":"n","sentAtMs":-1}]' }), owner, false, 'governance'));
  assert.throws(() => reviewChatExport(storage({ 'bittrees.dm.prefs': '{"__proto__":{"readReceipts":true}}' }), owner, true, 'governance'));
  assert.throws(() => reviewChatExport(storage({ 'bittrees.dm.settings': '{"readReceipts":"true"}' }), owner, true, 'governance'));
  assert.throws(() => reviewChatExport(storage(), 'not-wallet', false, 'governance'));
});
test('detects changed and newly created source records without resetting them', () => {
  const s = storage(); const review = reviewChatExport(s, owner, false, 'governance');
  assertExportUnchanged(s, review); s.values[notes] = '[]'; assert.throws(() => assertExportUnchanged(s, review)); assert.equal(s.values[notes], '[]');
});
test('archive encrypts interoperable typed data, rejecting another wallet and a wrong passphrase', async () => {
  const review = reviewChatExport(storage({ [contacts]: JSON.stringify([{ address: peer, label: 'Friend' }]) }), owner, false, 'governance');
  const file = await encryptRecoveryArchive(review.data, 'test-passphrase-only');
  assert.equal(file.includes('Friend'), false);
  assert.deepEqual(await decryptRecoveryArchive(file, 'test-passphrase-only', owner), review.data);
  await assert.rejects(decryptRecoveryArchive(file, 'test-passphrase-only', peer));
  await assert.rejects(decryptRecoveryArchive(file, 'wrong-passphrase-only', owner));
});
function wallet(): ExportWallet { return { getAddresses: async () => [owner], getChainId: async () => 1, signMessage: async () => '0x01' }; }
test('fresh proof binds purpose, origin, wallet, chain, nonce and expiry; verification is required', async () => {
  const w = wallet(); let message = '';
  w.signMessage = async args => { message = args.message; return '0x01'; };
  const check = await proveExportWallet(w, owner, 'https://gov.bittrees.org', () => {}, async () => true);
  for (const text of ['Chat local data export', 'https://gov.bittrees.org', owner, 'Chain: 1', 'Nonce:', 'Expires:']) assert.ok(message.includes(text));
  await check();
  await assert.rejects(proveExportWallet(w, owner, 'https://gov.bittrees.org', () => {}, async () => false));
});
test('wallet changes during signing or after encryption cancel export', async () => {
  const w = wallet(); w.signMessage = async () => { w.getAddresses = async () => [peer]; return '0x01'; };
  await assert.rejects(proveExportWallet(w, owner, 'https://gov.bittrees.org', () => {}, async () => true));
  const next = wallet(); const check = await proveExportWallet(next, owner, 'https://gov.bittrees.org', () => {}, async () => true);
  next.getChainId = async () => 10; await assert.rejects(check());
});
test('disconnect, source-view disposal and expired proof fail closed', async () => {
  const w = wallet(); let disposed = false;
  const check = await proveExportWallet(w, owner, 'https://gov.bittrees.org', () => { if (disposed) throw new Error('disposed'); }, async () => true);
  disposed = true; await assert.rejects(check());
  const original = Date.now;
  try {
    const now = original(); Date.now = () => now;
    const deadline = await proveExportWallet(wallet(), owner, 'https://gov.bittrees.org', () => {}, async () => true);
    Date.now = () => now + 120_001; await assert.rejects(deadline());
  } finally { Date.now = original; }
});

test('decodes the compatibility fixture generated by Chat main e797932', async () => {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(new URL('../../tests/recovery/fixtures/chat-v1.json', import.meta.url), 'utf8');
  const data = await decryptRecoveryArchive(raw, 'test-fixture-passphrase', owner);
  assert.equal(data.createdAt, 123); assert.equal(data.source, 'governance');
  assert.deepEqual(data.contacts, []);
});


test('Push room preferences do not block shared-settings export or become XMTP overrides', () => {
  const raw = JSON.stringify({
    'room:safe-gov.bittrees.eth': { pinned: true, order: 0, lastReadAt: 123, readReceipts: true },
    'room:custom-room': { archived: true },
    'abc': { readReceipts: false },
  });
  const source = storage({ 'bittrees.dm.prefs': raw });
  const review = reviewChatExport(source, owner, true, 'governance');
  assert.deepEqual(review.data.preferences.readReceiptOverrides, { 'xmtp:production:abc': false });
  assert.equal(source.values['bittrees.dm.prefs'], raw);
  assertExportUnchanged(source, review);
  source.values['bittrees.dm.prefs'] = JSON.stringify({ 'room:bad': { pinned: 'yes' } });
  assert.throws(() => reviewChatExport(source, owner, true, 'governance'));
});
