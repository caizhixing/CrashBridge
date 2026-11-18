import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../../src/domain/protocol.js';
import { issueKey } from '../../src/domain/model.js';
import { issue, capture } from './fixtures.js';
const message = (type, payload = {}) => ({ namespace: 'crashbridge', version: 1, type, payload });

test('All eight runtime messages normalize without copying unknown fields', () => {
  for (const type of ['GET_STATE', 'CLEAR_QUEUE', 'START_CAPTURE', 'RETRY_FAILED', 'CANCEL_CAPTURE']) assert.deepEqual(parseMessage(message(type)), message(type));
  assert.deepEqual(parseMessage(message('ADD_ISSUES', { issues: [issue()], unknown: 'drop' })), message('ADD_ISSUES', { issues: [issue()] }));
  assert.deepEqual(parseMessage(message('REMOVE_ISSUE', { key: issueKey(issue()) })), message('REMOVE_ISSUE', { key: issueKey(issue()) }));
  const payload = { jobId: 'job-1', issueKey: issueKey(issue()), capture: capture(), error: null };
  assert.deepEqual(parseMessage(message('CAPTURE_RESULT', payload)), message('CAPTURE_RESULT', payload));
  const failure = { ...payload, capture: null, error: { code: 'unsupported', message: 'Unsupported layout' } };
  assert.deepEqual(parseMessage(message('CAPTURE_RESULT', failure)), message('CAPTURE_RESULT', failure));
});

test('Reject wrong envelopes, types, counts, keys, and oversized raw payloads', () => {
  for (const value of [null, { ...message('GET_STATE'), namespace: 'other' }, { ...message('GET_STATE'), version: 2 }, message('TIMEOUT'), message('TAB_CLOSED'), message('NOPE'), message('GET_STATE', null), message('GET_STATE', { unexpected: true }), message('ADD_ISSUES', { issues: {} }), message('ADD_ISSUES', { issues: Array(101).fill(issue()) }), message('ADD_ISSUES', { issues: [issue({ issueId: '' })] })]) assert.throws(() => parseMessage(value));
  for (const key of ['not-json', '{}', '["a","b"]', '["a","b",42]', '["","b","c"]', '[ "a","b","c"]']) assert.throws(() => parseMessage(message('REMOVE_ISSUE', { key })));
  assert.throws(() => parseMessage({ ...message('ADD_ISSUES', { issues: [] }), oversized: 'x'.repeat(4194304) }), /too large/);
});

test('Capture result rejects inconsistent, malformed and missing payload fields', () => {
  const payload = { jobId: 'job-1', issueKey: issueKey(issue()), capture: capture(), error: null };
  for (const changes of [
    { jobId: '' }, { issueKey: issueKey({ ...issue(), issueId: 'other' }) }, { capture: null },
    { error: { code: 'timeout', message: 'Timeout' } }, { capture: {} }, { capture: capture({ stacktrace: '' }) },
    { capture: null, error: { code: 'invented', message: 'bad' } },
    { capture: null, error: { code: 'timeout', message: 'Timeout' }, issueKey: '{}' },
  ]) assert.throws(() => parseMessage(message('CAPTURE_RESULT', { ...payload, ...changes })));
});
