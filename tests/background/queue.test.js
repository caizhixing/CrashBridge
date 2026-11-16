import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, issue, key, manager, message, source } from './helpers.js';

test('add deduplicates composite identities, preserves app/project distinctions and snapshots', async () => {
  const f = fixture();
  assert.equal((await f.add([issue(), issue()])).ok, true);
  assert.equal((await f.add([issue('synthetic-issue', 'other-project')])).ok, true);
  assert.equal((await f.add([issue('synthetic-issue', 'synthetic-project', 'android:other.app')])).ok, true);
  const state = await f.state();
  assert.equal(state.items.length, 3);
  assert.equal(new Set(state.items.map((item) => item.key)).size, 3);
  state.items.length = 0;
  assert.equal((await f.state()).items.length, 3);
});

test('100 item limit is atomic and concurrency never loses updates', async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 100 }, (_, i) => f.add([issue(`issue-${i}`)])));
  assert.equal(responses.every((result) => result.ok), true);
  assert.equal((await f.add([issue('overflow')])).ok, false);
  assert.equal((await f.state()).items.length, 100);
  assert.equal(f.calls.writes.at(-1).items.length, 100);
});

test('strict sender authorization protects even GET_STATE and rejects mismatched ADD', async () => {
  const f = fixture();
  for (const sender of [undefined, source(), { ...manager, id: 'other-extension' },
    { ...manager, url: `${manager.url}.evil` }, { ...manager, url: 'not a url' },
    { ...manager, url: `${manager.url}?spoof=1` }]) {
    assert.equal((await f.controller.handle(message('GET_STATE'), sender)).ok, false);
  }
  for (const sender of [{ ...source(), id: 'other' }, { ...source(), tab: undefined },
    { ...source(), url: 'https://evil.example/project/synthetic-project/crashlytics/app/android:example.synthetic' },
    { ...source(), url: 'https://console.firebase.google.com/unrecognized' },
    { ...source(), url: 'https://console.firebase.google.com/project/%zz/crashlytics/app/android:example.synthetic' },
    { ...source(), url: 'bad url' }, source(issue('x', 'other'))]) {
    assert.equal((await f.controller.handle(message('ADD_ISSUES', { issues: [issue()] }), sender)).ok, false);
  }
  assert.equal((await f.add([{ ...issue(), issueId: '' }])).ok, false);
  assert.equal((await f.state()).items.length, 0);
});

test('remove and clear delete captures; running mutations and duplicate starts are refused', async () => {
  const f = fixture();
  await f.add([issue('a'), issue('b')]);
  await f.manage('START_CAPTURE');
  for (const type of ['START_CAPTURE', 'RETRY_FAILED', 'REMOVE_ISSUE', 'CLEAR_QUEUE']) {
    assert.equal((await f.manage(type, { key: key(issue('b')) })).ok, false);
  }
  await f.result(); await f.result();
  assert.equal((await f.manage('REMOVE_ISSUE', { key: key(issue('a')) })).data.items.length, 1);
  const cleared = await f.manage('CLEAR_QUEUE');
  assert.deepEqual(cleared.data.items, []);
  assert.deepEqual(f.calls.writes.at(-1).items, []);
});

test('runtime forged internal events and invalid protocols do not mutate the queue', async () => {
  const f = fixture();
  await f.add(); await f.manage('START_CAPTURE');
  const before = await f.state();
  for (const type of ['TIMEOUT', 'TAB_CLOSED']) {
    assert.equal((await f.controller.handle(message(type, { jobId: before.active.jobId, tabId: before.active.tabId }), manager)).ok, false);
  }
  assert.equal((await f.controller.handle({ ...message('GET_STATE'), version: 2 }, manager)).ok, false);
  assert.deepEqual(await f.state(), before);
});
