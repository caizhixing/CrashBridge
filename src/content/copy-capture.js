// Runs in the page's main world (injected by the content script via a <script src>).
// Firebase's "Copy stack trace" control builds a temporary <textarea> holding the full
// raw thread dump, calls select(), then execCommand('copy'). Intercepting select()
// exposes that text through the shared DOM without touching the clipboard.
(() => {
  if (globalThis.__crashbridgeCopyCapture) return;
  globalThis.__crashbridgeCopyCapture = true;
  const isStack = value => typeof value === 'string' && value.length > 100 && /\bat\s+[\w.$<>]+\([^)\n]*\.(?:java|kt)(?::\d+)?\)/.test(value);
  const capture = function (value) {
    if (!isStack(value)) return;
    let host = document.getElementById('crashbridge-stack-capture');
    if (!host) {
      host = document.createElement('script');
      host.id = 'crashbridge-stack-capture';
      host.type = 'application/json';
      (document.head ?? document.documentElement).append(host);
    }
    host.textContent = JSON.stringify(value);
    document.documentElement.setAttribute('data-crashbridge-stack', 'ready');
  };
  const originalTextarea = HTMLTextAreaElement.prototype.select;
  HTMLTextAreaElement.prototype.select = function () {
    capture(this.value);
    return originalTextarea.apply(this, arguments);
  };
  const originalInput = HTMLInputElement.prototype.select;
  HTMLInputElement.prototype.select = function () {
    capture(this.value);
    return originalInput.apply(this, arguments);
  };
  document.documentElement.setAttribute('data-crashbridge-stack-armed', '1');
})();
