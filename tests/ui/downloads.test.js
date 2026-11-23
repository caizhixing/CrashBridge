import test from 'node:test';
import assert from 'node:assert/strict';
import { createDownloader, DOWNLOAD_FAILURE } from '../../extension/downloads.js';

function harness({ reject = false, early = null, state = 'in_progress', searchReject = false, empty = false } = {}) {
  const listeners = new Set();
  const events = [];
  const blobs = [];
  const revoked = [];
  const requests = [];
  const emit = delta => { for (const listener of listeners) listener(delta); };
  const downloader = createDownloader({
    createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-private-url'; },
    revokeObjectURL(url) { revoked.push(url); },
    downloads: {
      onChanged: { addListener(listener) { listeners.add(listener); }, removeListener(listener) { listeners.delete(listener); } },
      async download(options) {
        requests.push(options);
        if (reject) throw new Error('permission denied blob:synthetic-private-url SECRET_LOG');
        if (early) emit({ id: 7, state: { current: early } });
        return 7;
      },
      async search(query) { assert.deepEqual(query, { id: 7 }); if (searchReject) throw new Error('private error'); return empty ? [] : [{ id: 7, state }]; }
    }
  });
  return { downloader, events, blobs, revoked, requests, listeners, emit };
}
const snapshot = { json: '{"synthetic":"json"}', markdown: '# synthetic markdown' };
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

for (const format of ['json', 'markdown']) test(`${format}: only matching onChanged complete is success, exact preview bytes downloaded and URL released`, async () => {
  const h = harness();
  let settled = false;
  const run = h.downloader.download(format, snapshot, status => h.events.push(status)).then(() => { settled = true; });
  await nextTurn();
  assert.equal(settled, false);
  assert.equal(h.downloader.active, true);
  assert.equal(h.requests[0].saveAs, true);
  assert.match(h.requests[0].filename, new RegExp(`^\\d{8}_\\d{6}_0issues\\.${format === 'json' ? 'json' : 'md'}$`), 'timestamped filename');
  assert.equal(await h.blobs[0].text(), snapshot[format]);
  assert.match(h.blobs[0].type, format === 'json' ? /application\/json/ : /text\/markdown/);
  h.emit({ id: 99, state: { current: 'complete' } });
  h.emit({ id: 7, bytesReceived: { current: 20 } });
  await nextTurn();
  assert.equal(settled, false);
  assert.deepEqual(h.revoked, []);
  h.emit({ id: 7, state: { current: 'complete' } });
  await run;
  assert.equal(h.downloader.active, false);
  assert.match(h.events.at(-1), /下载完成/);
  assert.deepEqual(h.revoked, ['blob:synthetic-private-url']);
  assert.equal(h.listeners.size, 0);
});

test('accepted download/search complete alone never claims success without completion event', async () => {
  const h = harness({ state: 'complete' });
  let settled = false;
  const run = h.downloader.download('json', snapshot, () => {}).then(() => { settled = true; });
  await nextTurn();
  assert.equal(settled, false);
  h.emit({ id: 7, state: { current: 'complete' } });
  await run;
});

test('single-issue export names the file with the issue ID; multiple issues use a count', async () => {
  for (const [issues, suffix] of [
    [[{ issue: { issueId: 'abc123' } }], 'abc123'],
    [[{ issue: { issueId: 'a' } }, { issue: { issueId: 'b' } }], '2issues'],
  ]) {
    const h = harness();
    const one = { ...snapshot, bundle: { issues } };
    const run = h.downloader.download('markdown', one, () => {});
    await nextTurn();
    assert.match(h.requests[0].filename, new RegExp(`^\\d{8}_\\d{6}_${suffix}\\.md$`));
    h.emit({ id: 7, state: { current: 'complete' } });
    await run;
  }
});

for (const options of [{ reject: true }, { early: 'interrupted' }, { state: 'interrupted' }, { searchReject: true }, { empty: true }]) test(`failure ${JSON.stringify(options)} retains input and permits retry without leaking private diagnostics`, async () => {
  const h = harness(options);
  const input = structuredClone(snapshot);
  await assert.rejects(h.downloader.download('json', input, status => h.events.push(status)), { message: DOWNLOAD_FAILURE });
  assert.deepEqual(input, snapshot);
  assert.equal(h.events.at(-1), DOWNLOAD_FAILURE);
  assert.doesNotMatch(h.events.join('\n'), /SECRET_LOG|blob:synthetic/);
  assert.deepEqual(h.revoked, ['blob:synthetic-private-url']);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.downloader.active, false);
  await assert.rejects(h.downloader.download('markdown', input, () => {}), { message: DOWNLOAD_FAILURE });
  assert.equal(h.revoked.length, 2);
});

test('early completion event is correlated after asynchronous ID arrives', async () => {
  const h = harness({ early: 'complete' });
  await h.downloader.download('markdown', snapshot, status => h.events.push(status));
  assert.match(h.events.at(-1), /下载完成/);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.revoked.length, 1);
});

test('late interruption is failure, parallel request is rejected and invalid format allocates nothing', async () => {
  const h = harness();
  await assert.rejects(h.downloader.download('html', snapshot, () => {}), /不支持/);
  assert.equal(h.blobs.length, 0);
  const run = h.downloader.download('json', snapshot, status => h.events.push(status));
  const rejected = assert.rejects(run, { message: DOWNLOAD_FAILURE });
  await nextTurn();
  await assert.rejects(h.downloader.download('markdown', snapshot, () => {}), /已有下载/);
  assert.equal(h.blobs.length, 1);
  h.emit({ id: 7, state: { current: 'interrupted' }, error: { current: 'SECRET_LOG' } });
  await rejected;
  assert.equal(h.revoked.length, 1);
  assert.equal(h.events.at(-1), DOWNLOAD_FAILURE);
});
