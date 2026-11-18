import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../../src/background/resolver.js';
import { fixture, source, message, issue } from './helpers.js';
const sender = { ...source(), frameId: 0 };
const selection = { listUrl: sender.url, snapshot: [{ title: 'Synthetic A', subtitle: 'Synthetic location', href: '#', cells: 2 }], selected: [0] };

async function setup() {
  const queue = fixture(); let saved = null;
  const platform = {
    ...queue.platform, now: () => 0,
    readSession: async () => structuredClone(saved),
    writeSession: async state => { saved = structuredClone(state); },
    open: async url => { const id = await queue.platform.open(url); queue.tabs.get(id).active = false; return id; },
    send: async () => ({ ok: true }),
  };
  const resolver = createResolver(platform, queue.controller);
  await resolver.recover();
  await resolver.handle(message('RESOLVE_SELECTION', selection), sender);
  const active = saved.active;
  const ready = () => resolver.handle(message('RESOLVER_READY', { token: active.token }), { ...sender, tab: { id: active.tabId }, url: active.url });
  return { resolver, queue, platform, active, ready, saved: () => saved };
}

test('malformed persisted session cannot close source tab, trust arbitrary hash, or overwrite unknown state', async () => {
  const base = await setup();
  const valid = base.saved();
  const mutations = [
    state => { state.active.tabId = state.sourceTab; state.active.url = state.selection.listUrl; state.active.token = 'synthetic-forged'; },
    state => { state.active.token = 'synthetic-forged'; },
    state => { state.active.url = state.selection.listUrl; },
    state => { state.active.phase = 'arbitrary'; },
    state => { state.active.deadline = 'never'; },
    state => { state.active.resolvedUrl = 'https://evil.test/'; },
    state => { state.active.resolvedUrl = issue('foreign', 'other-project').url; },
    state => { state.results[0].index = 99; },
    state => { state.selection.snapshot[0].title = ''; },
  ];
  for (const mutate of mutations) {
    const stored = structuredClone(valid); mutate(stored);
    const closes = []; let writes = 0;
    const resolver = createResolver({ ...base.platform, readSession: async () => stored, writeSession: async () => { writes++; }, close: async id => { closes.push(id); } }, base.queue.controller);
    const reply = await resolver.recover();
    assert.equal(reply.ok, false); assert.equal(reply.error.code, 'storage-failed');
    assert.equal(resolver.busy(), true); assert.equal(writes, 0); assert.deepEqual(closes, []);
    assert.equal((await resolver.handle(message('RESOLVE_SELECTION', selection), sender)).ok, false);
  }
});

test('activation is sticky before/after detail event, missing active is fail-closed, stale messages cannot close takeover', async () => {
  for (const order of ['activate-first', 'update-first', 'no-event-active', 'missing-active']) {
    const f = await setup(); await f.ready();
    const id = f.active.tabId; const url = issue('manual-synthetic').url;
    f.queue.tabs.set(id, { id, url, ...(order === 'missing-active' ? {} : { active: true }) });
    if (order === 'activate-first') await f.resolver.activated(id);
    const update = f.resolver.updated(id, url);
    if (order === 'update-first') await f.resolver.activated(id);
    await update;
    assert.equal((await f.queue.state()).items.length, 0); assert.deepEqual(f.queue.calls.closes, []);
    assert.equal(f.resolver.busy(), true); assert.equal(f.saved().active.intervened, true);
    f.queue.tabs.set(id, { id, url: f.active.url, active: false });
    await f.ready(); await f.resolver.updated(id, issue('another-manual').url);
    await f.resolver.handle(message('CANCEL_RESOLUTION'), sender);
    assert.deepEqual(f.queue.calls.closes, []); assert.equal(f.resolver.busy(), true);
    const restart = createResolver(f.platform, f.queue.controller); await restart.recover();
    assert.deepEqual(f.queue.calls.closes, []); assert.equal(restart.busy(), true);
    f.queue.tabs.delete(id); await restart.closed(id); assert.equal(restart.busy(), false);
  }
});

