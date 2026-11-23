import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { succeeded, capture } from '../domain/fixtures.js';

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.textContent = '';
    this.children = [];
    this.listeners = new Map();
    this.disabled = false;
    this.classList = { toggle() {} };
  }
  set innerHTML(_value) { assert.fail('Manager must never interpret log HTML'); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelectorAll(tag) { return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]); }
  fire(type) { return this.listeners.get(type)?.({ target: this }); }
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const makeState = stacktrace => ({ schemaVersion: 1, items: [succeeded({ capture: capture({ stacktrace }) })], running: false, active: null, lastError: null });

async function setup(t, { permissionDenied = false, initialState = makeState('SYNTHETIC_OLD_STACK') } = {}) {
  // Assemble the real packaged modules, without rewriting imports or replacing manager logic.
  const dir = await mkdtemp(join(tmpdir(), 'crashbridge-ui-test-'));
  await cp(new URL('../../extension/', import.meta.url), dir, { recursive: true });
  await mkdir(join(dir, 'src', 'content'), { recursive: true });
  await cp(new URL('../../src/content/i18n.js', import.meta.url), join(dir, 'src', 'content', 'i18n.js'));
  await cp(new URL('../../src/domain/', import.meta.url), join(dir, 'src/domain'), { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const ids = new Map();
  const document = new Element();
  document.visibilityState = 'visible';
  document.getElementById = id => { if (!ids.has(id)) ids.set(id, new Element()); return ids.get(id); };
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => new Element('fragment');
  document.getElementById('preview-format').value = 'json';
  const window = new Element();
  window.setInterval = () => 1;
  window.clearInterval = () => {};
  window.confirm = () => true;
  const changed = new Set();
  const storage = new Set();
  const read = deferred();
  const blobs = [];
  const revoked = [];
  const messages = [];
  let state = initialState;
  let reads = 0;
  const chrome = {
    runtime: { async sendMessage(message) {
      messages.push(message);
      assert.equal(message.type, 'GET_STATE');
      reads++;
      return reads === 2 ? read.promise : { ok: true, data: structuredClone(state) };
    } },
    storage: { onChanged: { addListener: listener => storage.add(listener), removeListener: listener => storage.delete(listener) } },
    downloads: {
      onChanged: { addListener: listener => changed.add(listener), removeListener: listener => changed.delete(listener) },
      async download() { if (permissionDenied) throw new Error('private download rejection'); return 7; },
      async search() { return [{ id: 7, state: 'in_progress' }]; }
    }
  };
  const globals = new Map(['window', 'document', 'chrome'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries({ window, document, chrome })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:synthetic'; };
  URL.revokeObjectURL = url => revoked.push(url);
  t.after(async () => {
    window.fire('pagehide');
    for (const [name, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('crashbridge-ui-test-'));
    await rm(dir, { recursive: true, force: true });
  });
  await import(pathToFileURL(join(dir, 'manager.js')).href);
  await nextTurn();
  return { ids, read, blobs, revoked, messages, setState(next) { state = next; }, complete(terminal) { for (const listener of changed) listener({ id: 7, state: { current: terminal } }); } };
}

for (const format of ['json', 'markdown']) for (const terminal of ['complete', 'interrupted']) test(`real manager freezes ${format} preview across in-flight GET_STATE until download ${terminal}`, async t => {
  const h = await setup(t);
  const get = id => h.ids.get(id);
  get('preview-format').value = format;
  get('preview-format').fire('change');
  const original = get('preview').textContent;
  assert.match(original, /SYNTHETIC_OLD_STACK/);
  const refreshing = get('refresh').fire('click');
  await nextTurn();
  assert.equal(h.messages.length, 2);
  const downloading = get(`download-${format}`).fire('click');
  await nextTurn();
  assert.equal(get('download-json').disabled, true);
  assert.equal(get('fields').disabled, true);
  assert.equal(await h.blobs[0].text(), original);
  const next = makeState('SYNTHETIC_NEW_STACK');
  h.setState(next);
  h.read.resolve({ ok: true, data: next });
  await refreshing;
  assert.equal(get('preview').textContent, original, 'in-flight GET_STATE must not replace the downloading snapshot');
  assert.equal(get('download-json').disabled, true);
  h.complete(terminal);
  await downloading;
  assert.match(get('download-status').textContent, terminal === 'complete' ? /下载完成/ : /download-failed/);
  assert.deepEqual(h.revoked, ['blob:synthetic']);
  assert.match(get('preview').textContent, /SYNTHETIC_NEW_STACK/, 'deferred state refresh resumes only after download terminal');
  assert.equal(get('download-json').disabled, false);
  assert.ok(h.messages.every(message => message.type === 'GET_STATE'), 'download does not mutate/delete queue');
});

test('real manager storage-failed guidance requires cancellation and cleanup without unlocking active export', async t => {
  const initialState = { ...makeState('SYNTHETIC_OLD_STACK'), active: { jobId: 'synthetic-job' }, lastError: { code: 'storage-failed', message: 'synthetic-write-failure' } };
  const h = await setup(t, { initialState });
  assert.match(h.ids.get('operation-error').textContent, /先取消并等待临时页清理完成，再导出备份/);
  assert.equal(h.ids.get('download-json').disabled, true);
  assert.equal(h.ids.get('download-markdown').disabled, true);
  assert.equal(h.ids.get('cancel').disabled, false);
  await h.ids.get('download-json').fire('click');
  assert.equal(h.blobs.length, 0);
});

test('real manager permission rejection keeps the original preview and refreshes only after failure', async t => {
  const h = await setup(t, { permissionDenied: true });
  const original = h.ids.get('preview').textContent;
  const refreshing = h.ids.get('refresh').fire('click');
  await nextTurn();
  const downloading = h.ids.get('download-json').fire('click');
  await nextTurn();
  h.read.resolve({ ok: true, data: makeState('SYNTHETIC_NEW_STACK') });
  await refreshing;
  await downloading;
  assert.equal(h.ids.get('preview').textContent, original);
  assert.match(h.ids.get('download-status').textContent, /download-failed/);
  assert.equal(await h.blobs[0].text(), original);
  assert.deepEqual(h.revoked, ['blob:synthetic']);
  assert.equal(h.ids.get('download-json').disabled, false);
});
