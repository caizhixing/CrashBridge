import { discoverIssues, extractCapture, parseIssueUrl } from '../adapter/firebase.js';
import { issueKey, LIMITS } from '../domain/model.js';
import { readList, listUrl, matchRow, RESOLVE_HASH } from '../adapter/selection.js';

const JOB = /^#crashbridge-job=([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

/** @param {string} url @returns {{jobId:string,issue:object}|null} */
export function parseCaptureJob(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const match = JOB.exec(parsed.hash);
  const issue = parseIssueUrl(url);
  return match && issue ? { jobId: match[1], issue } : null;
}

/** Browser boundaries are injectable; parsing/extraction always use the real adapter. @param {object} [environment] */
export function mountContent(environment = {}) {
  const document = environment.document ?? globalThis.document;
  const window = environment.window ?? globalThis.window;
  const runtime = environment.runtime ?? globalThis.chrome.runtime;
  const Observer = environment.MutationObserver ?? globalThis.MutationObserver;
  const now = environment.now ?? (() => new Date().toISOString());
  const setTimer = environment.setTimeout ?? globalThis.setTimeout;
  const clearTimer = environment.clearTimeout ?? globalThis.clearTimeout;
  // A second classic-script injection must not install another observer or controls.
  const existing = document.querySelector('[data-crashbridge-root]');
  if (existing) return { dispose() {} };
  const host = document.createElement('aside');
  host.setAttribute('data-crashbridge-root', 'v1');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;display:block!important;width:320px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#162235;color:#fff;border:2px solid #65c4ff;border-radius:12px;padding:16px;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0008}:host([hidden]){display:none!important}button{font:inherit;padding:8px;margin:4px;border:1px solid #8ad1ff;border-radius:6px;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}p{margin:8px 0;overflow-wrap:anywhere}strong{font-size:18px}';
  const count = document.createElement('p');
  const manager = document.createElement('button'); manager.type = 'button'; manager.textContent = '打开管理页';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消解析'; cancel.hidden = true;
  const heading = document.createElement('strong');
  heading.textContent = 'CrashBridge';
  const notice = document.createElement('p');
  notice.textContent = '真实 Firebase 控制台兼容性未验证；仅采集当前已渲染事件。';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = '将勾选问题加入清单';
  shadow.append(style, heading, notice, count, add, manager, cancel, status);
  (document.body ?? document.documentElement).append(host);

  /** @type {Map<Element,{host:Element,input:HTMLInputElement,issue:object}>} */
  const controls = new Map();
  let busy = false;
  let pollTimer = null;
  let readySent = false;
  const resolveToken = RESOLVE_HASH.exec(new URL(window.location.href).hash)?.[1] ?? null;
  const completed = new Set();
  const initialJob = parseCaptureJob(window.location.href);
  const binding = value => value ? JSON.stringify([value.jobId, issueKey(value.issue), value.issue.url]) : null;
  const initialBinding = binding(initialJob);
  let navigationInvalidated = false;
  let disposed = false;
  let scheduled = false;
  let job = null;
  let timer = null;
  let pendingError = null;

  /** @param {object|null} capture @param {{code:string,message:string}|null} error */
  async function submit(capture, error) {
    if (!job || completed.has(job.jobId) || disposed) return;
    const current = job;
    completed.add(current.jobId);
    if (timer !== null) clearTimer(timer);
    timer = null;
    status.textContent = error ? `采集失败：${error.code}` : '正在保存采集结果…';
    try {
      const reply = await runtime.sendMessage({ namespace: 'crashbridge', version: 1, type: 'CAPTURE_RESULT', payload: { jobId: current.jobId, issueKey: issueKey(current.issue), capture, error } });
      if (!disposed && job?.jobId === current.jobId) status.textContent = reply?.ok ? (error ? `采集失败：${error.code}` : '采集结果已保存。') : `采集结果未保存：${reply?.error?.code ?? 'unsupported'}`;
    } catch {
      if (!disposed && job?.jobId === current.jobId) status.textContent = '采集结果未发送，请在管理页查看失败状态并重试。';
    }
  }

  function syncJob() {
    const next = parseCaptureJob(window.location.href);
    // A URL change cannot establish ownership of a retained SPA stack. Only a new
    // document may bind a new job/issue/event; invalidation is sticky even on return.
    if (binding(next) !== initialBinding) navigationInvalidated = true;
    if (binding(next) !== binding(job)) {
      if (timer !== null) clearTimer(timer);
      timer = null;
      job = next;
      pendingError = null;
      if (job && !completed.has(job.jobId)) {
        const id = job.jobId;
        timer = setTimer(() => {
          if (job?.jobId === id) void submit(null, pendingError ?? { code: 'timeout', message: 'The rendered detail page did not become available within 60 seconds.' });
        }, LIMITS.timeoutMs);
      }
    }
    if (!job) return;
    if (navigationInvalidated) {
      status.textContent = '采集失败：unsupported（同一页面内采集身份已改变，请在新标签页重试）';
      void submit(null, { code: 'unsupported', message: 'Capture identity changed within this document; retry in a new capture tab.' });
      return;
    }
    if (completed.has(job.jobId)) return;
    if (document.readyState !== 'complete') {
      status.textContent = '等待页面加载完成（最多 60 秒）';
      return;
    }
    try { void submit(extractCapture(document, job.issue, now()), null); }
    catch (error) {
      pendingError = { code: ['login-required', 'missing-stack', 'unsupported'].includes(error.code) ? error.code : 'unsupported', message: error.message };
      status.textContent = `等待详情 DOM：${pendingError.code}（最多 60 秒）`;
      if (pendingError.code === 'login-required') void submit(null, pendingError);
    }
  }

  function reconcile() {
    if (disposed) return;
    syncJob();
    if (resolveToken) {
      host.hidden = true;
      if (!readySent && document.readyState === 'complete') {
        try {
          const rows = readList(document, window.location.href);
          if (rows.length) { readySent = true; void runtime.sendMessage({ namespace: 'crashbridge', version: 1, type: 'RESOLVER_READY', payload: { token: resolveToken } }).catch(() => {}); }
        } catch { /* The background deadline reports unsupported/timeout to the original page. */ }
      }
      return;
    }
    const issues = discoverIssues(document, window.location.href);
    const byKey = new Map(issues.map(issue => [issueKey(issue), issue]));
    const candidates = new Map();
    for (const anchor of document.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(anchor.getAttribute('href'), window.location.href).href; } catch { continue; }
      const parsed = parseIssueUrl(url);
      if (!parsed || !byKey.has(issueKey(parsed))) continue;
      // Keep Firebase links and rows intact; only add a sibling shadow host.
      const row = anchor.closest('tr, [role="row"], li');
      if (!row || !row.parentNode) continue;
      const key = issueKey(parsed);
      const entry = candidates.get(row) ?? new Map();
      entry.set(key, byKey.get(key));
      candidates.set(row, entry);
    }
    try {
      for (const entry of readList(document, window.location.href)) {
        const key = JSON.stringify(entry.descriptor);
        if (entry.descriptor.href === '#') candidates.set(entry.row, new Map([[key, { descriptor: entry.descriptor, key }]]));
      }
    } catch (error) { status.textContent = '列表结构不受支持，请刷新后重试。'; }
    for (const [row, control] of controls) {
      const candidate = candidates.get(row);
      if (!row.isConnected || candidate?.size !== 1 || !candidate.has(control.key)) {
        control.host.remove();
        row.removeAttribute('data-crashbridge-selection');
        controls.delete(row);
      }
    }
    for (const [row, candidate] of candidates) {
      if (candidate.size !== 1 || controls.has(row)) continue;
      const issue = [...candidate.values()][0];
      const marker = document.createElement('span');
      marker.setAttribute('data-crashbridge-control', 'v1');
      marker.addEventListener('click', event => event.stopPropagation());
      const root = marker.attachShadow({ mode: 'open' });
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('aria-label', '选择 CrashBridge 问题（独立于 Firebase）');
      input.addEventListener('change', updateCount);
      label.append(input, document.createTextNode(' CrashBridge'));
      root.append(label);
      row.setAttribute('data-crashbridge-selection', 'v1');
      // Append inside a cell for valid table structure; do not replace native children.
      (row.querySelector('[data-test-id="issue-caption-table-cell"]') ?? row.querySelector('td, [role="cell"]') ?? row).append(marker);
      controls.set(row, { host: marker, input, issue, key: issue.key ?? issueKey(issue) });
    }
    add.hidden = Boolean(job);
    updateCount();
  }

  function updateCount() {
    const selected = [...controls.values()].filter(control => control.input.checked).length;
    count.textContent = '已选 ' + selected + ' 条（CrashBridge 独立勾选）' + (selected ? '' : '；请先勾选 CrashBridge');
    add.disabled = busy || selected === 0;
    for (const control of controls.values()) control.input.disabled = busy;
    cancel.hidden = !busy;
  }
  const send = (type, payload = {}) => runtime.sendMessage({ namespace: 'crashbridge', version: 1, type, payload });
  async function pollResolution() {
    try {
      const response = await send('GET_RESOLUTION');
      if (!response?.ok) throw new Error('连接失效');
      const data = response.data;
      busy = data.running;
      const success = data.results.filter(entry => entry.status === 'succeeded');
      const added = success.reduce((sum, entry) => sum + (entry.added ?? 0), 0);
      const duplicates = success.reduce((sum, entry) => sum + (entry.duplicates ?? 0), 0);
      const failed = data.results.filter(entry => entry.status === 'failed');
      status.textContent = (busy ? '正在解析… ' : '解析结束：') + '新增 ' + added + ' / 重复 ' + duplicates + ' / 失败 ' + failed.length + '。' + (data.error?.message ?? failed.map(entry => '第' + (entry.index + 1) + '行：' + entry.error.code + ' ' + entry.error.message).join('；'));
      if (busy) pollTimer = setTimer(() => { pollTimer = null; void pollResolution(); }, 1000);
    } catch { busy = false; status.textContent = '扩展连接已失效，请重新加载扩展并刷新 Firebase 页面；未确认成功。'; }
    updateCount();
  }
  const onAdd = async () => {
    if (busy) return;
    const selected = [...controls.values()].filter(control => control.input.checked);
    if (!selected.length) { status.textContent = '请先勾选当前已加载的问题。'; return; }
    busy = true; updateCount();
    try {
      const direct = selected.filter(control => !control.issue.descriptor).map(control => control.issue);
      if (direct.length) {
        const response = await send('ADD_ISSUES', { issues: direct });
        if (!response?.ok) throw new Error(response?.error?.message ?? 'unsupported');
        status.textContent = '新增 ' + (response.added ?? direct.length) + ' / 重复 ' + (response.duplicates ?? 0) + '。';
      }
      const unresolved = selected.filter(control => control.issue.descriptor);
      if (unresolved.length) {
        const rows = readList(document, window.location.href);
        const response = await send('RESOLVE_SELECTION', { listUrl: listUrl(window.location.href), snapshot: rows.map(row => row.descriptor), selected: unresolved.map(control => rows.findIndex(row => row.row === [...controls].find(([, value]) => value === control)?.[0])) });
        if (!response?.ok) throw new Error(response?.error?.message ?? 'unsupported');
        await pollResolution();
        return;
      }
    } catch (error) { status.textContent = '加入失败：' + error.message + '。扩展连接失效时请重新加载扩展并刷新 Firebase。'; }
    finally { if (pollTimer === null) busy = false; if (!disposed) updateCount(); }
  };
  const onManager = async () => { try { const response = await send('OPEN_MANAGER'); if (!response?.ok) throw new Error(); } catch { status.textContent = '无法打开管理页，请重新加载扩展并刷新 Firebase。'; } };
  const onCancel = async () => { try { await send('CANCEL_RESOLUTION'); if (pollTimer !== null) clearTimer(pollTimer); pollTimer = null; await pollResolution(); } catch { status.textContent = '取消未确认，请刷新后检查。'; } };
  manager.addEventListener('click', onManager);
  cancel.addEventListener('click', onCancel);
  const instructionTimers = new Set();
  const onInstruction = (message, sender, reply) => {
    if (sender.id !== runtime.id || message?.namespace !== 'crashbridge' || message.version !== 1 || !['RESOLVE_ROW', 'CHECK_SELECTION'].includes(message.type)) return;
    let attempts = 0;
    const attempt = () => {
      try {
        if (disposed) throw new Error('Disposed content.');
        if (message.type === 'RESOLVE_ROW' && (!resolveToken || message.payload?.token !== resolveToken || RESOLVE_HASH.exec(new URL(window.location.href).hash)?.[1] !== resolveToken)) throw new Error('Unowned resolver document.');
        // Fresh SPA lists can render a prefix first. Wait at most 3 seconds for all
        // expected rows; equal-length edits/reorder/ambiguity fail immediately.
        if (message.type === 'RESOLVE_ROW' && attempts++ < 12 && readList(document, window.location.href).length < message.payload.snapshot.length) {
          const id = setTimer(() => { instructionTimers.delete(id); attempt(); }, 250);
          instructionTimers.add(id); return;
        }
        const anchor = matchRow(document, window.location.href, message.payload);
        reply({ ok: true });
        if (message.type === 'RESOLVE_ROW') queueMicrotask(() => anchor.click());
      } catch { reply({ ok: false }); }
    };
    attempt();
    return true;
  };
  runtime.onMessage?.addListener(onInstruction);
  add.addEventListener('click', onAdd);
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; reconcile(); });
  };
  const observer = new Observer(records => {
    // Shadow contents are not observed; ignore mutations made by our own hosts/markers.
    if (records.some(record => !host.contains(record.target) && !record.target.closest?.('[data-crashbridge-control]') && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType !== 1 || (!node.hasAttribute('data-crashbridge-root') && !node.hasAttribute('data-crashbridge-control')))))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'class', 'id', 'style', 'hidden', 'aria-hidden', 'aria-label', 'aria-labelledby', 'aria-busy', 'aria-expanded'] });
  document.addEventListener('readystatechange', schedule);
  window.addEventListener('load', schedule);
  window.addEventListener('hashchange', schedule);
  window.addEventListener('popstate', schedule);
  // pushState often has no event. Observe href through DOM mutations and this bounded navigation hook when available.
  window.navigation?.addEventListener('navigatesuccess', schedule);
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (timer !== null) clearTimer(timer);
    document.removeEventListener('readystatechange', schedule);
    window.removeEventListener('load', schedule);
    window.removeEventListener('hashchange', schedule);
    window.removeEventListener('popstate', schedule);
    window.navigation?.removeEventListener('navigatesuccess', schedule);
    window.removeEventListener('pagehide', dispose);
    add.removeEventListener('click', onAdd);
    manager.removeEventListener('click', onManager); cancel.removeEventListener('click', onCancel);
    runtime.onMessage?.removeListener(onInstruction);
    if (pollTimer !== null) clearTimer(pollTimer);
    for (const id of instructionTimers) clearTimer(id);
    for (const [row, control] of controls) { control.host.remove(); row.removeAttribute('data-crashbridge-selection'); }
    controls.clear();
    host.remove();
  }
  window.addEventListener('pagehide', dispose);
  reconcile();
  return { dispose };
}
