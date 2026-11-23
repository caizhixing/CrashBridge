import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

test('MV3 requests exactly frozen permissions and Firebase-only injection/resources', async () => {
  const manifest = JSON.parse(await read('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'alarms', 'downloads']);
  assert.deepEqual(manifest.host_permissions, ['https://console.firebase.google.com/*']);
  assert.deepEqual(manifest.background, { service_worker: 'src/background/service-worker.js', type: 'module' });
  assert.equal(Object.hasOwn(manifest.action, 'default_popup'), false);
  assert.deepEqual(manifest.content_scripts, [{ matches: ['https://console.firebase.google.com/*'], js: ['src/content/main.js'], run_at: 'document_idle' }]);
  assert.deepEqual(manifest.icons, { '16': 'icon-16.png', '32': 'icon-32.png', '48': 'icon-48.png', '128': 'icon-128.png' });
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['src/content/app.js', 'src/content/copy-capture.js', 'src/content/i18n.js', 'src/adapter/firebase.js', 'src/adapter/selection.js', 'src/domain/model.js'], matches: ['https://console.firebase.google.com/*'] }]);
  assert.doesNotMatch(JSON.stringify(manifest), /cookies|debugger|webRequest|<all_urls>|https?:\/\/(?!console\.firebase\.google\.com)/);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'none'; base-uri 'none'");
});

test('management page has only packaged scripts, Chinese semantics, warning/cleanup and disabled initial controls', async () => {
  const html = await read('extension/manager.html');
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<script type="module" src="manager.js"><\/script>/);
  assert.doesNotMatch(html, /<script[^>]*src=["']https?:|\sonclick=|javascript:|<iframe/i);
  for (const path of ['extension/manager.js', 'extension/manager.css', 'extension/ui-model.js', 'extension/downloads.js']) assert.ok((await read(path)).length > 0);
  for (const id of ['operation-error','compatibility','privacy','preview','clear','start','retry','cancel','download-json','download-markdown']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="clear"[^>]*disabled/);
  assert.match(html, /已下载文件需自行删除/);
  const manager = await read('extension/manager.js');
  assert.match(manager, /from '\.\/src\/domain\/export.js'/);
  assert.match(manager, /window.confirm/);
  assert.doesNotMatch(manager, /fetch\(|XMLHttpRequest|console\.log|chrome\.storage\.local\.clear|chrome\.storage\.local\.remove/);
  const storageWrites = manager.match(/chrome\.storage\.local\.set/g) ?? [];
  assert.equal(storageWrites.length, 1, 'manager writes storage exactly once (language preference only)');
  assert.match(manager, /writeLanguage\(values => chrome\.storage\.local\.set\(values\)/);
});
