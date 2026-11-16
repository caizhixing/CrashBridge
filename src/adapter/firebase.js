/** Firebase DOM compatibility is unverified: selectors describe synthetic, real-style layouts only. */
import { issueKey, LIMITS } from '../domain/model.js';

/** @typedef {{projectId:string,appId:string,issueId:string,url:string,title:string|null}} IssueRef */

const ORIGIN = 'https://console.firebase.google.com';
const ROUTE = /^\/project\/([^/]+)\/crashlytics\/app\/(android:[^/]+)\/issues\/([^/]+)\/?$/;
const LIST_ROUTE = /^\/project\/([^/]+)\/crashlytics\/app\/(android:[^/]+)(?:\/issues\/?)?$/;

/** @param {string} value @returns {string|null} */
function decodeId(value) {
  try {
    const id = decodeURIComponent(value);
    return id && id.length <= LIMITS.maxIdLength && !/[\s/\\\u0000-\u001f\u007f]/u.test(id) ? id : null;
  } catch { return null; }
}

/** @param {string} value @returns {URL|null} */
function firebaseUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === ORIGIN && !url.username && !url.password ? url : null;
  } catch { return null; }
}

/** Parse only the explicitly supported Android issue route. @param {string} value @returns {IssueRef|null} */
export function parseIssueUrl(value) {
  const url = firebaseUrl(value);
  const match = url && ROUTE.exec(url.pathname);
  if (!match) return null;
  const ids = match.slice(1).map(decodeId);
  if (ids.some(id => id === null) || ids[1] === 'android:') return null;
  const [projectId, appId, issueId] = ids;
  const normalized = new URL(`/project/${encodeURIComponent(projectId)}/crashlytics/app/android:${encodeURIComponent(appId.slice(8))}/issues/${encodeURIComponent(issueId)}`, ORIGIN);
  const events = url.searchParams.getAll('eventId');
  if (events.length > 1 || (events.length === 1 && !decodeId(encodeURIComponent(events[0])))) return null;
  if (events.length) normalized.searchParams.set('eventId', events[0]);
  return { projectId, appId, issueId, url: normalized.href, title: null };
}

/** Only list and supported detail URLs provide reliable project/app context. @param {string} value */
export function pageIdentity(value) {
  const issue = parseIssueUrl(value);
  if (issue) return { projectId: issue.projectId, appId: issue.appId };
  const url = firebaseUrl(value);
  const match = url && LIST_ROUTE.exec(url.pathname);
  if (!match) return null;
  const projectId = decodeId(match[1]);
  const appId = decodeId(match[2]);
  return projectId && appId && appId !== 'android:' ? { projectId, appId } : null;
}

/** @param {Document} document @param {string} url @returns {IssueRef[]} */
export function discoverIssues(document, url) {
  const identity = pageIdentity(url);
  if (!identity) return [];
  const issues = new Map();
  for (const anchor of document.querySelectorAll('a[href]')) {
    let href;
    try { href = new URL(anchor.getAttribute('href'), url).href; } catch { continue; }
    const issue = parseIssueUrl(href);
    if (!issue || issue.projectId !== identity.projectId || issue.appId !== identity.appId) continue;
    const title = anchor.textContent?.trim();
    issue.title = title ? title.slice(0, LIMITS.maxTitleLength) : null;
    const key = issueKey(issue);
    if (!issues.has(key)) issues.set(key, issue);
  }
  return [...issues.values()];
}

/** @param {string} code @param {string} message @returns {Error & {code:string}} */
function failure(code, message) { return Object.assign(new Error(message), { code }); }

// Do not use body/main text, breadcrumbs, custom keys, or unscoped pre elements as a stack fallback.
const STACK_REGIONS = 'crashlytics-stack-trace, .stacktrace, .stack-trace, [aria-label="Stack trace"], [aria-label="Stacktrace"]';
const SEMANTIC_REGIONS = '[role="region"][aria-labelledby], section[aria-labelledby]';

/** @param {Document} document @returns {Element[]} */
function stackRegions(document) {
  const regions = new Set(document.querySelectorAll(STACK_REGIONS));
  for (const region of document.querySelectorAll(SEMANTIC_REGIONS)) {
    const labelIds = region.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
    const labels = labelIds.map(id => document.getElementById(id)?.textContent?.trim() ?? '');
    if (labels.length === 1 && /^(?:Stack trace|Stacktrace)$/i.test(labels[0])) regions.add(region);
  }
  return [...regions].filter(region => ![...regions].some(other => other !== region && other.contains(region)));
}

