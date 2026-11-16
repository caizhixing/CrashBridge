import test from 'node:test';
import assert from 'node:assert/strict';
import { manager, issue, message, source } from './helpers.js';

const event = () => {
  let listener;
  return { addListener: (value) => { listener = value; }, emit: (...args) => listener(...args) };
};

 test('Chrome glue connects storage/runtime/action/alarms/tab removal without exposing internal messages', async () => {
  const tabs = new Map();
  const created = [];
  const removed = [];
  const alarms = [];
  const cleared = [];
  let stored = null;
  let next = 100;
  const chrome = {
    storage: { local: {
      get: async (key) => ({ [key]: stored }),
      set: async (value) => { stored = structuredClone(value.crashbridge); },
    } },
    tabs: {
      onRemoved: event(),
      create: async (options) => { const tab = { id: next++, ...options }; tabs.set(tab.id, tab); created.push(tab); return tab; },
      get: async (id) => { if (!tabs.has(id)) throw new Error(`No tab with id: ${id}`); return tabs.get(id); },
      remove: async (id) => { tabs.delete(id); removed.push(id); },
    },
    alarms: {
      onAlarm: event(),
      create: async (name, options) => { alarms.push({ name, ...options }); },
      clear: async (name) => { cleared.push(name); },
    },
    runtime: { onMessage: event(), getURL: (path) => `chrome-extension://${manager.id}/${path}` },
    action: { onClicked: event() },
  };
  const previous = globalThis.chrome;
  globalThis.chrome = chrome;
  try {
    await import('../../src/background/service-worker.js');
    const send = (type, payload = {}, sender = manager) => new Promise((resolve) => {
      assert.equal(chrome.runtime.onMessage.emit(message(type, payload), sender, resolve), true);
    });
    assert.equal((await send('ADD_ISSUES', { issues: [issue('a'), issue('b'), issue('c')] }, source())).ok, true);
    chrome.action.onClicked.emit();
    assert.equal(created[0].url, manager.url);
    assert.equal((await send('START_CAPTURE')).ok, true);
    assert.equal(created[1].active, false);
    assert.match(alarms[0].name, /^crashbridge:/);
    assert.equal(alarms[0].when, Date.parse(stored.active.deadline));
    assert.equal((await send('TIMEOUT', { jobId: stored.active.jobId })).ok, false);
    assert.equal((await send('GET_STATE', {}, source())).ok, false);
    const firstId = stored.active.tabId;
    tabs.delete(firstId);
    chrome.tabs.onRemoved.emit(firstId);
    let state = (await send('GET_STATE')).data;
    assert.equal(state.items[0].error.code, 'tab-closed');
    assert.equal(state.items[1].status, 'collecting');
    const before = structuredClone(state);
    chrome.alarms.onAlarm.emit({ name: 'unrelated-alarm' });
    chrome.alarms.onAlarm.emit({ name: alarms[0].name });
    state = (await send('GET_STATE')).data;
    assert.deepEqual(state, before, 'stale alarm must not affect next job');
    // An alarm delivered after the deadline models a suspended MV3 worker.
    const realNow = Date.prototype.toISOString;
    Date.prototype.toISOString = () => '2099-01-01T00:00:00.000Z';
    try {
      chrome.alarms.onAlarm.emit({ name: alarms[1].name });
      state = (await send('GET_STATE')).data;
    } finally { Date.prototype.toISOString = realNow; }
    assert.equal(state.items[1].error.code, 'timeout');
    assert.equal(state.items[2].status, 'collecting');
    assert.equal(removed.includes(before.active.tabId), true);
    assert.equal(cleared.includes(alarms[1].name), true);
    // Tab disappeared without its removal notification: getTab maps missing IDs to null.
    tabs.delete(state.active.tabId);
    assert.equal((await send('CANCEL_CAPTURE')).ok, true);
    assert.equal((await send('GET_STATE')).data.active, null);
    assert.equal(tabs.has(created[0].id), true, 'manager/user tab must remain untouched');
  } finally {
    globalThis.chrome = previous;
  }
});
