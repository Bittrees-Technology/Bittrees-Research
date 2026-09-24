import query from 'query-string';
import { parseUri, formatUri } from '@walletconnect/utils';
import corpus from '../../scripts/fixtures/uri-decoder-corpus.json';

self.onmessage = () => {
  try {
    const pairing = { protocol: 'wc', topic: 'a'.repeat(64), version: 2, symKey: 'b'.repeat(64), relay: { protocol: 'irn' }, methods: ['eth_sendTransaction', 'personal_sign'], expiryTimestamp: 2000000000 };
    const malformed = '%FF'.repeat(60000);
    self.postMessage(JSON.stringify({
      query: corpus.query.map(({ input }) => query.parse(input)),
      fragment: query.parseUrl('https://example.invalid/?x=1#hello+world', { parseFragmentIdentifier: true }),
      pairing: parseUri(query.parse('uri=' + encodeURIComponent(formatUri(pairing))).uri),
      malformedPreserved: query.parse('value=' + malformed).value === malformed,
    }));
  } catch { self.postMessage(JSON.stringify({ error: 'URI compatibility failed' })); }
};
