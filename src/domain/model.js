/** @typedef {{projectId:string,appId:string,issueId:string,url:string,title:string|null}} IssueRef */
/** @typedef {{code:string,message:string}} CaptureError */
export const LIMITS = Object.freeze({
  maxIssues: 100, maxIdLength: 512, maxTitleLength: 1000,
  maxStackLength: 200000, maxStorageBytes: 4194304, timeoutMs: 60000,
});

export function record(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value;
}

export function text(value, max, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid text');
  return value;
}

export function oneOf(value, choices) {
  if (!choices.includes(value)) throw new Error('Invalid enum value');
  return value;
}

export function isoDate(value) {
  text(value, 64);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid ISO date');
  return value;
}

/** @param {IssueRef} issue */
export function issueKey(issue) {
  return JSON.stringify([issue.projectId, issue.appId, issue.issueId]);
}

/** Validate identity against the supported Firebase route, dropping unrelated URL data. @returns {IssueRef} */
export function validateIssue(value) {
  const input = record(value);
  const projectId = text(input.projectId, LIMITS.maxIdLength);
  const appId = text(input.appId, LIMITS.maxIdLength);
  const issueId = text(input.issueId, LIMITS.maxIdLength);
  const title = text(input.title, LIMITS.maxTitleLength, true);
  const url = new URL(text(input.url, 8192));
  const match = /^\/project\/([^/]+)\/crashlytics\/app\/([^/]+)\/issues\/([^/]+)\/?$/.exec(url.pathname);
  if (url.origin !== 'https://console.firebase.google.com' || url.username || url.password || !match) throw new Error('Invalid Firebase issue URL');
  const identity = match.slice(1).map(decodeURIComponent);
  if (identity[0] !== projectId || identity[1] !== appId || identity[2] !== issueId || !/^android:[^\s/]+$/.test(appId)) throw new Error('Issue URL identity mismatch');
  const eventId = url.searchParams.get('eventId');
  url.search = '';
  url.hash = '';
  if (eventId !== null) url.searchParams.set('eventId', text(eventId, LIMITS.maxIdLength));
  return { projectId, appId, issueId, url: url.href, title };
}

export function validateError(value) {
  const input = record(value);
  return {
    code: oneOf(input.code, ['unsupported', 'login-required', 'timeout', 'tab-closed', 'missing-stack', 'cancelled', 'storage-failed', 'download-failed']),
    message: text(input.message, LIMITS.maxStackLength),
  };
}

export function validateCapture(value) {
  const input = record(value);
  const issue = validateIssue(input.issue);
  const event = record(input.event);
  const eventId = text(event.eventId, LIMITS.maxIdLength, true);
  const identitySource = oneOf(event.identitySource, ['event-id', 'unavailable']);
  if ((eventId === null) !== (identitySource === 'unavailable')) throw new Error('Event identity mismatch');
  const statistics = record(input.statistics);
  if (!Array.isArray(input.warnings) || input.warnings.length > 100) throw new Error('Invalid warnings');
  return {
    issue, event: { eventId, identitySource }, capturedAt: isoDate(input.capturedAt),
    eventTimestamp: text(input.eventTimestamp, 1000, true),
    selection: oneOf(input.selection, ['currently-displayed']), source: oneOf(input.source, ['rendered-dom']),
    completeness: oneOf(input.completeness, ['partial', 'unknown']),
    stacktrace: text(input.stacktrace, LIMITS.maxStackLength),
    appVersion: text(input.appVersion, 1000, true), versionCode: text(input.versionCode, 1000, true),
    osVersion: text(input.osVersion, 1000, true), deviceModel: text(input.deviceModel, 1000, true),
    statistics: { events: text(statistics.events, 1000, true), users: text(statistics.users, 1000, true), timeRange: text(statistics.timeRange, 1000, true) },
    warnings: input.warnings.map(warning => text(warning, LIMITS.maxStackLength)),
  };
}

export function validateQueueItem(value) {
  const input = record(value);
  const issue = validateIssue(input.issue);
  const key = issueKey(issue);
  if (input.key !== key) throw new Error('Queue identity mismatch');
  const status = oneOf(input.status, ['pending', 'collecting', 'succeeded', 'failed', 'cancelled']);
  const capture = input.capture === null ? null : validateCapture(input.capture);
  const error = input.error === null ? null : validateError(input.error);
  if (capture !== null && issueKey(capture.issue) !== key) throw new Error('Capture identity mismatch');
  if ((status === 'succeeded' && (!capture || error)) || (status !== 'succeeded' && capture) || (status === 'failed' && !error)) throw new Error('Queue status mismatch');
  return { key, issue, status, capture, error };
}

/** @param {IssueRef} issue */
export function createQueueItem(issue) {
  const normalized = validateIssue(issue);
  return { key: issueKey(normalized), issue: normalized, status: 'pending', capture: null, error: null };
}
