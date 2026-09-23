import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPushSessions, PushSessionChangedError } from './pushSessionCore.ts';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
test('shares one current initialization and exposes only guarded chat methods', async () => {
  let calls = 0; let initialized = 0;
  const core = createPushSessions(() => 'wallet:1:connector', async (_raw, path) => { calls++; return path.join('.'); });
  const ready = deferred<{ privateKey: string }>();
  const factory = async () => { initialized++; return ready.promise; };
  const a = core.enable(factory); const b = core.enable(factory); assert.equal(a, b);
  ready.resolve({ privateKey: 'synthetic-test-key' });
  const client = await a; assert.equal(initialized, 1);
  assert.equal('privateKey' in client, false);
  assert.equal(await client.chat.group.join('room'), 'chat.group.join'); assert.equal(calls, 1);
  assert.equal(await core.enable(factory), client);
});
test('disconnect invalidates delayed enable even when the same wallet reconnects', async () => {
  let scope: string | null = 'a:1:c'; const core = createPushSessions(() => scope, async () => undefined);
  const ready = deferred<object>(); const enabling = core.enable(async () => ready.promise);
  await Promise.resolve(); scope = null; core.observe(); scope = 'a:1:c'; core.observe();
  ready.resolve({}); await assert.rejects(enabling, PushSessionChangedError);
  assert.equal(core.getSnapshot().status, 'idle'); assert.equal(core.getSnapshot().client, null);
});
test('account, chain or connector changes deny stale calls before the SDK is invoked', async () => {
  for (const next of ['b:1:c', 'a:10:c', 'a:1:other', null]) {
    let scope: string | null = 'a:1:c'; let called = false;
    const core = createPushSessions(() => scope, async () => { called = true; });
    const client = await core.enable(async () => ({})); scope = next;
    await assert.rejects(client.chat.send('room', 'text'), PushSessionChangedError);
    assert.equal(called, false); core.observe(); assert.equal(core.getSnapshot().client, null);
  }
});
test('late replies cannot be applied or trigger another write after session invalidation', async () => {
  let scope: string | null = 'a:1:c'; const response = deferred<unknown>(); let writes = 0;
  const core = createPushSessions(() => scope, async () => { writes++; return response.promise; });
  const client = await core.enable(async () => ({})); const send = client.chat.send('room', 'text');
  scope = null; core.observe(); response.resolve({ id: 'sent' });
  await assert.rejects(send, /may have completed/);
  await assert.rejects(client.chat.group.add('room', ['peer']), PushSessionChangedError); assert.equal(writes, 1);
});
test('old initialization failure does not clear a newer session', async () => {
  let scope = 'a:1:c'; const core = createPushSessions(() => scope, async () => undefined);
  const ready = deferred<object>(); const old = core.enable(async () => ready.promise);
  await Promise.resolve(); scope = 'b:1:c'; core.observe();
  const current = await core.enable(async () => ({})); ready.resolve({});
  await assert.rejects(old, PushSessionChangedError); assert.equal(core.getSnapshot().client, current);
});
test('initializer guards reject delayed signatures and failed enables can be retried explicitly', async () => {
  let scope: string | null = 'a:1:c'; const core = createPushSessions(() => scope, async () => undefined);
  await assert.rejects(core.enable(async () => { throw new Error('signature rejected'); }), /signature rejected/);
  assert.equal(core.getSnapshot().status, 'error');
  await assert.rejects(core.enable(async guard => { scope = null; guard(); return {}; }), PushSessionChangedError);
});
