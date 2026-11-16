import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, issue, capture, manager, message } from './helpers.js';

 test('write failures never report success and memory retains visible unsaved queue', async () => {
  const f = fixture();
  await f.controller.recover();
  f.faults.write = true;
  const response = await f.add();
  assert.equal(response.ok, false);
  assert.equal(response.error.code, 'storage-failed');
  assert.match(response.error.message, /write failure/);
  const state = await f.state();
  assert.equal(state.items.length, 1);
  assert.equal(state.lastError.code, 'storage-failed');
  assert.equal(state.running, false);
  assert.deepEqual(f.calls.writes.at(-1).items, []);
  f.faults.write = false;
  assert.equal((await f.manage('CLEAR_QUEUE')).ok, true);
  assert.equal((await f.state()).lastError, null);
});

test('UTF-8 4 MiB guard checks cumulative captures before writing without deleting results', async () => {
  const f = fixture();
  await f.add(Array.from({ length: 8 }, (_, n) => issue(`large-${n}`)));
  await f.manage('START_CAPTURE');
  let last;
  for (let n = 0; n < 7; n++) {
    const active = (await f.state()).active;
    const value = capture(issue(`large-${n}`)); value.stacktrace = '界'.repeat(200000);
    last = await f.controller.handle(message('CAPTURE_RESULT', {
      jobId: active.jobId, issueKey: active.key, capture: value, error: null,
    }), { id: manager.id, tab: { id: active.tabId }, url: active.url });
  }
  assert.equal(last.ok, false);
  assert.equal(last.error.code, 'storage-failed');
  assert.match(last.error.message, /4 MiB/);
  const state = await f.state();
  assert.equal(state.items.filter((item) => item.status === 'succeeded').length, 7);
  assert.equal(state.items[6].capture.stacktrace.length, 200000);
  assert.equal(state.running, false);
  assert.equal(f.calls.opens.length, 7, 'storage overflow must not open the eighth tab');
  assert.equal(f.calls.writes.every((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 4194304), true);
  assert.equal((await f.manage('CLEAR_QUEUE')).ok, true);
  assert.deepEqual(f.calls.writes.at(-1).items, []);
});

test('storage failure before open and after open converges without next-item scheduling', async () => {
  const f = fixture(); await f.add([issue('a'), issue('b')]);
  f.faults.write = true;
  assert.equal((await f.manage('START_CAPTURE')).ok, false);
  assert.equal(f.calls.opens.length, 0);
  assert.equal((await f.state()).items[0].status, 'cancelled');
  const g = fixture(); await g.add([issue('a'), issue('b')]);
  const open = g.platform.open;
  g.platform.open = async (url) => { const id = await open(url); g.faults.write = true; return id; };
  assert.equal((await g.manage('START_CAPTURE')).ok, false);
  assert.deepEqual(g.calls.closes, [100]);
  assert.equal((await g.state()).active, null);
  assert.equal((await g.state()).lastError.code, 'storage-failed');
});

test('browser open and alarm failures report specific errors and stop without infinite retries', async () => {
  for (const method of ['open', 'alarm']) {
    const f = fixture(); await f.add([issue('a'), issue('b')]);
    f.faults[method] = true;
    const result = await f.manage('START_CAPTURE');
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unsupported');
    assert.match(result.error.message, new RegExp(`${method} failure`));
    const state = await f.state();
    assert.equal(state.running, false);
    assert.deepEqual(state.items.map((item) => item.status), ['failed', 'pending']);
    assert.equal(state.active, null);
    assert.equal(f.calls.opens.length, method === 'open' ? 0 : 1);
  }
  const f = fixture(); await f.add(); f.platform.open = async () => undefined;
  const response = await f.manage('START_CAPTURE');
  assert.equal(response.ok, false);
  assert.match(response.error.message, /tab ID/);
});

test('cleanup failures stop the batch, preserve completed results and expose concrete reasons', async () => {
  for (const method of ['getTab', 'close', 'clearAlarm']) {
    const f = fixture(); await f.add([issue('a'), issue('b')]); await f.manage('START_CAPTURE');
    f.faults[method] = true;
    const result = await f.result();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'unsupported');
    assert.match(result.error.message, new RegExp(`${method} failure`));
    const state = await f.state();
    assert.deepEqual(state.items.map((item) => item.status), ['succeeded', 'pending']);
    assert.equal(state.running, false);
    assert.equal(f.calls.opens.length, 1);
    assert.notEqual(state.active, null, 'keep cleanup identity to prevent opening a second capture tab');
    assert.equal((await f.manage('START_CAPTURE')).ok, false);
    assert.equal((await f.result()).ok, false, 'stopped job cannot overwrite its already completed result');
    f.faults[method] = false;
    assert.equal((await f.manage('CANCEL_CAPTURE')).ok, true);
    assert.equal((await f.state()).items[0].status, 'succeeded');
    assert.equal((await f.state()).active, null);
  }
});

test('missing tab URL safe-stops completion and cancellation, preserving identity until verified cleanup', async () => {
  for (const operation of ['complete', 'cancel']) {
    const f = fixture();
    await f.add([issue('a'), issue('b')]);
    await f.manage('START_CAPTURE');
    const active = (await f.state()).active;
    const getTab = f.platform.getTab;
    f.platform.getTab = async (id) => ({ id });
    const response = operation === 'complete' ? await f.result() : await f.manage('CANCEL_CAPTURE');
    assert.equal(response.ok, false, `${operation} must reject incomplete tab identity`);
    assert.equal(response.error.code, 'unsupported');
    assert.match(response.error.message, /tab URL unavailable/);
    const state = await f.state();
    assert.deepEqual(state.active, active);
    assert.equal(state.running, false);
    assert.deepEqual(state.items.map((item) => item.status),
      [operation === 'complete' ? 'succeeded' : 'cancelled', 'pending']);
    assert.deepEqual(f.calls.closes, [], 'never close an unverified tab');
    assert.equal(f.tabs.has(active.tabId), true);
    assert.equal((await f.manage('START_CAPTURE')).error.message, 'Capture is already running.');
    assert.deepEqual(await f.state(), state);
    assert.equal(f.calls.opens.length, 1, 'retained cleanup task must prevent a second capture tab');
    f.platform.getTab = getTab;
    assert.equal((await f.manage('CANCEL_CAPTURE')).ok, true);
    const cleaned = await f.state();
    assert.equal(cleaned.active, null);
    assert.equal(cleaned.items[0].status, state.items[0].status);
    assert.deepEqual(cleaned.items[0].capture, state.items[0].capture);
    assert.deepEqual(f.calls.closes, [active.tabId]);
    assert.equal((await f.manage('START_CAPTURE')).ok, true);
    assert.equal(f.calls.opens.length, 2, 'new capture only starts after verified cleanup');
  }
});

test('failed cancellation cleanup does not clear user data or resume capture', async () => {
  const f = fixture(); await f.add(); await f.manage('START_CAPTURE');
  f.faults.close = true;
  assert.equal((await f.manage('CANCEL_CAPTURE')).ok, false);
  const state = await f.state();
  assert.equal(state.items[0].status, 'cancelled');
  assert.equal(state.lastError.code, 'unsupported');
  assert.equal(state.running, false);
});
