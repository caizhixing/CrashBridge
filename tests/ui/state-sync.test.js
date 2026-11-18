import test from 'node:test';
import assert from 'node:assert/strict';
import { createStateSync } from '../../extension/state-sync.js';

function harness(refresh) {
  const h = { visible: true, busy: false, cleared: [], errors: [], calls: 0 };
  h.sync = createStateSync({
    refresh: async () => { h.calls++; await refresh(); },
    onError: error => h.errors.push(error.message),
    isVisible: () => h.visible,
    isBusy: () => h.busy,
    setInterval: (callback, delay) => { h.tick = callback; assert.equal(delay, 2000); return 42; },
    clearInterval: id => h.cleared.push(id)
  });
  return h;
}

test('visible-only local GET_STATE fallback coalesces ticks/storage/manual events and disposes cleanly', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; }));
  const request = h.sync.request();
  assert.equal(h.sync.request(), request);
  await Promise.resolve();
  h.tick(); h.tick();
  assert.equal(h.calls, 1);
  finish();
  await request;
  assert.equal(h.calls, 1, 'missed ticks must not create a queued request');
  h.visible = false;
  await h.sync.request(); h.tick();
  assert.equal(h.calls, 1);
  h.visible = true; h.busy = true;
  await h.sync.request();
  assert.equal(h.calls, 1);
  h.busy = false;
  const next = h.sync.request();
  await Promise.resolve();
  assert.equal(h.calls, 2);
  h.sync.dispose();
  finish(); await next;
  await h.sync.request(); h.tick();
  assert.equal(h.calls, 2);
  assert.deepEqual(h.cleared, [42]);
});

test('read failures are visible, keep the last snapshot and permit next refresh, without unhandled tick rejection', async () => {
  let fail = true;
  let snapshot = { items: ['last-known-good'] };
  const h = harness(async () => {
    if (fail) throw new Error('synthetic-local-connection-error');
    snapshot = { items: ['new-state'] };
  });
  await h.sync.request();
  assert.deepEqual(h.errors, ['synthetic-local-connection-error']);
  assert.deepEqual(snapshot, { items: ['last-known-good'] });
  fail = false;
  await h.sync.request();
  assert.equal(h.calls, 2);
  assert.deepEqual(snapshot, { items: ['new-state'] });
  h.sync.dispose();
});
