import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, manager, message } from '../background/helpers.js';
import { ISSUE_URL, stackDocument, STACK } from '../adapter/fake-dom.js';
import { parseIssueUrl, extractCapture } from '../../src/adapter/firebase.js';
import { parseMessage } from '../../src/domain/protocol.js';
import { createBundle, toMarkdown } from '../../src/domain/export.js';
import { createExportSnapshot, DEFAULT_OPTIONS, controlsFor } from '../../extension/ui-model.js';

test('real adapter -> validated queue -> filtered preview/dual export preserves issue identity and warnings', async () => {
  const f = fixture();
  const ref = parseIssueUrl(ISSUE_URL);
  assert.equal((await f.add([ref, ref])).ok, true);
  assert.equal((await f.state()).items.length, 1);
  assert.equal((await f.manage('START_CAPTURE')).ok, true);
  const active = (await f.state()).active;
  const { document } = stackDocument(active.url);
  const capture = extractCapture(document, ref, f.platform.now());
  capture.osVersion = 'synthetic-private-os';
  capture.deviceModel = 'synthetic-private-device';
  capture.statistics.users = 'synthetic-private-count';
  const result = parseMessage(message('CAPTURE_RESULT', {
    jobId: active.jobId, issueKey: active.key, capture, error: null,
  }));
  const reply = await f.controller.handle(result, {
    id: manager.id, tab: { id: active.tabId }, url: active.url,
  });
  assert.equal(reply.ok, true);
  const state = reply.data;
  assert.equal(state.running, false);
  assert.equal(state.active, null);
  assert.equal(state.items[0].status, 'succeeded');
  assert.equal(state.items[0].capture.stacktrace, STACK);
  assert.equal(controlsFor(state).export, true);
  assert.deepEqual(f.calls.closes, [active.tabId]);
  const snapshot = createExportSnapshot(state.items, DEFAULT_OPTIONS, f.platform.now(), { createBundle, toMarkdown });
  for (const raw of [snapshot.json, snapshot.markdown]) {
    const output = raw.replaceAll('\\-', '-');
    assert.ok(output.includes('synthetic-issue'));
    assert.ok(output.includes('unknown'));
    assert.ok(output.includes('currently-displayed'));
    assert.ok(output.includes('not been verified'));
    assert.ok(!output.includes('synthetic-private-'));
  }
  assert.equal(JSON.parse(snapshot.json).issues[0].capture.stacktrace, STACK);
  assert.equal(state.items[0].capture.deviceModel, 'synthetic-private-device');
});

test('failed detail capture survives export with precise error and can be retried without duplicating issue', async () => {
  const f = fixture();
  await f.add([parseIssueUrl(ISSUE_URL)]);
  await f.manage('START_CAPTURE');
  const active = (await f.state()).active;
  const result = parseMessage(message('CAPTURE_RESULT', {
    jobId: active.jobId, issueKey: active.key, capture: null,
    error: { code: 'missing-stack', message: 'Synthetic unsupported rendered frame content.' },
  }));
  assert.equal((await f.controller.handle(result, { id: manager.id, tab: { id: active.tabId }, url: active.url })).ok, true);
  const state = await f.state();
  assert.equal(state.items[0].status, 'failed');
  const snapshot = createExportSnapshot(state.items, DEFAULT_OPTIONS, f.platform.now(), { createBundle, toMarkdown });
  assert.ok(snapshot.json.includes('missing-stack'));
  assert.ok(snapshot.markdown.includes('missing'));
  assert.equal((await f.manage('RETRY_FAILED')).ok, true);
  assert.equal((await f.state()).items.length, 1);
  assert.notEqual((await f.state()).active.jobId, active.jobId);
  await f.manage('CANCEL_CAPTURE');
  assert.equal((await f.state()).items[0].status, 'cancelled');
});
