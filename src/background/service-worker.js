import { createController } from './queue.js';

const STORAGE_KEY = 'crashbridge';
const ALARM_PREFIX = 'crashbridge:';
const controller = createController({
  read: async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? null,
  write: async (state) => { await chrome.storage.local.set({ [STORAGE_KEY]: state }); },
  open: async (url) => (await chrome.tabs.create({ url, active: false })).id,
  close: async (tabId) => { await chrome.tabs.remove(tabId); },
  getTab: async (tabId) => {
    try { return await chrome.tabs.get(tabId); }
    catch (error) {
      // A missing tab is normal after a user closes it; other failures remain visible.
      if (/No tab with id|Invalid tab ID/i.test(error.message)) return null;
      throw error;
    }
  },
  alarm: async (name, when) => { await chrome.alarms.create(ALARM_PREFIX + name, { when }); },
  clearAlarm: async (name) => { await chrome.alarms.clear(ALARM_PREFIX + name); },
  now: () => new Date().toISOString(),
  uuid: () => crypto.randomUUID(),
  extensionUrl: (path) => chrome.runtime.getURL(path),
});

// Queue recovery before any browser event; controller serializes all subsequent work.
const ready = controller.recover();
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ready.then(() => controller.handle(message, sender)).then(sendResponse, (error) => {
    sendResponse({ ok: false, error: { code: 'unsupported', message: error.message } });
  });
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  void ready.then(() => controller.handle({
    namespace: 'crashbridge', version: 1, type: 'TIMEOUT',
    payload: { jobId: alarm.name.slice(ALARM_PREFIX.length) },
  }));
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => controller.handle({
    namespace: 'crashbridge', version: 1, type: 'TAB_CLOSED', payload: { tabId },
  }));
});
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
});
