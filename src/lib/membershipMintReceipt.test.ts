import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMembershipMintReceipts, type MembershipSessionIdentity} from './membershipMintReceipt.ts';
const hash = `0x${'1'.repeat(64)}`;
const token = (tokenId = '1', expiresAt = 200) => ({tokenId, expiresAt, isExpired:false});
test('confirmation notice survives transient verification without establishing access', () => {
  const session = {scope:'wallet:1:connector',revision:1}; let now=100_000;
  const receipts=createMembershipMintReceipts(()=>session,()=>now);
  assert.equal(receipts.record(session,hash),true);
  assert.equal(receipts.record(session,hash),false);
  assert.equal('hasValidMembership' in receipts.getSnapshot()!,false);
  receipts.observe(); assert.equal(receipts.getSnapshot()?.hash,hash);
  receipts.verified(session,100_000,[token()]); assert.ok(receipts.getSnapshot());
  now++; receipts.verified(session,now,[]); assert.ok(receipts.getSnapshot());
  receipts.verified(session,now,[{...token(),isExpired:true}]); assert.ok(receipts.getSnapshot());
  receipts.verified(session,now,[token()]); assert.equal(receipts.getSnapshot(),null);
});
test('renewal notice remains until fresh evidence includes a new token or later expiry', () => {
  const session={scope:'wallet:1:connector',revision:1}; let now=100_000;
  const receipts=createMembershipMintReceipts(()=>session,()=>now);
  const prior=[token()]; receipts.record(session,hash,prior); prior[0].expiresAt=999;
  now++; receipts.verified(session,now,[token()]); assert.ok(receipts.getSnapshot());
  receipts.verified(session,now,[token('1',201)]); assert.equal(receipts.getSnapshot(),null);
  receipts.record(session,hash,[token()]); now++;
  receipts.verified(session,now,[token(),token('2')]); assert.equal(receipts.getSnapshot(),null);
});
test('old submission callbacks cannot assign a notice to another account, chain, connector or reconnect', () => {
  const original={scope:'a:1:c',revision:1}; let session:MembershipSessionIdentity=original;
  const receipts=createMembershipMintReceipts(()=>session);
  for(const scope of ['b:1:c','a:8453:c','a:1:other',null,'a:1:c']) {
    session=original; assert.equal(receipts.record(original,hash),true);
    session={scope,revision:original.revision+1}; receipts.observe();
    assert.equal(receipts.getSnapshot(),null); assert.equal(receipts.record(original,hash),false);
  }
});
test('malformed hashes are rejected and stale verification cannot clear a current notice', () => {
  let session={scope:'a:1:c',revision:1}; const receipts=createMembershipMintReceipts(()=>session,()=>100_000);
  for(const value of ['', '0x123', `https://example.test/${hash}`,`0x${'z'.repeat(64)}`]) assert.equal(receipts.record(session,value),false);
  const old=session; session={scope:'b:1:c',revision:2}; receipts.record(session,hash);
  receipts.verified(old,100_001,[token()]); assert.ok(receipts.getSnapshot());
  receipts.verified(session,NaN,[token()]); assert.ok(receipts.getSnapshot());
});
