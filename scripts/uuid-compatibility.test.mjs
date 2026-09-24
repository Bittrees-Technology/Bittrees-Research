import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const consumers = new Set(['@pushprotocol/restapi', '@metamask/sdk', '@metamask/sdk-communication-layer', '@metamask/utils']);
const packages = [];
function inventory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith('@')) { inventory(path); continue; }
    const file = join(path, 'package.json');
    if (existsSync(file)) packages.push({ path, ...JSON.parse(readFileSync(file, 'utf8')) });
    if (existsSync(join(path, 'node_modules'))) inventory(join(path, 'node_modules'));
  }
}
inventory(resolve('node_modules'));
const callers = packages.filter(p => consumers.has(p.name) && p.dependencies?.uuid);
const canonicalV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

test('every installed UUID caller in the scoped SDK graph resolves the patched dual-module release', () => {
  assert.deepEqual(new Set(callers.map(p => p.name)), consumers);
  const installed = packages.filter(p => p.name === 'uuid');
  assert(installed.length > 0);
  for (const p of installed) assert.equal(p.version, '11.1.1', p.path);
  for (const p of callers) {
    const require = createRequire(join(p.path, 'package.json'));
    assert.equal(require('uuid/package.json').version, '11.1.1', p.path);
    const uuid = require('uuid');
    const values = Array.from({ length: 32 }, () => uuid.v4());
    assert.equal(new Set(values).size, values.length);
    for (const value of values) { assert.match(value, canonicalV4); assert.equal(uuid.version(value), 4); }
    const deterministic = uuid.v4({ random: Uint8Array.from({ length: 16 }, (_, i) => i) });
    assert.equal(deterministic, '00010203-0405-4607-8809-0a0b0c0d0e0f');
    assert.equal(uuid.stringify(uuid.parse(deterministic)), deterministic);
    assert.equal(uuid.validate('not-an-id'), false);
  }
});

test('undersized UUID buffers fail before any partial write through every caller resolution', () => {
  for (const p of callers) {
    const uuid = createRequire(join(p.path, 'package.json'))('uuid');
    for (const method of ['v3', 'v5', 'v6']) {
      for (const [size, offset] of [[8, 4], [16, 1], [16, -1]]) {
        const output = new Uint8Array(size).fill(170);
        const invoke = () => method === 'v6' ? uuid.v6({}, output, offset) : uuid[method]('fixture', namespace, output, offset);
        assert.throws(invoke, RangeError, `${p.name} ${method}`);
        assert(output.every(value => value === 170));
      }
    }
  }
});

test('actual Push payload IDs and MetaMask CommonJS/ESM sandbox names retain v4 behavior', async () => {
  const push = callers.find(p => p.name === '@pushprotocol/restapi');
  const { getUUID } = createRequire(join(push.path, 'package.json'))('./src/lib/payloads/helpers.js');
  assert.match(getUUID(), canonicalV4);
  for (const p of callers.filter(p => p.name === '@metamask/utils')) {
    const common = createRequire(join(p.path, 'package.json'))('./dist/fs.cjs');
    const module = await import(pathToFileURL(join(p.path, 'dist/fs.mjs')).href);
    for (const api of [common, module]) {
      const sandbox = api.createSandbox('research-uuid-compatibility');
      assert.match(basename(sandbox.directoryPath), canonicalV4);
      assert.equal(existsSync(sandbox.directoryPath), false);
    }
  }
});
