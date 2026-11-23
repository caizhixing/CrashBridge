import { createController } from './queue.js';
import { createResolver } from './resolver.js';
import { listUrl } from '../adapter/selection.js';
import { log, logCapture, remoteLog, toMarkdown } from './logger.js';

const flushLog = async () => {
  try {
    const blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: 'crashbridge-log.md', saveAs: false, conflictAction: 'overwrite' });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (error) { log('flush-log:error', { message: error?.message ?? 'unknown' }); }
};
log('service-worker:start');

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
    if (message?.type === 'GET_LOGS') {
      if (message.namespace !== 'crashbridge' || message.version !== 1 || sender.id !== chrome.runtime.id) return { ok: true, data: null };
      return { ok: true, data: toMarkdown() };
    }
    if (message?.type === 'LOG_EVENT') {
      if (message.namespace !== 'crashbridge' || message.version !== 1 || sender.id !== chrome.runtime.id || sender.frameId !== 0) return { ok: true, data: {} };
      remoteLog(String(message.payload?.event ?? 'unknown').slice(0, 200), message.payload?.details ?? null);
      return { ok: true, data: {} };
    }
    if (resolverTypes.includes(message?.type)) return resolver.handle(message, sender);
    if (message?.type === 'OPEN_MANAGER') {
      if (message.namespace !== 'crashbridge' || message.version !== 1 || sender.id !== new URL(browser.extensionUrl('manager.html')).host || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !listUrl(sender.url) || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload) || Object.keys(message.payload).length || new TextEncoder().encode(JSON.stringify(message)).length > 262144) throw new Error('Invalid manager opener source.');
      await chrome.tabs.create({ url: browser.extensionUrl('manager.html') });
      return { ok: true, data: {} };
    }
    if (['START_CAPTURE', 'RETRY_FAILED'].includes(message?.type) && resolver.busy()) throw new Error('Resolution is active; cancel it from the source list first.');
    const wasRunning = message?.type === 'START_CAPTURE' || message?.type === 'RETRY_FAILED' || message?.type === 'CAPTURE_RESULT';
    const result = await controller.handle(message, sender);
    if (wasRunning && !result?.data?.running) { log('capture:batch-ended', { ok: result?.ok === true }); void flushLog(); }
    return result;
  }).then(sendResponse, (error) => { log('message:error', { message: error?.message ?? 'unknown' }); sendResponse({ ok: false, error: { code: 'unsupported', message: 'Operation unavailable or conflicts with active resolution; refresh Firebase or cancel resolution first.' } }); });
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  void serialize(() => alarm.name.startsWith(`${ALARM_PREFIX}resolve:`)
    ? resolver.timeout(alarm.name.slice(`${ALARM_PREFIX}resolve:`.length))
    : controller.handle({ namespace: 'crashbridge', version: 1, type: 'TIMEOUT', payload: { jobId: alarm.name.slice(ALARM_PREFIX.length) } }).then(result => { log('alarm:timeout-fired', { ok: result?.ok === true }); void flushLog(); return result; }));
});
chrome.tabs.onRemoved.addListener(tabId => {
  void serialize(async () => {
    await resolver.closed(tabId);
    await controller.handle({ namespace: 'crashbridge', version: 1, type: 'TAB_CLOSED', payload: { tabId } });
  });
});
chrome.tabs.onActivated.addListener(info => {
  // Mark immediately rather than waiting behind an in-flight content handshake.
  void resolver.activated(info.tabId);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) void serialize(() => resolver.updated(tabId, change.url));
});
chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: browser.extensionUrl('manager.html') }); });