/** Narrow dl semantics only; missing or ambiguous values remain null. @param {Document} document @param {string[]} labels */
function field(document, labels) {
  const values = [];
  const regions = document.querySelectorAll('crashlytics-event-details, .event-details, [aria-label="Event details"], [aria-label="Issue statistics"]');
  const terms = new Set([...regions].flatMap(region => [...region.querySelectorAll('dl dt')]));
  for (const term of terms) {
    if (!labels.includes(term.textContent?.trim().toLowerCase())) continue;
    const value = term.nextElementSibling;
    if (value?.tagName === 'DD') {
      const text = value.textContent?.trim();
      if (text && text.length <= 1000) values.push(text);
    }
  }
  return values.length === 1 ? values[0] : null;
}

/** @param {Document} document @param {IssueRef} issue @param {string} now */
export function extractCapture(document, issue, now) {
  const location = document.location?.href ?? document.URL;
  if (/^https:\/\/accounts\.google\.com\//.test(location ?? '') || document.querySelector('form[action^="https://accounts.google.com/"]')) {
    throw failure('login-required', 'Firebase sign-in is required.');
  }
  const actual = parseIssueUrl(location);
  const expected = parseIssueUrl(issue.url);
  if (!actual || !expected || actual.projectId !== issue.projectId || actual.appId !== issue.appId || actual.issueId !== issue.issueId || expected.projectId !== issue.projectId || expected.appId !== issue.appId || expected.issueId !== issue.issueId) {
    throw failure('unsupported', 'The rendered page identity does not match the requested issue.');
  }
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const identity = parseIssueUrl(canonical.getAttribute('href'));
    if (!identity || identity.projectId !== actual.projectId || identity.appId !== actual.appId || identity.issueId !== actual.issueId) throw failure('unsupported', 'Ambiguous page identity.');
  }
  if (!Number.isFinite(Date.parse(now))) throw failure('unsupported', 'Invalid capture timestamp.');
  const regions = stackRegions(document);
  if (regions.length !== 1) throw failure('unsupported', 'No unique supported stack trace region was found.');
  const region = regions[0];
  const blocks = [...region.querySelectorAll('pre, [role="code"]')];
  // A single nested code block is acceptable; concatenating unknown independent blocks is not.
  if (blocks.length > 1) throw failure('unsupported', 'Multiple stack blocks cannot be safely identified as one event.');
  const stack = (blocks[0] ?? region).textContent?.trim() ?? '';
  if (!/(?:^|\n)\s*(?:at\s+[\w.$]+\([^\n]*\)|#\d+\s+pc\s+[\da-f]+\b)/im.test(stack)) throw failure('missing-stack', 'No rendered Android stack frames were found.');
  const partial = stack.length > LIMITS.maxStackLength || Boolean(region.querySelector('[aria-expanded="false"], [aria-busy="true"]'));
  const warnings = ['Real Firebase console DOM compatibility has not been verified.', 'Only the currently displayed representative event is captured; latest event and completeness are not verified.'];
  if (stack.length > LIMITS.maxStackLength) warnings.push('Stack trace truncated to 200000 characters.');
  if (partial) warnings.push('Only partially rendered or truncated stack content is available.');
  const eventId = new URL(actual.url).searchParams.get('eventId');
  const requestedEventId = new URL(expected.url).searchParams.get('eventId');
  if (requestedEventId && requestedEventId !== eventId) throw failure('unsupported', 'The displayed event URL does not match the requested event.');
  const labelledEventId = field(document, ['event id']);
  if (eventId && labelledEventId && eventId !== labelledEventId) throw failure('unsupported', 'The displayed event metadata conflicts with the URL.');
  return {
    issue: { ...expected, title: issue.title },
    event: { eventId, identitySource: eventId ? 'event-id' : 'unavailable' },
    capturedAt: new Date(now).toISOString(), eventTimestamp: field(document, ['event timestamp', 'event time']),
    selection: 'currently-displayed', source: 'rendered-dom', completeness: partial ? 'partial' : 'unknown',
    stacktrace: stack.slice(0, LIMITS.maxStackLength), appVersion: field(document, ['app version']), versionCode: field(document, ['version code', 'build version']),
    osVersion: field(document, ['os version', 'android version']), deviceModel: field(document, ['device model']),
    statistics: { events: field(document, ['events']), users: field(document, ['users']), timeRange: field(document, ['time range']) }, warnings,
  };
}
