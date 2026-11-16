import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, issueKey, validateIssue, createQueueItem, validateCapture, validateQueueItem, validateError, isoDate } from '../../src/domain/model.js';
import { at, issue, capture, succeeded } from './fixtures.js';

test('composite identity is collision-free and queue starts explicitly pending', () => {
  const a = issue();
  assert.notEqual(issueKey(a), issueKey({ ...a, projectId: 'other' }));
  assert.notEqual(issueKey(a), issueKey({ ...a, appId: 'android:other' }));
  assert.equal(new Set([issueKey(a), issueKey({ ...a, projectId: 'other' }), issueKey({ ...a, appId: 'android:other' })]).size, 3);
  assert.deepEqual(createQueueItem(a), { key: issueKey(a), issue: a, status: 'pending', capture: null, error: null });
  assert.notEqual(createQueueItem(a).issue, a);
  assert.equal(LIMITS.maxStorageBytes, 4194304);
});

test('Issue validation rejects invalid identifiers, routes, origins and mismatched identity', () => {
  for (const value of [null, [], 'issue']) assert.throws(() => validateIssue(value));
  for (const field of ['projectId', 'appId', 'issueId']) {
    for (const value of ['', ' ', null, 42, 'x'.repeat(513)]) assert.throws(() => validateIssue(issue({ [field]: value })));
  }
  for (const title of ['', 'x'.repeat(1001), undefined]) assert.throws(() => validateIssue(issue({ title })));
  for (const url of ['not-url', issue().url.replace('https:', 'http:'), issue().url.replace('console.firebase.google.com', 'evil.invalid'), issue().url.replace('/issues/', '/other/'), issue().url + '/extra', issue().url.replace('synthetic-issue', 'other'), issue().url.replace('https://', 'https://user@'), issue().url.replace('synthetic-issue', '%ZZ')]) assert.throws(() => validateIssue(issue({ url })));
  assert.throws(() => validateIssue(issue({ appId: 'ios:example.synthetic', url: issue().url.replace('android:', 'ios:') })));
  assert.equal(validateIssue(issue({ title: null })).title, null);
  assert.equal(validateIssue(issue({ url: issue().url + '?secret=drop&eventId=event-1#drop' })).url, issue().url + '?eventId=event-1');
});

test('Capture validates all schema fields, identity, warnings and bounded stack', () => {
  assert.deepEqual(validateCapture(capture()), capture());
  assert.equal(validateCapture(capture({ event: { eventId: 'event-1', identitySource: 'event-id' } })).event.eventId, 'event-1');
  for (const change of [
    { event: { eventId: 'event-1', identitySource: 'unavailable' } }, { event: { eventId: null, identitySource: 'event-id' } },
    { selection: 'latest' }, { source: 'api' }, { completeness: 'complete' }, { stacktrace: '' }, { stacktrace: 'x'.repeat(200001) },
    { warnings: null }, { warnings: Array(101).fill('warning') }, { warnings: [42] }, { statistics: null }, { capturedAt: 'not-date' }, { capturedAt: '2026-99-99T00:00:00Z' },
  ]) assert.throws(() => validateCapture(capture(change)));
  assert.equal(isoDate(at), at);
});

test('Queue errors, status and capture identity are validated with field allowlisting', () => {
  const error = { code: 'timeout', message: 'Timed out' };
  assert.deepEqual(validateError({ ...error, secret: 'drop' }), error);
  assert.throws(() => validateError({ ...error, code: 'invented' }));
  assert.deepEqual(validateQueueItem(succeeded({ secret: 'drop' })), succeeded());
  const pending = createQueueItem(issue());
  assert.deepEqual(validateQueueItem(pending), pending);
  assert.deepEqual(validateQueueItem({ ...pending, status: 'failed', error }).error, error);
  for (const value of [
    { ...pending, key: 'wrong' }, { ...pending, status: 'invented' }, { ...pending, status: 'succeeded' },
    { ...pending, status: 'failed' }, { ...pending, capture: capture() }, succeeded({ error }),
    succeeded({ capture: capture({ issue: issue({ issueId: 'other', url: issue().url.replace('synthetic-issue', 'other') }) }) }),
  ]) assert.throws(() => validateQueueItem(value));
});
