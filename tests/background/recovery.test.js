import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, issue, key, message, manager } from './helpers.js';

const item = () => ({ key: key(issue()), issue: issue(), status: 'collecting', capture: null, error: null });
const interrupted = () => ({
  schemaVersion: 1, items: [item()], running: true, lastError: null,
  active: { key: key(issue()), tabId: 100, jobId: 'synthetic-job',
    url: `${issue().url}?crashbridge-job=synthetic-job`, deadline: '2026-11-16T00:01:00.000Z' },
});

test('recovery cancels interrupted jobs once and cleans only a verified owned tab', async () => {
  const stored = interrupted();
  const f = fixture(stored);
  f.tabs.set(100, { id: 100, url: stored.active.url });
  const recovered = await f.controller.recover();
  assert.equal(recovered.ok, true);
  assert.equal(recovered.data.items[0].status, 'cancelled');
  assert.equal(recovered.data.items[0].error.code, 'cancelled');
  assert.equal(recovered.data.active, null);
  assert.equal(recovered.data.running, false);
  assert.deepEqual(f.calls.closes, [100]);
  assert.equal(f.calls.opens.length, 0);
  const writes = f.calls.writes.length;
  await f.controller.recover();
  assert.equal(f.calls.writes.length, writes);
  assert.equal((await f.controller.handle(message('TIMEOUT', { jobId: 'synthetic-job' }))).ok, false);
});

test('recovery still closes an exact legacy capture hash URL', async () => {
  const stored = interrupted();
  stored.active.url = stored.active.url.replace('?', '#');
  const f = fixture(stored);
  f.tabs.set(100, { id: 100, url: stored.active.url });
  assert.equal((await f.controller.recover()).ok, true);
  assert.deepEqual(f.calls.closes, [100]);
});

test('recovery never closes reused IDs, navigated tabs, missing job tokens or forged stored URLs', async () => {
  for (const tab of [null, { id: 101, url: interrupted().active.url },
    { id: 100, url: issue().url }, { id: 100, url: 'https://example.invalid/user-page' }]) {
    const f = fixture(interrupted());
    if (tab) f.tabs.set(100, tab);
    await f.controller.recover();
    assert.deepEqual(f.calls.closes, []);
  }
  const stored = interrupted();
  stored.active.url = 'https://example.invalid/user-page#crashbridge-job=synthetic-job';
  const f = fixture(stored);
  f.tabs.set(100, { id: 100, url: stored.active.url });
  await f.controller.recover();
  assert.deepEqual(f.calls.closes, []);
});

test('recovery retains cleanup identity when an existing tab URL is unavailable', async () => {
  const stored = interrupted();
  const f = fixture(stored);
  f.tabs.set(100, { id: 100 });
  const response = await f.controller.recover();
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'unsupported');
  assert.match(response.error.message, /tab URL unavailable/);
  const state = await f.state();
  assert.deepEqual(state.active, stored.active);
  assert.equal(state.items[0].status, 'cancelled');
  assert.equal(state.running, false);
  assert.deepEqual(f.calls.closes, []);
  assert.equal(f.calls.writes.at(-1).lastError.code, 'unsupported');
  assert.equal((await f.manage('START_CAPTURE')).error.message, 'Capture is already running.');
  assert.equal(f.calls.opens.length, 0);
  f.tabs.set(100, { id: 100, url: stored.active.url });
  assert.equal((await f.manage('CANCEL_CAPTURE')).ok, true);
  assert.deepEqual(f.calls.closes, [100]);
  assert.equal((await f.state()).active, null);
});

test('collecting without an active task is interrupted, clean initialization is idempotent', async () => {
  const stored = interrupted(); stored.active = null;
  const f = fixture(stored);
  assert.equal((await f.controller.recover()).data.items[0].status, 'cancelled');
  const empty = fixture();
  assert.deepEqual((await empty.controller.recover()).data.items, []);
  await empty.controller.recover();
  assert.equal(empty.calls.writes.length, 1);
});

test('unknown, invalid or unreadable storage stays untouched and mutations are refused', async () => {
  const duplicate = interrupted(); duplicate.items.push(item());
  const tooMany = interrupted(); tooMany.items = Array.from({ length: 101 }, (_, n) => {
    const value = issue(`item-${n}`); return { ...item(), key: key(value), issue: value };
  }); tooMany.active = null;
  const invalidActive = interrupted(); invalidActive.active.tabId = '100';
  const invalidItem = interrupted(); invalidItem.items[0].status = 'forged';
  for (const stored of [{ schemaVersion: 99 }, duplicate, tooMany, invalidActive, invalidItem]) {
    const f = fixture(stored);
    assert.equal((await f.controller.recover()).ok, false);
    assert.equal((await f.manage('CLEAR_QUEUE')).ok, false);
    assert.equal(f.calls.writes.length, 0);
    assert.equal(f.calls.closes.length, 0);
  }
  const f = fixture(); f.faults.read = true;
  const response = await f.controller.recover();
  assert.equal(response.error.code, 'storage-failed');
  assert.match(response.error.message, /read failure/);
  assert.equal((await f.controller.handle(message('GET_STATE'), manager)).ok, false);
});
