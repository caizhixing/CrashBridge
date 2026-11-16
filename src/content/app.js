import { discoverIssues, extractCapture, parseIssueUrl } from '../adapter/firebase.js';
import { issueKey, LIMITS } from '../domain/model.js';

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
  const heading = document.createElement('strong');
  heading.textContent = 'CrashBridge';
  const notice = document.createElement('p');
  notice.textContent = '真实 Firebase 控制台兼容性未验证；仅采集当前已渲染事件。';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = '将勾选问题加入清单';
  shadow.append(heading, notice, add, status);
  (document.body ?? document.documentElement).append(host);

  /** @type {Map<Element,{host:Element,input:HTMLInputElement,issue:object}>} */
  const controls = new Map();
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
    for (const [row, control] of controls) {
      const candidate = candidates.get(row);
      if (!row.isConnected || candidate?.size !== 1 || !candidate.has(issueKey(control.issue))) {
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
      input.setAttribute('aria-label', `选择 CrashBridge 问题 ${issue.issueId}`);
      label.append(input, document.createTextNode(' CrashBridge'));
      root.append(label);
      row.setAttribute('data-crashbridge-selection', 'v1');
      // Append inside a cell for valid table structure; do not replace native children.
      (row.querySelector('td, [role="cell"]') ?? row).append(marker);
      controls.set(row, { host: marker, input, issue });
    }
    add.hidden = Boolean(job);
    add.disabled = !controls.size;
  }

  const onAdd = async () => {
    const selected = new Map();
    for (const { input, issue } of controls.values()) if (input.checked) selected.set(issueKey(issue), issue);
    if (!selected.size) { status.textContent = '请先勾选当前已加载的问题。'; return; }
    add.disabled = true;
    try {
      const response = await runtime.sendMessage({ namespace: 'crashbridge', version: 1, type: 'ADD_ISSUES', payload: { issues: [...selected.values()] } });
      status.textContent = response?.ok ? '已加入本地清单；可跨分页继续添加，重复项由清单去重。' : `加入失败：${response?.error?.code ?? 'unsupported'}`;
    } catch { status.textContent = '加入失败：扩展连接不可用，请刷新后重试。'; }
    finally { if (!disposed) add.disabled = !controls.size; }
  };
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
    for (const [row, control] of controls) { control.host.remove(); row.removeAttribute('data-crashbridge-selection'); }
    controls.clear();
    host.remove();
  }
  window.addEventListener('pagehide', dispose);
  reconcile();
  return { dispose };
}