test('activation while CHECK_SELECTION is pending prevents any later click instruction', async () => {
  const f = await setup(); const sent = []; let release;
  f.platform.send = async (id, instruction) => {
    sent.push(instruction.type);
    if (instruction.type === 'CHECK_SELECTION') return new Promise(resolve => { release = resolve; });
    return { ok: true };
  };
  const ready = f.ready();
  for (let i = 0; i < 30 && !release; i++) await Promise.resolve();
  assert.equal(typeof release, 'function');
  f.queue.tabs.get(f.active.tabId).active = true;
  const activation = f.resolver.activated(f.active.tabId);
  release({ ok: true }); await ready; await activation;
  assert.deepEqual(sent, ['CHECK_SELECTION']); assert.equal((await f.queue.state()).items.length, 0);
  assert.deepEqual(f.queue.calls.closes, []); assert.equal(f.saved().active.intervened, true);
});

test('activation during content handshake invalidates synchronously; non-owned activations do not stop resolution', async () => {
  const f = await setup(); await f.resolver.activated(7); await f.resolver.activated(9999);
  await f.ready();
  assert.equal(f.saved().running, true);
  const id = f.active.tabId; const url = issue('normal-synthetic').url;
  f.queue.tabs.set(id, { id, url, active: false });
  await f.resolver.updated(id, url);
  assert.equal((await f.queue.state()).items.length, 1); assert.deepEqual(f.queue.calls.closes, [id]);
});

test('activation emitted before tabs.create returns stays sticky even after switching back', async () => {
  const f = await setup(); await f.resolver.handle(message('CANCEL_RESOLUTION'), sender);
  const originalOpen = f.platform.open; let release; let openedId;
  f.platform.open = async url => {
    openedId = await originalOpen(url);
    f.queue.tabs.get(openedId).active = true;
    void f.resolver.activated(openedId);
    return new Promise(resolve => { release = () => { f.queue.tabs.get(openedId).active = false; resolve(openedId); }; });
  };
  const started = f.resolver.handle(message('RESOLVE_SELECTION', selection), sender);
  for (let i = 0; i < 30 && !release; i++) await Promise.resolve();
  assert.equal(typeof release, 'function'); release(); await started;
  const active = f.saved().active;
  await f.resolver.handle(message('RESOLVER_READY', { token: active.token }), { ...sender, tab: { id: openedId }, url: active.url });
  assert.equal(f.saved().active.intervened, true); assert.equal(f.saved().running, false);
  assert.equal((await f.queue.state()).items.length, 0); assert.equal(f.queue.calls.closes.includes(openedId), false);
});

test('restart does not treat persisted same-app resolved URL as proof of click ownership', async () => {
  const f = await setup(); await f.ready();
  const stored = f.saved(); const id = f.active.tabId; const url = issue('unverified-persisted').url;
  stored.active.resolvedUrl = url; stored.active.phase = 'clicked';
  f.queue.tabs.set(id, { id, url, active: false });
  const restart = createResolver({ ...f.platform, readSession: async () => stored }, f.queue.controller);
  const reply = await restart.recover();
  assert.equal(reply.data.running, false); assert.equal(restart.busy(), true);
  assert.deepEqual(f.queue.calls.closes, []); assert.equal((await f.queue.state()).items.length, 0);
});

test('active/missing-active cleanup and recovery never close a user-visible temporary tab even at exact owned URL', async () => {
  for (const active of [true, undefined]) {
    const f = await setup(); const id = f.active.tabId;
    f.queue.tabs.set(id, { id, url: f.active.url, ...(active === undefined ? {} : { active }) });
    const restart = createResolver(f.platform, f.queue.controller); await restart.recover();
    assert.deepEqual(f.queue.calls.closes, []); assert.equal(restart.busy(), true);
    assert.match((await restart.handle(message('GET_RESOLUTION'), sender)).data.error.message, /activated or taken over/);
  }
});
