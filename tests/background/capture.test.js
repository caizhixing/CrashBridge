import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, issue, key, manager, message, capture } from './helpers.js';

test('capture opens one tab at a time, uses 60s alarms and retains user tabs', async () => {
  const f = fixture();
  await f.add([issue('a'), issue('b')]);
  await f.manage('START_CAPTURE');
  assert.equal(f.calls.opens.length, 1);
  assert.equal(f.calls.alarms[0].when, Date.parse('2026-11-16T00:01:00.000Z'));
  assert.equal((await f.result()).ok, true);
  assert.equal(f.calls.opens.length, 2);
  assert.deepEqual(f.calls.closes, [100]);
  assert.equal(f.tabs.has(7), true);
  await f.result();
  const state = await f.state();
  assert.deepEqual(state.items.map((item) => item.status), ['succeeded', 'succeeded']);
  assert.equal(state.active, null);
  assert.equal(state.running, false);
  assert.deepEqual(f.calls.closes, [100, 101]);
  await f.manage('START_CAPTURE');
  assert.equal(f.calls.opens.length, 2, 'successful items must not be captured again');
});

test('capture opens a fragment-free job URL and preserves the Firebase event query', async () => {
  const f = fixture();
  const ref = issue();
  ref.url += '?eventId=synthetic-event';
  await f.add([ref]);
  const { data: { active } } = await f.manage('START_CAPTURE');
  assert.equal(f.calls.opens[0].url, `${ref.url}&crashbridge-job=${active.jobId}`);
  assert.equal(f.calls.opens[0].url, active.url);
  assert.equal((await f.result()).ok, true);
  assert.deepEqual(f.calls.closes, [active.tabId]);
});

test('capture callbacks require tab, job, issue, exact job URL and capture identity', async () => {
  const f = fixture();
  await f.add(); await f.manage('START_CAPTURE');
  const before = await f.state();
  const active = before.active;
  const valid = { jobId: active.jobId, issueKey: active.key, capture: capture(), error: null };
  const sender = { id: manager.id, frameId: 0, tab: { id: active.tabId }, url: active.url };
  for (const [payload, alteredSender] of [
    [{ ...valid, jobId: '00000000-0000-4000-8000-000000000099' }, sender],
    [{ ...valid, issueKey: key(issue('other')) }, sender],
    [valid, { ...sender, tab: { id: 7 } }],
    [valid, { ...sender, url: 'https://example.invalid/wrong-app' }],
    [valid, { ...sender, id: 'other' }],
    [{ ...valid, capture: capture(issue('other')) }, sender],
  ]) {
    assert.equal((await f.controller.handle(message('CAPTURE_RESULT', payload), alteredSender)).ok, false);
  }
  assert.deepEqual(await f.state(), before);
  assert.equal((await f.result()).ok, true);
});

test('timeout, closed tabs and content errors fail individual items and continue; retry only failures', async () => {
  const f = fixture();
  await f.add([issue('a'), issue('b'), issue('c'), issue('d'), issue('e')]);
  await f.manage('START_CAPTURE');
  const first = (await f.state()).active;
  assert.equal((await f.controller.handle(message('TIMEOUT', { jobId: first.jobId }))).ok, false, 'early alarm cannot expire a job');
  f.setTime('2026-11-16T00:01:00.000Z');
  assert.equal((await f.controller.handle(message('TIMEOUT', { jobId: first.jobId }))).ok, true);
  assert.equal((await f.controller.handle(message('TIMEOUT', { jobId: first.jobId }))).ok, false, 'old timeout cannot affect next job');
  const second = (await f.state()).active;
  f.tabs.delete(second.tabId);
  await f.controller.handle(message('TAB_CLOSED', { tabId: second.tabId }));
  await f.result({ code: 'login-required', message: 'Synthetic login expired.' });
  await f.result({ code: 'missing-stack', message: 'Synthetic missing stack.' });
  await f.result();
  let state = await f.state();
  assert.deepEqual(state.items.map((item) => item.error?.code ?? null), ['timeout', 'tab-closed', 'login-required', 'missing-stack', null]);
  const count = f.calls.opens.length;
  await f.manage('START_CAPTURE');
  assert.equal(f.calls.opens.length, count, 'START does not retry failed items');
  await f.manage('RETRY_FAILED');
  for (let i = 0; i < 4; i++) await f.result();
  state = await f.state();
  assert.equal(state.items.every((item) => item.status === 'succeeded'), true);
  assert.equal(f.calls.opens.length, count + 4);
});

test('cancel is serialized with pending open, clears current task and rejects late results', async () => {
  const f = fixture();
  await f.add([issue('a'), issue('b')]);
  let release;
  let opened;
  const entering = new Promise((resolve) => { opened = resolve; });
  const originalOpen = f.platform.open;
  f.platform.open = async (url) => {
    opened(); await new Promise((resolve) => { release = resolve; }); return originalOpen(url);
  };
  const start = f.manage('START_CAPTURE');
  await entering;
  const cancel = f.manage('CANCEL_CAPTURE');
  release();
  assert.equal((await start).ok, true);
  assert.equal((await cancel).ok, true);
  const state = await f.state();
  assert.deepEqual(state.items.map((item) => item.status), ['cancelled', 'pending']);
  assert.equal(state.running, false);
  assert.equal(state.active, null);
  assert.equal(f.calls.opens.length, 1);
  const old = f.calls.opens[0];
  const payload = { jobId: '00000000-0000-4000-8000-000000000001', issueKey: key(issue('a')), capture: capture(issue('a')), error: null };
  assert.equal((await f.controller.handle(message('CAPTURE_RESULT', payload), { id: manager.id, frameId: 0, tab: { id: old.id }, url: old.url })).ok, false);
  assert.deepEqual(await f.state(), state);
  f.platform.open = originalOpen;
  await f.manage('START_CAPTURE');
  assert.equal((await f.state()).items[0].status, 'collecting');
});

test('navigation away from job URL is never closed as a user page', async () => {
  const f = fixture();
  await f.add(); await f.manage('START_CAPTURE');
  const active = (await f.state()).active;
  f.tabs.set(active.tabId, { id: active.tabId, url: 'https://example.invalid/user-navigation' });
  await f.manage('CANCEL_CAPTURE');
  assert.deepEqual(f.calls.closes, []);
  assert.equal(f.tabs.has(active.tabId), true);
});
