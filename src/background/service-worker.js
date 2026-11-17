import { createController } from './queue.js';
import { createResolver } from './resolver.js';
import { listUrl } from '../adapter/selection.js';

const STORAGE_KEY = 'crashbridge';
const SESSION_KEY = 'crashbridge-resolution';
const ALARM_PREFIX = 'crashbridge:';
const getTab = async tabId => {
  try { return await chrome.tabs.get(tabId); }
  catch (error) {
    if (/No tab with id|Invalid tab ID/i.test(error.message)) return null;
    throw error;
  }
};
const browser = {
  open: async url => (await chrome.tabs.create({ url, active: false })).id,
  close: async tabId => { await chrome.tabs.remove(tabId); }, getTab,
  extensionUrl: path => chrome.runtime.getURL(path), uuid: () => crypto.randomUUID(),
};
const controller = createController({
  ...browser,
  read: async () => (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] ?? null,
  write: async state => { await chrome.storage.local.set({ [STORAGE_KEY]: state }); },
  alarm: async (name, when) => { await chrome.alarms.create(ALARM_PREFIX + name, { when }); },
  clearAlarm: async name => { await chrome.alarms.clear(ALARM_PREFIX + name); },
  now: () => new Date().toISOString(),
});
const resolver = createResolver({
  ...browser,
  readSession: async () => (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] ?? null,
  writeSession: async state => { await chrome.storage.session.set({ [SESSION_KEY]: state }); },
  alarm: async (name, when) => { await chrome.alarms.create(`${ALARM_PREFIX}resolve:${name}`, { when }); },
  clearAlarm: async name => { await chrome.alarms.clear(`${ALARM_PREFIX}resolve:${name}`); },
  send: (tabId, message) => chrome.tabs.sendMessage(tabId, message, { frameId: 0 }),
  now: () => Date.now(),
}, controller);
const ready = controller.recover().then(() => resolver.recover());
let dispatchTail = ready;
const serialize = operation => {
  const result = dispatchTail.then(operation);
  dispatchTail = result.catch(() => {});
  return result;
};
const resolverTypes = ['RESOLVE_SELECTION', 'GET_RESOLUTION', 'CANCEL_RESOLUTION', 'RESOLVER_READY'];
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  serialize(async () => {
    if (resolverTypes.includes(message?.type)) return resolver.handle(message, sender);
    if (message?.type === 'OPEN_MANAGER') {
      if (message.namespace !== 'crashbridge' || message.version !== 1 || sender.id !== new URL(browser.extensionUrl('manager.html')).host || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !listUrl(sender.url) || Object.keys(message.payload ?? {}).length) throw new Error('Invalid manager opener source.');
      await chrome.tabs.create({ url: browser.extensionUrl('manager.html') });
      return { ok: true, data: {} };
    }
    if (['START_CAPTURE', 'RETRY_FAILED'].includes(message?.type) && resolver.busy()) throw new Error('Resolution is active; cancel it from the source list first.');
    return controller.handle(message, sender);
  }).then(sendResponse, () => sendResponse({ ok: false, error: { code: 'unsupported', message: 'Operation unavailable or conflicts with active resolution; refresh Firebase or cancel resolution first.' } }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  void serialize(() => alarm.name.startsWith(`${ALARM_PREFIX}resolve:`)
    ? resolver.timeout(alarm.name.slice(`${ALARM_PREFIX}resolve:`.length))
    : controller.handle({ namespace: 'crashbridge', version: 1, type: 'TIMEOUT', payload: { jobId: alarm.name.slice(ALARM_PREFIX.length) } }));
});
chrome.tabs.onRemoved.addListener(tabId => {
  void serialize(async () => {
    await resolver.closed(tabId);
    await controller.handle({ namespace: 'crashbridge', version: 1, type: 'TAB_CLOSED', payload: { tabId } });
  });
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) void serialize(() => resolver.updated(tabId, change.url));
});
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: browser.extensionUrl('manager.html') }); });
