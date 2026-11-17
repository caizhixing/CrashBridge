import test from 'node:test';
import assert from 'node:assert/strict';
import { createResolver } from '../../src/background/resolver.js';
import { fixture, source, manager, message, issue } from './helpers.js';
const list = source().url;
const descriptor = title => ({ title, subtitle: 'Synthetic location', href: '#', cells: 2 });
const selection = { listUrl: list, snapshot: [descriptor('Synthetic A'), descriptor('Synthetic B')], selected: [0, 1] };
const sender = { ...source(), frameId: 0 };

function setup(stored = null) {
  const queue = fixture(); const faults = {}; const timers = new Map();
  let saved = structuredClone(stored); let clock = 0; let writes = 0;
  const sent = [];
  const platform = {
    ...queue.platform,
    now: () => clock,
    readSession: async () => { if (faults.read) throw new Error('synthetic'); return structuredClone(saved); },
    writeSession: async state => { writes++; if (faults.write || faults.writeAt === writes) throw new Error('synthetic'); saved = structuredClone(state); },
    send: async (id, msg) => { sent.push({ id, ...msg }); if (faults.send) throw new Error('synthetic'); if (faults.hang) return new Promise(() => {}); return { ok: !faults.replyFalse }; },
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const resolver = createResolver(platform, queue.controller);
  const current = () => saved?.active;
  return {
    resolver, queue, faults, timers, sent, platform, current,
    saved: () => saved, writes: () => writes,
    start: value => resolver.handle(message('RESOLVE_SELECTION', value ?? selection), sender),
    ready: () => resolver.handle(message('RESOLVER_READY', { token: current().token }), { ...sender, tab: { id: current().tabId }, url: current().url }),
    get: () => resolver.handle(message('GET_RESOLUTION'), sender),
    advance: () => { clock = 60001; },
    navigate: async (url = issue('real-synthetic').url) => { const id = current().tabId; queue.tabs.set(id, { id, url }); return resolver.updated(id, url); },
  };
}
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('serial fresh list tabs resolve actual URL through real queue and composite dedupe, original tab unchanged', async () => {
  const f = setup(); await f.resolver.recover();
  assert.equal((await f.get()).data.running, false);
  assert.equal((await f.start()).ok, true); assert.equal(f.queue.calls.opens.length, 1);
  assert.equal((await f.start()).ok, false);
  await f.ready(); assert.deepEqual(f.sent.map(entry => entry.type), ['CHECK_SELECTION', 'RESOLVE_ROW']);
  const first = f.current(); assert.equal((await f.ready()).ok, true); assert.equal(f.sent.length, 2);
  await f.resolver.updated(9999, issue().url); assert.equal((await f.queue.state()).items.length, 0);
  await f.resolver.updated(first.tabId, first.url); assert.equal((await f.queue.state()).items.length, 0);
  await f.navigate(); assert.equal(f.queue.calls.opens.length, 2); assert.deepEqual(f.queue.calls.closes, [first.tabId]);
  await f.ready(); await f.navigate();
  const result = (await f.get()).data;
  assert.equal(result.running, false); assert.equal(result.results[0].added, 1); assert.equal(result.results[1].duplicates, 1);
  assert.equal((await f.queue.state()).items.length, 1); assert.equal(f.resolver.busy(), false);
  assert.equal(f.queue.tabs.get(sender.tab.id).url, list); assert.equal(f.queue.calls.closes.includes(sender.tab.id), false);
});

test('sender/frame/token/list/payload forgery and capture overlap are rejected before opening', async () => {
  const f = setup(); await f.resolver.recover();
  for (const forged of [{ ...sender, id: 'evil' }, { ...sender, frameId: 1 }, { ...sender, frameId: undefined }, { ...sender, url: 'https://evil.test/' }, { ...sender, url: list + '?other=1' }]) assert.equal((await f.resolver.handle(message('RESOLVE_SELECTION', selection), forged)).ok, false);
  assert.equal((await f.start({ ...selection, junk: 'x'.repeat(300000) })).ok, false);
  assert.equal((await f.resolver.handle({ ...message('RESOLVE_SELECTION', selection), version: 2 }, sender)).ok, false);
  assert.equal((await f.resolver.handle(message('UNKNOWN'), sender)).ok, false);
  await f.queue.add(); await f.queue.manage('START_CAPTURE');
  assert.equal((await f.start()).ok, false); await f.queue.manage('CANCEL_CAPTURE');
  await f.start();
  assert.equal((await f.resolver.handle(message('RESOLVER_READY', { token: 'wrong' }), { ...sender, tab: { id: f.current().tabId }, url: f.current().url })).ok, false);
  assert.equal((await f.resolver.handle(message('GET_RESOLUTION'), { ...sender, tab: { id: 8 } })).ok, false);
  assert.equal((await f.resolver.handle(message('GET_RESOLUTION', { extra: true }), sender)).ok, false);
  assert.equal((await f.resolver.handle(message('CANCEL_RESOLUTION'), sender)).data.running, false);
});

test('snapshot/content failures remain visible and advance only after verified cleanup', async () => {
  for (const fault of ['replyFalse', 'send']) {
    const f = setup(); await f.start(); f.faults[fault] = true; await f.ready();
    assert.equal((await f.get()).data.results[0].error.code, 'unsupported'); assert.equal(f.queue.calls.opens.length, 2);
    await f.resolver.handle(message('CANCEL_RESOLUTION'), sender);
  }
  const f = setup(); await f.start(); f.queue.tabs.set(7, { id: 7, url: list + '?changed=1' });
  await f.ready(); assert.match((await f.get()).data.results[0].error.message, /route changed/);
});

test('never-settling content response is bounded; queued cancellation and timeout converge', async () => {
  const f = setup(); await f.start(); f.faults.hang = true;
  const ready = f.ready(); await drain(); assert.equal(f.timers.size, 1);
  const cancel = f.resolver.handle(message('CANCEL_RESOLUTION'), sender);
  [...f.timers.values()][0](); await ready; await cancel;
  assert.equal(f.resolver.busy(), false); assert.equal(f.queue.tabs.has(7), true); assert.equal((await f.get()).data.running, false);
});

test('timeout/closed/restart cancel pending state and reject stale events without permanent lock', async () => {
  const f = setup(); await f.start(); const first = f.current();
  await f.resolver.timeout('stale'); await f.resolver.timeout(first.token); assert.equal(f.queue.calls.opens.length, 1);
  f.advance(); await f.resolver.timeout(first.token); assert.equal((await f.get()).data.results[0].error.code, 'timeout');
  const second = f.current(); f.queue.tabs.delete(second.tabId); await f.resolver.closed(second.tabId);
  assert.equal((await f.get()).data.results[1].error.code, 'tab-closed'); assert.equal(f.resolver.busy(), false);
  await f.start(); const interrupted = f.saved();
  const restart = createResolver(f.platform, f.queue.controller); const reply = await restart.recover();
  assert.equal(reply.data.running, false); assert.equal(reply.data.results[0].error.code, 'cancelled'); assert.equal(restart.busy(), false);
  assert.equal(f.queue.calls.opens.length, 3); assert.ok(interrupted.active);
});

test('unverified external/login/wrong-project/missing URL never closes tab and blocks further batches until closed', async () => {
  for (const url of ['https://evil.test/', 'https://accounts.google.com/signin', issue('foreign', 'other-project').url, undefined]) {
    const f = setup(); await f.start(); await f.ready(); const id = f.current().tabId;
    f.queue.tabs.set(id, { id, url });
    if (url) await f.resolver.updated(id, url); else { f.advance(); await f.resolver.timeout(f.current().token); }
    assert.equal(f.queue.calls.closes.length, 0); assert.equal(f.queue.calls.opens.length, 1); assert.equal(f.resolver.busy(), true);
    assert.equal((await f.start()).ok, false); assert.equal((await f.get()).data.error.code, 'unsupported');
    f.queue.tabs.delete(id); await f.resolver.closed(id); assert.equal(f.resolver.busy(), false);
  }
});

test('cancel/restart never closes same-app detail that was not verified as resolution result', async () => {
  const f = setup(); await f.start(); await f.ready(); const id = f.current().tabId;
  f.queue.tabs.set(id, { id, url: issue('manually-navigated').url });
  await f.resolver.handle(message('CANCEL_RESOLUTION'), sender);
  assert.equal(f.queue.calls.closes.length, 0); assert.equal(f.resolver.busy(), true);
  const restarted = createResolver(f.platform, f.queue.controller); await restarted.recover(); assert.equal(restarted.busy(), true); assert.equal(f.queue.calls.closes.length, 0);
});

test('resource/session failures stop safely, failed recovery never overwrites session or opens tab', async () => {
  for (const method of ['open', 'alarm', 'close', 'getTab', 'clearAlarm']) {
    const f = setup(); if (['open', 'alarm'].includes(method)) f.queue.faults[method] = true;
    await f.start();
    if (!['open', 'alarm'].includes(method)) { f.queue.faults[method] = true; f.advance(); await f.resolver.timeout(f.current().token); }
    assert.equal((await f.get()).data.running, false); assert.equal(f.queue.calls.opens.length <= 1, true);
    assert.equal((await f.get()).data.error.code, 'unsupported');
  }
  for (const stored of [null, { unknown: true }]) {
    const f = setup(stored); if (stored === null) f.faults.read = true;
    assert.equal((await f.resolver.recover()).ok, false); assert.equal((await f.start()).ok, false);
    assert.equal(f.resolver.busy(), true); assert.equal(f.writes(), 0); assert.equal(f.queue.calls.opens.length, 0);
  }
  for (const writeAt of [1, 2, 3]) {
    const f = setup(); f.faults.writeAt = writeAt; await f.start();
    if (writeAt === 3) await f.ready();
    assert.equal((await f.get()).data.error.code, 'storage-failed'); assert.equal((await f.get()).data.running, false);
  }
});

test('mismatched current URL cannot enqueue or close; queue write failure stays visible', async () => {
  const f = setup(); await f.start(); await f.ready(); const id = f.current().tabId;
  f.queue.tabs.set(id, { id, url: issue('other-manual').url }); await f.resolver.updated(id, issue('reported').url);
  assert.equal((await f.queue.state()).items.length, 0); assert.equal(f.queue.calls.closes.length, 0); assert.equal((await f.get()).data.running, false);
  const g = setup(); await g.start(); await g.ready(); g.queue.faults.write = true; await g.navigate();
  assert.equal((await g.get()).data.results[0].error.code, 'storage-failed');
});
