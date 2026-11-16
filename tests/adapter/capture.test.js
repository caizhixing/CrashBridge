import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCapture, parseIssueUrl } from '../../src/adapter/firebase.js';
import { validateCapture } from '../../src/domain/model.js';
import { element, stackDocument, makeDocument, ISSUE_URL, STACK } from './fake-dom.js';
const NOW = '2026-11-16T07:00:00.000Z';
const issue = parseIssueUrl(ISSUE_URL);
const code = expected => error => error.code === expected;

test('extracts one rendered cause chain, null metadata, unknown completeness and actual URL event ID', () => {
  const { document } = stackDocument(`${ISSUE_URL}?eventId=synthetic-event`);
  const capture = extractCapture(document, issue, NOW);
  assert.equal(capture.stacktrace, STACK);
  assert.deepEqual(capture.event, { eventId: 'synthetic-event', identitySource: 'event-id' });
  assert.equal(capture.completeness, 'unknown');
  assert.equal(capture.selection, 'currently-displayed');
  assert.equal(capture.eventTimestamp, null);
  for (const name of ['appVersion', 'versionCode', 'osVersion', 'deviceModel']) assert.equal(capture[name], null);
  assert.deepEqual(capture.statistics, { events: null, users: null, timeRange: null });
  assert.deepEqual(validateCapture(capture), capture);
});

test('semantic labelled region fallback and narrow metadata dl support', () => {
  const document = makeDocument(ISSUE_URL);
  const heading = element('h2', 'Stack trace', { id: 'trace-heading' });
  const region = element('section', '', { 'aria-labelledby': 'trace-heading' });
  region.append(element('pre', STACK)); document.body.append(heading, region);
  const dl = element('dl');
  for (const [label, value] of [['App version', '1.2'], ['Version code', '12'], ['Android version', '14'], ['Device model', 'Synthetic'], ['Events', '3'], ['Users', '2'], ['Time range', '24 hours'], ['Event time', '2026-11-16']]) dl.append(element('dt', label), element('dd', value));
  const details = element('section', '', { 'aria-label': 'Event details' }); details.append(dl); document.body.append(details);
  const capture = extractCapture(document, issue, NOW);
  assert.equal(capture.appVersion, '1.2'); assert.equal(capture.versionCode, '12');
  assert.equal(capture.osVersion, '14'); assert.equal(capture.deviceModel, 'Synthetic');
  assert.deepEqual(capture.statistics, { events: '3', users: '2', timeRange: '24 hours' });
  assert.equal(capture.eventTimestamp, '2026-11-16');
  assert.deepEqual(capture.event, { eventId: null, identitySource: 'unavailable' });
  dl.append(element('dt', 'App version'), element('dd', 'ambiguous'));
  assert.equal(extractCapture(document, issue, NOW).appVersion, null);
});

test('long stack truncates with warning; collapsed content marks partial without clicking', () => {
  const { document, section, pre } = stackDocument(ISSUE_URL, STACK + 'x'.repeat(200000));
  let capture = extractCapture(document, issue, NOW);
  assert.equal(capture.stacktrace.length, 200000); assert.equal(capture.completeness, 'partial');
  assert.ok(capture.warnings.some(value => value.includes('truncated')));
  pre.textContent = STACK; section.append(element('button', 'More threads', { 'aria-expanded': 'false' }));
  capture = extractCapture(document, issue, NOW);
  assert.equal(capture.completeness, 'partial'); assert.equal(capture.stacktrace, STACK);
});

test('rejects wrong URL/canonical identity, auth pages and invalid capture time', () => {
  const { document } = stackDocument(ISSUE_URL.replace('synthetic-issue', 'other-issue'));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  const auth = makeDocument('https://accounts.google.com/signin');
  assert.throws(() => extractCapture(auth, issue, NOW), code('login-required'));
  const supported = stackDocument().document;
  supported.body.append(element('link', '', { rel: 'canonical', href: ISSUE_URL.replace('synthetic-issue', 'other') }));
  assert.throws(() => extractCapture(supported, issue, NOW), code('unsupported'));
  assert.throws(() => extractCapture(stackDocument().document, issue, 'invalid'), code('unsupported'));
});

test('event URL and scoped event ID metadata must not conflict', () => {
  const expected = parseIssueUrl(`${ISSUE_URL}?eventId=expected-event`);
  assert.throws(() => extractCapture(stackDocument().document, expected, NOW), code('unsupported'));
  const { document } = stackDocument(`${ISSUE_URL}?eventId=expected-event`);
  const details = element('section', '', { 'aria-label': 'Event details' });
  const dl = element('dl'); dl.append(element('dt', 'Event ID'), element('dd', 'other-event')); details.append(dl); document.body.append(details);
  assert.throws(() => extractCapture(document, expected, NOW), code('unsupported'));
});

test('unscoped page/pre text is never a stack; empty/exception-only region fails missing-stack', () => {
  const document = makeDocument(ISSUE_URL);
  document.body.append(element('pre', STACK), element('p', 'Private custom keys and unrelated page text'));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  for (const text of ['', 'Fatal Exception: java.lang.Exception: no rendered frames', 'events 100 users 3']) {
    assert.throws(() => extractCapture(stackDocument(ISSUE_URL, text).document, issue, NOW), code('missing-stack'));
  }
});

test('ambiguous regions/blocks reject; nested named regions do not duplicate', () => {
  const { document, section } = stackDocument();
  section.append(element('pre', STACK));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  const other = stackDocument();
  other.document.body.append(element('div', STACK, { class: 'stacktrace' }));
  assert.throws(() => extractCapture(other.document, issue, NOW), code('unsupported'));
  const nested = stackDocument(); nested.pre.setAttribute('class', 'stack-trace');
  assert.equal(extractCapture(nested.document, issue, NOW).stacktrace, STACK);
});
