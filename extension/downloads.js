export const DOWNLOAD_FAILURE = 'download-failed：下载失败或被拒绝。清单与预览已保留，请允许下载后重试。';

/** Browser boundary injected for deterministic lifecycle tests; no queue/storage access.
 * @param {{downloads:{download:Function,search:Function,onChanged:{addListener:Function,removeListener:Function}},createObjectURL:Function,revokeObjectURL:Function}} platform */
export function createDownloader(platform) {
  let active = false;
  return {
    get active() { return active; },
    /** @param {'json'|'markdown'} format @param {{json:string,markdown:string}} snapshot
     * @param {(status:string)=>void} onStatus */
    async download(format, snapshot, onStatus) {
      if (active) throw new Error('已有下载正在进行，请等待完成。');
      if (!['json', 'markdown'].includes(format)) throw new Error('不支持的下载格式');
      active = true;
      let objectUrl;
      let listener;
      try {
        const isJson = format === 'json';
        const blob = new Blob([isJson ? snapshot.json : snapshot.markdown], { type: isJson ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' });
        objectUrl = platform.createObjectURL(blob);
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const issues = snapshot.bundle?.issues ?? [];
        const identity = issues.length === 1 ? (issues[0]?.issue?.issueId ?? 'unknown') : `${issues.length}issues`;
        const filename = `${stamp}_${identity}.${isJson ? 'json' : 'md'}`;
        onStatus('等待浏览器下载完成；开始请求不代表已保存。');
        await new Promise((resolve, reject) => {
          let id = null;
          // Buffer only terminal events received before download() returns its ID.
          const early = new Map();
          const settle = state => {
            if (state === 'complete') resolve();
            if (state === 'interrupted') reject(new Error(DOWNLOAD_FAILURE));
          };
          listener = delta => {
            if (!['complete', 'interrupted'].includes(delta.state?.current)) return;
            if (id === null) early.set(delta.id, delta.state.current);
            else if (delta.id === id) settle(delta.state.current);
          };
          platform.downloads.onChanged.addListener(listener);
          Promise.resolve().then(() => platform.downloads.download({ url: objectUrl, filename, saveAs: true, conflictAction: 'uniquify' })).then(async downloadId => {
            if (!Number.isInteger(downloadId) || downloadId < 0) throw new Error(DOWNLOAD_FAILURE);
            id = downloadId;
            if (early.has(id)) settle(early.get(id));
            early.clear();
            // Reconcile permission/user cancellation or fast completion across the async ID boundary.
            const entries = await platform.downloads.search({ id });
            if (!entries.length) throw new Error(DOWNLOAD_FAILURE);
            // Success is reported exclusively from onChanged complete, not an accepted request.
            if (entries[0].state === 'interrupted') settle('interrupted');
          }).catch(() => reject(new Error(DOWNLOAD_FAILURE)));
        });
        onStatus('下载完成：浏览器已确认保存。下载文件仍需人工检查后再分享。');
      } catch {
        onStatus(DOWNLOAD_FAILURE);
        throw new Error(DOWNLOAD_FAILURE);
      } finally {
        if (listener) platform.downloads.onChanged.removeListener(listener);
        if (objectUrl) platform.revokeObjectURL(objectUrl);
        active = false;
      }
    }
  };
}
