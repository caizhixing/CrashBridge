import { LIMITS, isoDate, record, validateQueueItem } from './model.js';

/** Return an allowlisted, independent JSON value used identically by preview and downloads. */
export function createBundle(items, options, exportedAt) {
  if (!Array.isArray(items) || items.length > LIMITS.maxIssues) throw new Error('Invalid queue');
  record(options);
  for (const field of ['stacktrace', 'version', 'device', 'statistics']) {
    if (typeof options[field] !== 'boolean') throw new Error('Invalid export options');
  }
  const issues = items.map(validateQueueItem);
  for (const item of issues) {
    if (!item.capture) continue;
    if (!options.stacktrace) delete item.capture.stacktrace;
    if (!options.version) {
      delete item.capture.appVersion;
      delete item.capture.versionCode;
    }
    if (!options.device) {
      delete item.capture.osVersion;
      delete item.capture.deviceModel;
    }
    if (!options.statistics) delete item.capture.statistics;
  }
  return { schemaVersion: 1, exportedAt: isoDate(exportedAt), issues, warnings: [] };
}

function inline(value) {
  if (value === null) return 'not available';
  return String(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
    .replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&').replace(/[\r\n\u2028\u2029]/g, ' ');
}

function fenced(value) {
  const runs = value.match(/`+/g) ?? [];
  const fence = '`'.repeat(runs.reduce((length, run) => Math.max(length, run.length + 1), 3));
  return `${fence}text\n${value}\n${fence}`;
}

/** Render only the exported value; never read fields excluded from the bundle. */
export function toMarkdown(bundle) {
  const lines = ['# CrashBridge', '', `Schema: ${inline(bundle.schemaVersion)}`, `Exported: ${inline(bundle.exportedAt)}`];
  for (const warning of bundle.warnings) lines.push(`- Warning: ${inline(warning)}`);
  for (const item of bundle.issues) {
    const issue = item.issue;
    const url = issue.url.replace(/[<>"\s()\\]/g, char => encodeURIComponent(char).replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16)}`));
    lines.push('', `## ${inline(issue.title ?? issue.issueId)}`, '',
      `- Project: ${inline(issue.projectId)}`, `- App: ${inline(issue.appId)}`, `- Issue: ${inline(issue.issueId)}`,
      `- Source: [Firebase](<${url}>)`, `- Status: ${inline(item.status)}`);
    if (item.error) lines.push(`- Error: ${inline(item.error.code)} — ${inline(item.error.message)}`);
    const capture = item.capture;
    if (!capture) continue;
    lines.push(`- Captured: ${inline(capture.capturedAt)}`, `- Event: ${inline(capture.event.eventId)}`,
      `- Event identity: ${inline(capture.event.identitySource)}`, `- Event time: ${inline(capture.eventTimestamp)}`,
      `- Selection: ${inline(capture.selection)}`, `- Capture source: ${inline(capture.source)}`,
      `- Completeness: ${inline(capture.completeness)}`);
    for (const field of ['appVersion', 'versionCode', 'osVersion', 'deviceModel']) {
      if (Object.hasOwn(capture, field)) lines.push(`- ${field}: ${inline(capture[field])}`);
    }
    if (Object.hasOwn(capture, 'statistics')) {
      for (const field of ['events', 'users', 'timeRange']) lines.push(`- ${field}: ${inline(capture.statistics[field])}`);
    }
    for (const warning of capture.warnings) lines.push(`- Warning: ${inline(warning)}`);
    if (Object.hasOwn(capture, 'stacktrace')) lines.push('', fenced(capture.stacktrace));
  }
  return `${lines.join('\n')}\n`;
}
