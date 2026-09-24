import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import queryString from 'query-string';
import { parseUri, formatUri } from '@walletconnect/utils';

test('all installed query-string callers resolve the patched decoder', () => {
  const packages = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith('@')) { visit(path); continue; }
      if (existsSync(join(path, 'package.json'))) packages.push({ path, ...JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) });
      if (existsSync(join(path, 'node_modules'))) visit(join(path, 'node_modules'));
    }
  }
  visit(resolve('node_modules'));
  const callers = packages.filter(p => p.name === 'query-string');
  assert(callers.length > 0);
  for (const p of packages.filter(p => p.name === 'decode-uri-component')) assert.equal(p.version, '0.5.0');
  for (const p of callers) {
    const require = createRequire(join(p.path, 'package.json'));
    const decoder = require.resolve('decode-uri-component');
    assert.equal(JSON.parse(readFileSync(join(dirname(decoder), 'package.json'), 'utf8')).version, '0.5.0');
    assert.equal(require('./index.js').parse('x=%C3%A5').x, 'å');
  }
});

test('query and fragment semantics match the saved pre-upgrade corpus', () => {
  const corpus = JSON.parse(readFileSync(new URL('./fixtures/uri-decoder-corpus.json', import.meta.url), 'utf8'));
  const plain = value => JSON.parse(JSON.stringify(value));
  for (const { input, output } of corpus.query) {
    const parsed = queryString.parse(input);
    assert.equal(Object.getPrototypeOf(parsed), null);
    assert.deepEqual(plain(parsed), output);
  }
  assert.deepEqual(plain(queryString.parseUrl('https://example.invalid/?x=1#hello+world', { parseFragmentIdentifier: true })), corpus.fragment);
  assert.equal(queryString.parseUrl('https://example.invalid/#%2B%252B', { parseFragmentIdentifier: true }).fragmentIdentifier, '+%2B');
  assert.equal({}.polluted, undefined);
});

test('actual WalletConnect URI helpers preserve encoded synthetic pairing links', () => {
  const input = { protocol: 'wc', topic: 'a'.repeat(64), version: 2, symKey: 'b'.repeat(64), relay: { protocol: 'irn' }, methods: ['eth_sendTransaction', 'personal_sign'], expiryTimestamp: 2000000000 };
  const uri = formatUri(input);
  // This installed helper strips the wc prefix and reports an empty protocol.
  const expected = { ...input, protocol: '' };
  assert.deepEqual(parseUri(uri), expected);
  const wrapped = queryString.parse('uri=' + encodeURIComponent(uri));
  assert.equal(wrapped.uri, uri);
  assert.deepEqual(parseUri(wrapped.uri), expected);
});

test('malformed percent encodings finish in a bounded isolated process', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import query from 'query-string'; const input = '%FF'.repeat(60000); if (query.parse('value=' + input).value !== input) process.exit(2);`], { timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
});
