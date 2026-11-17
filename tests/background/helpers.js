import { createController } from '../../src/background/queue.js';

export const manager = { id: 'synthetic-extension', url: 'chrome-extension://synthetic-extension/manager.html' };
export const issue = (id = 'synthetic-issue', projectId = 'synthetic-project', appId = 'android:example.synthetic') => ({
  projectId, appId, issueId: id, title: 'Synthetic failure',
  url: `https://console.firebase.google.com/project/${projectId}/crashlytics/app/${appId}/issues/${id}`,
});
export const key = (value) => JSON.stringify([value.projectId, value.appId, value.issueId]);
export const source = (value = issue()) => ({
  id: manager.id, frameId: 0, tab: { id: 7 },
  url: `https://console.firebase.google.com/project/${value.projectId}/crashlytics/app/${value.appId}/issues`,
});
export const message = (type, payload = {}) => ({ namespace: 'crashbridge', version: 1, type, payload });
export const capture = (value = issue()) => ({
  issue: value, event: { eventId: null, identitySource: 'unavailable' },
  capturedAt: '2026-11-16T00:00:00.000Z', eventTimestamp: null,
  selection: 'currently-displayed', source: 'rendered-dom', completeness: 'unknown',
  stacktrace: 'SyntheticException\n at synthetic.call(Synthetic.java:1)',
  appVersion: null, versionCode: null, osVersion: null, deviceModel: null,
  statistics: { events: null, users: null, timeRange: null }, warnings: [],
});

export function fixture(stored = null) {
  const calls = { writes: [], opens: [], closes: [], alarms: [], clears: [] };
  const tabs = new Map([[7, { id: 7, url: source().url }]]);
  const faults = {};
  let time = '2026-11-16T00:00:00.000Z';
  let serial = 0;
  const fail = async (method) => { if (faults[method]) throw new Error(`synthetic ${method} failure`); };
  const platform = {
    read: async () => { await fail('read'); return structuredClone(stored); },
    write: async (state) => { await fail('write'); calls.writes.push(structuredClone(state)); stored = structuredClone(state); },
    open: async (url) => {
      await fail('open');
      const id = 100 + calls.opens.length;
      calls.opens.push({ id, url }); tabs.set(id, { id, url }); return id;
    },
    close: async (id) => { await fail('close'); calls.closes.push(id); tabs.delete(id); },
    getTab: async (id) => { await fail('getTab'); return tabs.get(id) ?? null; },
    alarm: async (name, when) => { await fail('alarm'); calls.alarms.push({ name, when }); },
    clearAlarm: async (name) => { await fail('clearAlarm'); calls.clears.push(name); },
    now: () => time,
    uuid: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`,
    extensionUrl: (path) => `chrome-extension://${manager.id}/${path}`,
  };
  const controller = createController(platform);
  return {
    controller, platform, calls, tabs, faults,
    setTime: (value) => { time = value; },
    state: async () => (await controller.handle(message('GET_STATE'), manager)).data,
    add: (issues = [issue()]) => controller.handle(message('ADD_ISSUES', { issues }), source(issues[0])),
    manage: (type, payload) => controller.handle(message(type, payload), manager),
    result: async (error = null, value) => {
      const state = (await controller.handle(message('GET_STATE'), manager)).data;
      const active = state.active;
      const item = state.items.find((entry) => entry.key === active.key);
      return controller.handle(message('CAPTURE_RESULT', {
        jobId: active.jobId, issueKey: active.key,
        capture: error ? null : capture(value ?? item.issue), error,
      }), { id: manager.id, frameId: 0, tab: { id: active.tabId }, url: active.url });
    },
  };
}
