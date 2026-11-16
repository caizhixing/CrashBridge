import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as serializers from '../../src/domain/export.js';
import { createQueueItem } from '../../src/domain/model.js';
import { issue, capture, succeeded, at } from '../domain/fixtures.js';
import { DEFAULT_OPTIONS, controlsFor, summarize, itemPresentation, managementMessage, createExportSnapshot, setText, safeSourceUrl, errorText, COMPATIBILITY_WARNING, PRIVACY_WARNING } from '../../extension/ui-model.js';

const state = items => ({ schemaVersion: 1, items, active: null, running: false, lastError: null });

test('empty and multi-status counts, active jobs lock conflicting actions even when running flag is false', () => {
  assert.deepEqual(summarize([]), { total: 0, finished: 0, pending: 0, collecting: 0, succeeded: 0, failed: 0, cancelled: 0 });
  assert.deepEqual(summarize(['pending','collecting','succeeded','failed','cancelled','pending'].map(status => ({ status }))), { total: 6, finished: 3, pending: 2, collecting: 1, succeeded: 1, failed: 1, cancelled: 1 });
  assert.deepEqual(controlsFor(null), { start: false, retry: false, cancel: false, remove: false, clear: false, export: false, fields: false });
  assert.equal(controlsFor(state([])).export, false);
  const mixed = state(['pending','failed','succeeded'].map(status => ({ status })));
  assert.deepEqual(controlsFor(mixed), { start: true, retry: true, cancel: false, remove: true, clear: true, export: true, fields: true });
  for (const active of [{ ...mixed, running: true }, { ...mixed, active: { jobId: 'synthetic' } }]) {
    assert.deepEqual(controlsFor(active), { start: false, retry: false, cancel: true, remove: false, clear: false, export: false, fields: false });
    assert.equal(controlsFor(active, true).cancel, false);
  }
  assert.equal(controlsFor(state([{ status: 'succeeded' }])).start, false);
  assert.equal(controlsFor(state([{ status: 'cancelled' }])).start, true);
  assert.equal(controlsFor(mixed, true).export, false);
});

test('all management messages match frozen payloads and reject unsupported operations', () => {
  for (const type of ['GET_STATE','CLEAR_QUEUE','START_CAPTURE','RETRY_FAILED','CANCEL_CAPTURE']) assert.deepEqual(managementMessage(type), { namespace: 'crashbridge', version: 1, type, payload: {} });
  assert.deepEqual(managementMessage('REMOVE_ISSUE', 'synthetic-key'), { namespace: 'crashbridge', version: 1, type: 'REMOVE_ISSUE', payload: { key: 'synthetic-key' } });
  assert.throws(() => managementMessage('REMOVE_ISSUE'), /缺少/);
  assert.throws(() => managementMessage('TIMEOUT'), /不支持/);
});

test('Chinese statuses, failure reasons and completeness warnings never claim full/latest capture', () => {
  const expected = { pending: '待采集', collecting: '采集中', succeeded: '已取得', failed: '失败', cancelled: '已取消 / 中断' };
  for (const [status, label] of Object.entries(expected)) assert.equal(itemPresentation({ issue: issue({ title: null }), status, capture: null, error: null }).status, label);
  assert.equal(itemPresentation({ issue: issue({ title: null }), status: 'pending', capture: null, error: null }).title, issue().issueId);
  for (const completeness of ['partial', 'unknown']) {
    const view = itemPresentation(succeeded({ capture: capture({ completeness, warnings: ['synthetic-warning'] }) }));
    assert.match(view.warnings[0], completeness === 'partial' ? /不完整/ : /完整性未知/);
    assert.ok(view.warnings.includes('synthetic-warning'));
    assert.ok(view.warnings.some(text => text.includes('不保证是最新')));
  }
  for (const [code, word] of Object.entries({ unsupported: '不受支持', 'login-required': '登录', timeout: '超时', 'tab-closed': '关闭', 'missing-stack': '未取得堆栈', cancelled: '中断', 'storage-failed': '尚未持久化', 'download-failed': '清单与预览已保留' })) assert.match(errorText({ code, message: 'synthetic reason' }), new RegExp(word));
  assert.equal(errorText(null), '');
  assert.match(errorText({ code: 'new-code', message: 'synthetic reason' }), /操作失败.*synthetic reason/);
  assert.match(COMPATIBILITY_WARNING, /兼容性未验证/);
  assert.match(PRIVACY_WARNING, /不保证覆盖全部敏感信息/);
});

