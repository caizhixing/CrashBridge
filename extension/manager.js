import * as serializers from './src/domain/export.js';
import { DEFAULT_OPTIONS, COMPATIBILITY_WARNING, PRIVACY_WARNING, controlsFor, summarize, itemPresentation, managementMessage, createExportSnapshot, setText, safeSourceUrl, errorText } from './ui-model.js';
import { createDownloader } from './downloads.js';
import { createStateSync } from './state-sync.js';
import { LANGUAGES, DEFAULT_LANGUAGE, mt, readLanguage, writeLanguage, statusText, errorTextFor, confirmClearText } from './src/content/i18n.js';

const byId = id => document.getElementById(id);
const downloader = createDownloader({ downloads: chrome.downloads, createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: url => URL.revokeObjectURL(url) });
let state = null;
let busy = false;
let snapshot = null;
let refreshQueued = false;
let requestVersion = 0;
const options = { ...DEFAULT_OPTIONS };

let currentLanguage = DEFAULT_LANGUAGE;
function applyLanguage(language) {
  if (!LANGUAGES.includes(language)) return;
  currentLanguage = language;
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  document.title = mt(language, 'title');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = mt(language, element.getAttribute('data-i18n'));
  for (const element of document.querySelectorAll('[data-i18n-aria]')) element.setAttribute('aria-label', mt(language, element.getAttribute('data-i18n-aria')));
}
const languageSelect = byId('language-select');
languageSelect.addEventListener('change', async () => {
  applyLanguage(languageSelect.value);
  try { await writeLanguage(values => chrome.storage.local.set(values), languageSelect.value); } catch { /* preference stays session-local */ }
});
const languageStorage = globalThis.chrome?.storage?.local;
if (languageStorage) void readLanguage(keys => languageStorage.get(keys)).then(language => { languageSelect.value = language; applyLanguage(language); }).catch(() => {});

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
  const busyText = { zh: '采集中', en: 'Capturing', fr: 'Capture', es: 'Capturando', pt: 'Capturando' }[currentLanguage] ?? '采集中';
  const idleText = { zh: '当前未采集', en: 'Not capturing', fr: 'Aucune capture', es: 'Sin captura', pt: 'Sem captura' }[currentLanguage] ?? '当前未采集';
  const processedText = { zh: '已处理', en: 'processed', fr: 'traités', es: 'procesados', pt: 'processados' }[currentLanguage] ?? '已处理';
  const capturingText = { zh: '采集中', en: 'capturing', fr: 'en cours', es: 'capturando', pt: 'capturando' }[currentLanguage] ?? '采集中';
  setText(byId('progress-label'), `${active ? busyText : idleText} · ${processedText} ${counts.finished} / ${counts.total} · ${capturingText} ${counts.collecting}`);
  byId('progress').max = Math.max(1, counts.total);
  byId('progress').value = counts.finished;
  byId('empty').hidden = !state || items.length > 0;
  const list = document.createDocumentFragment();
  for (const item of items) {
    const presentation = itemPresentation(item, currentLanguage);
    const row = document.createElement('li');
    row.className = `issue-row status-${item.status}`;
    const heading = textElement('div', '', 'issue-heading');
    heading.append(textElement('h3', presentation.title), textElement('span', statusText(currentLanguage, item.status), `status-pill ${item.status}`));
    row.append(heading, textElement('p', `${item.issue.projectId} / ${item.issue.appId}`, 'issue-meta'), textElement('p', `Issue: ${item.issue.issueId}`, 'issue-meta'));
    if (presentation.error) row.append(textElement('p', presentation.error, 'item-error'));
    for (const warning of presentation.warnings) row.append(textElement('p', warning, 'item-warning'));
    const actions = textElement('div', '', 'issue-actions');
    const sourceUrl = safeSourceUrl(item.issue.url);
    if (sourceUrl) {
      const linkText = { zh: '打开来源页 ↗', en: 'Open source ↗', fr: 'Ouvrir la source ↗', es: 'Abrir origen ↗', pt: 'Abrir origem ↗' }[currentLanguage] ?? '打开来源页 ↗';
      const link = textElement('a', linkText);
      link.href = sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      actions.append(link);
    }
    const removeText = { zh: '删除此项', en: 'Remove', fr: 'Supprimer', es: 'Eliminar', pt: 'Remover' }[currentLanguage] ?? '删除此项';
    const remove = textElement('button', removeText, 'text-button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${removeText} ${presentation.title}`);
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
  if (!response.ok) throw new Error(errorTextFor(currentLanguage, response.error?.code, response.error?.message));
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
    showError(errorTextFor(currentLanguage, state.lastError?.code, state.lastError?.message));
    if (changed) render();
  } catch (error) {
    const refreshFailed = { zh: '读取本地清单失败，请刷新重试。', en: 'Failed to read local state; refresh and retry.', fr: 'Échec de lecture; actualisez et réessayez.', es: 'Fallo al leer; actualice y reintente.', pt: 'Falha ao ler; atualize e tente novamente.' }[currentLanguage] ?? 'Failed to read local state; refresh and retry.';
    if (version === requestVersion) showError(error.message || refreshFailed);
  }
}

async function drainRefresh() {
  if (refreshQueued) {
    refreshQueued = false;
    const version = requestVersion;
    await stateSync.request();
    // A superseded read can still occupy stateSync's single request slot.
    if (version === requestVersion && !busy && !downloader.active) await stateSync.request();
  }
}

async function mutate(type, key) {
  const map = { START_CAPTURE: 'start', RETRY_FAILED: 'retry', CANCEL_CAPTURE: 'cancel', CLEAR_QUEUE: 'clear', REMOVE_ISSUE: 'remove' };
  if (!controlsFor(state, busy || downloader.active)[map[type]]) return;
  if (type === 'CLEAR_QUEUE' && !window.confirm(confirmClearText(currentLanguage))) return;
  ++requestVersion;
  busy = true;
  updateControls();
  try {
    state = await send(type, key);
    showError(errorTextFor(currentLanguage, state.lastError?.code, state.lastError?.message));
    render();
  } catch (error) { showError(error.message || 'Operation failed; the list was not deleted. Refresh to check.'); }
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
  // Any GET_STATE begun before this click must not replace the exported preview.
  ++requestVersion;
  refreshQueued = true;
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
