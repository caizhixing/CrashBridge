import * as serializers from './src/domain/export.js';
import { DEFAULT_OPTIONS, COMPATIBILITY_WARNING, PRIVACY_WARNING, controlsFor, summarize, itemPresentation, managementMessage, createExportSnapshot, setText, safeSourceUrl, errorText } from './ui-model.js';
import { createDownloader } from './downloads.js';
import { createStateSync } from './state-sync.js';

const byId = id => document.getElementById(id);
const downloader = createDownloader({ downloads: chrome.downloads, createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: url => URL.revokeObjectURL(url) });
let state = null;
let busy = false;
let snapshot = null;
let refreshQueued = false;
let requestVersion = 0;
const options = { ...DEFAULT_OPTIONS };

setText(byId('compatibility'), COMPATIBILITY_WARNING);
setText(byId('privacy'), PRIVACY_WARNING);

function showError(message) {
  setText(byId('operation-error'), message);
  byId('operation-error').hidden = !message;
}

function updateControls() {
  const controls = controlsFor(state, busy || downloader.active);
  for (const id of ['start', 'retry', 'cancel', 'clear']) byId(id).disabled = !controls[id];
  byId('download-json').disabled = !controls.export || !snapshot;
  byId('download-markdown').disabled = !controls.export || !snapshot;
  byId('fields').disabled = !controls.fields;
  byId('refresh').disabled = busy || downloader.active;
  for (const button of byId('queue').querySelectorAll('button')) button.disabled = !controls.remove;
}

function renderPreview() {
  setText(byId('preview'), snapshot ? snapshot[byId('preview-format').value] : '加入问题后可查看导出预览。');
  setText(byId('snapshot-time'), snapshot ? `快照时间：${snapshot.bundle.exportedAt}` : '尚无预览');
}

function rebuildSnapshot() {
  snapshot = null;
  if (state?.items.length) {
    try { snapshot = createExportSnapshot(state.items, options, new Date().toISOString(), serializers); }
    catch { showError('无法生成导出预览：本地数据不符合 v1 格式。未导出、未覆盖原数据，请保留现场排查。'); }
  }
  renderPreview();
  updateControls();
}

function textElement(tag, text, className = '') {
  const element = document.createElement(tag);
  setText(element, text);
  element.className = className;
  return element;
}