test('actual domain filtering drives the exact preview and both downloadable strings without mutating stored capture', () => {
  assert.deepEqual(DEFAULT_OPTIONS, { stacktrace: true, version: true, device: false, statistics: false });
  const items = [succeeded(), { ...createQueueItem(issue()), status: 'failed', error: { code: 'timeout', message: 'synthetic-timeout' } }];
  const original = structuredClone(items);
  const snapshot = createExportSnapshot(items, DEFAULT_OPTIONS, at, serializers);
  assert.deepEqual(JSON.parse(snapshot.json), snapshot.bundle);
  assert.equal(snapshot.markdown, serializers.toMarkdown(snapshot.bundle));
  for (const hidden of ['os-hidden', 'device-hidden', 'events-hidden', 'users-hidden']) {
    assert.ok(!snapshot.json.includes(hidden));
    assert.ok(!snapshot.markdown.includes(hidden));
  }
  assert.match(snapshot.json, /version-visible/);
  assert.match(snapshot.json, /SyntheticError/);
  assert.match(snapshot.markdown, /synthetic\\-timeout/);
  for (const mask of Array.from({ length: 16 }, (_, index) => index)) {
    const opts = Object.fromEntries(Object.keys(DEFAULT_OPTIONS).map((field, index) => [field, Boolean(mask & (1 << index))]));
    const filtered = createExportSnapshot(items, opts, at, serializers);
    const exported = filtered.bundle.issues[0].capture;
    for (const [option, fields] of Object.entries({ stacktrace: ['stacktrace'], version: ['appVersion', 'versionCode'], device: ['osVersion','deviceModel'], statistics: ['statistics'] })) for (const field of fields) assert.equal(Object.hasOwn(exported, field), opts[option]);
    if (!opts.stacktrace) { assert.ok(!filtered.json.includes('SyntheticError')); assert.ok(!filtered.markdown.includes('SyntheticError')); }
    if (!opts.version) { assert.ok(!filtered.json.includes('version-visible')); assert.ok(!filtered.markdown.includes('version-visible')); }
    if (!opts.device) { assert.ok(!filtered.json.includes('device-hidden')); assert.ok(!filtered.markdown.includes('device-hidden')); }
    if (!opts.statistics) { assert.ok(!filtered.json.includes('events-hidden')); assert.ok(!filtered.markdown.includes('events-hidden')); }
    assert.equal(filtered.bundle.issues[1].error.code, 'timeout');
    assert.deepEqual(exported.warnings, items[0].capture.warnings);
    assert.equal(exported.completeness, 'unknown');
  }
  assert.deepEqual(items, original);
});

test('hostile log text is assigned as text only, source links stay on a validated Firebase route', async () => {
  const hostile = '<img src=x onerror=alert(1)><script>bad()</script> ```';
  const target = { textContent: '', set innerHTML(_value) { assert.fail('must not interpret logs as HTML'); } };
  setText(target, hostile);
  assert.equal(target.textContent, hostile);
  const exported = createExportSnapshot([succeeded({ capture: capture({ stacktrace: hostile }) })], DEFAULT_OPTIONS, at, serializers);
  assert.equal(JSON.parse(exported.json).issues[0].capture.stacktrace, hostile);
  assert.match(exported.markdown, /````text/);
  assert.equal(safeSourceUrl(issue().url), issue().url);
  assert.equal(safeSourceUrl(issue().url.replace('android:', 'android%3A')), issue().url.replace('android:', 'android%3A'));
  for (const url of ['javascript:alert(1)', 'https://evil.invalid/', 'https://console.firebase.google.com/anything', 'https://user@console.firebase.google.com/project/demo/crashlytics/app/android:x/issues/y', 'https://console.firebase.google.com/project/demo/crashlytics/app/%ZZ/issues/y']) assert.equal(safeSourceUrl(url), null);
  assert.equal(safeSourceUrl(`${issue().url}?token=synthetic&eventId=e#x`), `${issue().url}?eventId=e`);
  const manager = await readFile(new URL('../../extension/manager.js', import.meta.url), 'utf8');
  assert.doesNotMatch(manager, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(/);
  assert.match(manager, /replaceChildren/);
  assert.match(manager, /createExportSnapshot\(state.items, options/);
});
