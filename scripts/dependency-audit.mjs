import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
/** Yarn's exit mask includes every severity, even when --level hides lower ones.
 * Require a complete, consistent report; an unavailable audit is never a pass. */
export function inspectAudit(result) {
  if (result.error || result.signal || !Number.isInteger(result.status) || typeof result.stdout !== 'string') {
    throw new Error('Dependency audit did not complete.');
  }
  let summary;
  const reported = new Set();
  for (const line of result.stdout.split('\n').filter(line => line.trim())) {
    const record = JSON.parse(line);
    if (record.type === 'auditSummary') {
      if (summary) throw new Error('Duplicate audit summary.');
      summary = record.data?.vulnerabilities;
    } else if (record.type === 'auditAdvisory') {
      const severity = record.data?.advisory?.severity;
      if (!levels.includes(severity)) throw new Error('Unrecognized advisory severity.');
      reported.add(severity);
    } else if (!['info', 'warning'].includes(record.type)) {
      throw new Error('Dependency audit returned an error or unsupported record.');
    }
  }
  if (!summary || levels.some(level => !Number.isSafeInteger(summary[level]) || summary[level] < 0)) {
    throw new Error('Missing or invalid dependency audit summary.');
  }
  const mask = levels.reduce((value, level, index) => value | (summary[level] ? 1 << index : 0), 0);
  if (result.status !== mask || levels.some(level => reported.has(level) !== (summary[level] > 0))) {
    throw new Error('Incomplete or inconsistent dependency audit report.');
  }
  if (summary.moderate || summary.high || summary.critical) throw new Error('Moderate, high or critical dependency findings must be resolved.');
  return summary;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = spawnSync('yarn', ['audit', '--json'], { encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    console.log('Dependency audit passed moderate/high/critical gate:', JSON.stringify(inspectAudit(result)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Dependency audit failed.');
    process.exitCode = 1;
  }
}
