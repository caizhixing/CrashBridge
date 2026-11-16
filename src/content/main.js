// MV3 content scripts are classic scripts; keep imports inside the extension origin.
void import(chrome.runtime.getURL('src/content/app.js')).then(module => module.mountContent()).catch(() => {
  console.error('CrashBridge could not load. Reload the extension and Firebase page.');
});