function render() {
  const items = state?.items ?? [];
  const counts = summarize(items);
  setText(byId('count-total'), String(counts.total));
  setText(byId('count-succeeded'), String(counts.succeeded));
  setText(byId('count-pending'), String(counts.pending));
  setText(byId('count-problems'), String(counts.failed + counts.cancelled));
  const active = Boolean(state?.running || state?.active);
  setText(byId('progress-label'), `${active ? '采集中' : '当前未采集'} · 已处理 ${counts.finished} / ${counts.total} · 采集中 ${counts.collecting}`);
  byId('progress').max = Math.max(1, counts.total);
  byId('progress').value = counts.finished;
  byId('empty').hidden = !state || items.length > 0;
  const list = document.createDocumentFragment();
  for (const item of items) {
    const presentation = itemPresentation(item);
    const row = document.createElement('li');
    row.className = `issue-row status-${item.status}`;
    const heading = textElement('div', '', 'issue-heading');
    heading.append(textElement('h3', presentation.title), textElement('span', presentation.status, `status-pill ${item.status}`));
    row.append(heading, textElement('p', `${item.issue.projectId} / ${item.issue.appId}`, 'issue-meta'), textElement('p', `Issue：${item.issue.issueId}`, 'issue-meta'));
    if (presentation.error) row.append(textElement('p', presentation.error, 'item-error'));
    for (const warning of presentation.warnings) row.append(textElement('p', warning, 'item-warning'));
    const actions = textElement('div', '', 'issue-actions');
    const sourceUrl = safeSourceUrl(item.issue.url);
    if (sourceUrl) {
      const link = textElement('a', '打开来源页 ↗');
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      actions.append(link);
    }
    const remove = textElement('button', '删除此项', 'text-button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `删除 ${presentation.title}`);
    remove.addEventListener('click', () => mutate('REMOVE_ISSUE', item.key));
    actions.append(remove);
    row.append(actions);
    list.append(row);
  }
  byId('queue').replaceChildren(list);
  rebuildSnapshot();
}

async function send(type, key) {
  const response = await chrome.runtime.sendMessage(managementMessage(type, key));
  if (!response || typeof response.ok !== 'boolean') throw new Error('扩展后台未响应，请重新打开管理页。');
  if (!response.ok) throw new Error(errorText(response.error));
  const next = response.data;
  if (next?.schemaVersion !== 1 || !Array.isArray(next.items)) throw new Error('本地数据格式未知或不受支持。未覆盖原数据，请保留现场排查。');
  return next;
}

async function refresh() {
  if (busy || downloader.active) { refreshQueued = true; return; }
  const version = ++requestVersion;
  try {
    const next = await send('GET_STATE');
    if (version !== requestVersion) return;
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    state = next;
    showError(errorText(state.lastError));
    if (changed) render();
  } catch (error) {
    if (version === requestVersion) showError(error.message || '读取本地清单失败，请刷新重试。');
  }
}

async function drainRefresh() {
  if (refreshQueued) { refreshQueued = false; await stateSync.request(); }
}

async function mutate(type, key) {
  const map = { START_CAPTURE: 'start', RETRY_FAILED: 'retry', CANCEL_CAPTURE: 'cancel', CLEAR_QUEUE: 'clear', REMOVE_ISSUE: 'remove' };
  if (!controlsFor(state, busy || downloader.active)[map[type]]) return;
  if (type === 'CLEAR_QUEUE' && !window.confirm('清空全部本地清单与捕获内容？此操作不可撤销，不会删除已经下载的文件。')) return;
  ++requestVersion;
  busy = true;
  updateControls();
  try {
    state = await send(type, key);
    showError(errorText(state.lastError));
    render();
  } catch (error) { showError(error.message || '操作失败，清单未主动删除，请刷新检查。'); }
  finally { busy = false; updateControls(); await drainRefresh(); }
}

for (const [id, type] of Object.entries({ start: 'START_CAPTURE', retry: 'RETRY_FAILED', cancel: 'CANCEL_CAPTURE', clear: 'CLEAR_QUEUE' })) byId(id).addEventListener('click', () => mutate(type));
byId('refresh').addEventListener('click', () => stateSync.request());
for (const field of Object.keys(DEFAULT_OPTIONS)) byId(`field-${field}`).addEventListener('change', event => {
  options[field] = event.target.checked;
  rebuildSnapshot();
});
byId('preview-format').addEventListener('change', renderPreview);
for (const format of ['json', 'markdown']) byId(`download-${format}`).addEventListener('click', async () => {
  if (!snapshot || !controlsFor(state, busy || downloader.active).export) return;
  const downloading = downloader.download(format, snapshot, status => {
    setText(byId('download-status'), status);
    byId('download-status').classList.toggle('item-error', status.startsWith('download-failed'));
  });
  updateControls();
  try { await downloading; } catch { /* Failure is displayed by the downloader; retain snapshot and queue. */ }
  finally { updateControls(); await drainRefresh(); }
});
const stateSync = createStateSync({
  refresh,
  onError: () => showError('读取本地状态失败，最后一次清单与预览已保留，请刷新重试。'),
  isVisible: () => document.visibilityState !== 'hidden',
  isBusy: () => busy || downloader.active,
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: timer => window.clearInterval(timer)
});
const onStorage = (_changes, area) => {
  if (area !== 'local') return;
  if (busy || downloader.active) refreshQueued = true;
  else stateSync.request();
};
chrome.storage.onChanged.addListener(onStorage);
const onVisibility = () => { if (document.visibilityState !== 'hidden') stateSync.request(); };
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('pagehide', () => {
  stateSync.dispose();
  chrome.storage.onChanged.removeListener(onStorage);
  document.removeEventListener('visibilitychange', onVisibility);
}, { once: true });
stateSync.request();
