export const DEFAULT_OPTIONS = Object.freeze({ stacktrace: true, version: true, device: false, statistics: false });
export const COMPATIBILITY_WARNING = '真实 Firebase 控制台兼容性未验证：仅通过合成样本测试，不代表已适配你的页面。';
export const PRIVACY_WARNING = '自动隐私清理不保证覆盖全部敏感信息。关闭字段只影响导出，不删除本地暂存；分享前请人工检查。';
const STATUS = Object.freeze({ pending: '待采集', collecting: '采集中', succeeded: '已取得', failed: '失败', cancelled: '已取消 / 中断' });
const ERRORS = Object.freeze({ unsupported: '页面布局或地址不受支持，请勿将其视为采集成功。', 'login-required': '登录已失效，请在 Firebase 手动登录后重试。', timeout: '采集超时（60 秒），请检查网络 / 代理后重试。', 'tab-closed': '采集标签页被关闭，可重试失败项。', 'missing-stack': '未取得堆栈，本项采集失败。', cancelled: '采集已取消或中断，开始采集可继续处理。', 'storage-failed': '本地保存失败：当前结果可能尚未持久化，请勿关闭管理页，先导出备份。', 'download-failed': '下载失败或被拒绝。清单与预览已保留，请允许下载后重试。' });

/** @param {{code:string,message:string}|null} error */
export function errorText(error) {
  if (!error) return '';
  return `${ERRORS[error.code] ?? '操作失败，请检查后重试。'}${error.message ? `（${error.message}）` : ''}`;
}

/** @param {{items:object[],running:boolean,active:object|null}|null} state @param {boolean} [busy] */
export function controlsFor(state, busy = false) {
  const items = state?.items ?? [];
  const active = Boolean(state?.running || state?.active);
  const locked = active || busy || !state;
  return {
    start: !locked && items.some(item => ['pending', 'cancelled'].includes(item.status)),
    retry: !locked && items.some(item => item.status === 'failed'),
    cancel: active && !busy,
    remove: !locked,
    clear: !locked && items.length > 0,
    export: !locked && items.length > 0,
    fields: !active && !busy && Boolean(state)
  };
}

/** @param {object[]} items */
export function summarize(items) {
  const counts = { pending: 0, collecting: 0, succeeded: 0, failed: 0, cancelled: 0 };
  for (const item of items) counts[item.status] += 1;
  return { ...counts, total: items.length, finished: counts.succeeded + counts.failed + counts.cancelled };
}

/** @param {object} item */
export function itemPresentation(item) {
  const warnings = [];
  if (item.capture) {
    warnings.push(item.capture.completeness === 'partial' ? '内容不完整：只取得部分可见内容。' : '完整性未知：不能保证包含全部事件、变体或线程。');
    warnings.push('仅当前展示的一个代表事件，不保证是最新事件。', ...(item.capture.warnings ?? []));
  }
  return { title: item.issue.title || item.issue.issueId, status: STATUS[item.status] ?? '未知状态', error: errorText(item.error), warnings };
}

/** @param {string} type @param {string} [key] */
export function managementMessage(type, key) {
  if (!['GET_STATE', 'REMOVE_ISSUE', 'CLEAR_QUEUE', 'START_CAPTURE', 'RETRY_FAILED', 'CANCEL_CAPTURE'].includes(type)) throw new Error('不支持的管理操作');
  if (type === 'REMOVE_ISSUE' && (typeof key !== 'string' || !key)) throw new Error('缺少问题标识');
  return { namespace: 'crashbridge', version: 1, type, payload: type === 'REMOVE_ISSUE' ? { key } : {} };
}

/** @param {object[]} items @param {typeof DEFAULT_OPTIONS} options @param {string} exportedAt
 * @param {{createBundle:Function,toMarkdown:Function}} serializers Frozen domain exports, provided by the manager. */
export function createExportSnapshot(items, options, exportedAt, { createBundle, toMarkdown }) {
  const bundle = createBundle(items, options, exportedAt);
  return { bundle, json: JSON.stringify(bundle, null, 2), markdown: toMarkdown(bundle) };
}

/** Logs are text only, including markup and instructions contained in stack traces.
 * @param {{textContent:string|null}} element @param {string} text */
export function setText(element, text) { element.textContent = text; }

/** @param {string} value */
export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://console.firebase.google.com' || url.username || url.password) return null;
    const match = /^\/project\/([^/]+)\/crashlytics\/app\/([^/]+)\/issues\/([^/]+)\/?$/.exec(url.pathname);
    if (!match || !/^android:[^\s/]+$/.test(decodeURIComponent(match[2]))) return null;
    url.hash = '';
    const eventId = url.searchParams.get('eventId');
    url.search = '';
    if (eventId !== null) url.searchParams.set('eventId', eventId);
    return url.href;
  } catch { return null; }
}
