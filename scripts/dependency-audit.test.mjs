import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectAudit } from './dependency-audit.mjs';
const empty = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
function report(counts = {}, status = 0) {
  const vulnerabilities = { ...empty, ...counts };
  const records = Object.entries(vulnerabilities).filter(([, count]) => count).map(([severity]) => ({ type: 'auditAdvisory', data: { advisory: { severity } } }));
  records.push({ type: 'auditSummary', data: { vulnerabilities } });
  return { stdout: records.map(record => JSON.stringify(record)).join('\n'), status };
}
test('gate accepts complete clean or lower-severity reports without suppressing their counts', () => {
  assert.deepEqual(inspectAudit(report()), empty);
  assert.deepEqual(inspectAudit(report({ low: 3, moderate: 4 }, 6)), { ...empty, low: 3, moderate: 4 });
});
test('high and critical findings fail regardless of a supplied successful exit', () => {
  for (const [level, bit] of [['high', 8], ['critical', 16]]) {
    assert.throws(() => inspectAudit(report({ [level]: 1 }, bit)));
    assert.throws(() => inspectAudit(report({ [level]: 1 }, 0)));
  }
});
test('outages, truncation, invalid JSON, unknown severity and inconsistent summaries fail closed', () => {
  for (const result of [
    { stdout: '', status: 0 }, { ...report(), status: 1 }, { ...report(), error: new Error('offline') },
    { ...report(), signal: 'SIGTERM' }, { stdout: '{broken', status: 0 },
    { stdout: JSON.stringify({ type: 'error', data: 'Registry unavailable' }), status: 0 },
    { stdout: JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { ...empty, high: -1 } } }), status: 0 },
    { stdout: JSON.stringify({ type: 'auditSummary', data: { vulnerabilities: { ...empty, moderate: 1 } } }), status: 4 },
    { stdout: report().stdout + '\n' + JSON.stringify({ type: 'auditAdvisory', data: { advisory: { severity: 'unknown' } } }), status: 0 },
    { stdout: report().stdout + '\n' + report().stdout, status: 0 },
  ]) assert.throws(() => inspectAudit(result));
});
