import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptureJob, mountContent } from '../../src/content/app.js';
import { parseMessage } from '../../src/domain/protocol.js';
import { element, makeDocument, stackDocument, addIssueRow, browserEnvironment, flush, ISSUE_URL, URL_BASE, STACK } from './fake-dom.js';
const UUID = '12345678-1234-4234-8234-123456789abc';
const JOB_URL = `${ISSUE_URL}?crashbridge-job=${UUID}`;
const LEGACY_JOB_URL = `${ISSUE_URL}#crashbridge-job=${UUID}`;
const root = document => document.querySelector('[data-crashbridge-root]').shadowRoot;
const checkboxes = document => document.querySelectorAll('[data-crashbridge-control]').map(host => host.shadowRoot.querySelector('input'));

test('job parser supports query UUIDs and legacy hashes on supported issue URLs', () => {
  for (const url of [JOB_URL, LEGACY_JOB_URL, LEGACY_JOB_URL.replace('crashbridge-job', 'CRASHBRIDGE-JOB')]) {
    assert.equal(parseCaptureJob(url).jobId, UUID);
    assert.equal(parseCaptureJob(url).issue.url, ISSUE_URL);
  }
  assert.equal(parseCaptureJob(`${JOB_URL}#crashbridge-job=ignored`).jobId, UUID);
  for (const url of [
    ISSUE_URL, `${ISSUE_URL}#crashbridge-job=arbitrary`, LEGACY_JOB_URL + '&extra=1',
    JOB_URL.replace(UUID, 'arbitrary'), `${JOB_URL}&crashbridge-job=${UUID}`, `${JOB_URL}%0A`,
    `${ISSUE_URL}?crashbridge-job=#crashbridge-job=${UUID}`,
    JOB_URL.replace('console.firebase.google.com', 'evil.test'), `${URL_BASE}?crashbridge-job=${UUID}`, 'invalid',
  ]) assert.equal(parseCaptureJob(url), null, url);
});

test('shadow checkboxes do not duplicate; native links untouched; cross-page ADD messages accumulate', async () => {
  const document = makeDocument(URL_BASE); const first = addIssueRow(document);
  const environment = browserEnvironment(document); const app = mountContent(environment);
  assert.equal(first.anchor.getAttribute('href'), ISSUE_URL);
  assert.equal(first.row.getAttribute('data-crashbridge-selection'), 'v1');
  assert.equal(checkboxes(document).length, 1);
  let propagationStopped = false;
  document.querySelector('[data-crashbridge-control]').listeners.get('click')({ stopPropagation() { propagationStopped = true; } });
  assert.equal(propagationStopped, true);
  assert.match(root(document).textContent, /兼容性未验证/);
  checkboxes(document)[0].checked = true;
  await root(document).querySelector('button').click();
  assert.equal(environment.sent[0].type, 'ADD_ISSUES');
  assert.equal(parseMessage(environment.sent[0]).payload.issues[0].issueId, 'synthetic-issue');
  environment.observers[0].emit(); await flush();
  assert.equal(checkboxes(document).length, 1);
  mountContent(environment); assert.equal(environment.observers.length, 1);
  first.row.remove(); addIssueRow(document, `${URL_BASE}/issues/page-two`, 'Page two');
  environment.window.location.href = `${URL_BASE}?page=2`; environment.observers[0].emit(); await flush();
  assert.equal(checkboxes(document).length, 1);
  checkboxes(document)[0].checked = true; await root(document).querySelector('button').click();
  assert.deepEqual(environment.sent.map(message => message.payload.issues[0].issueId), ['synthetic-issue', 'page-two']);
  app.dispose(); assert.equal(environment.observers[0].disconnected, true);
  assert.equal(document.querySelector('[data-crashbridge-root]'), null); assert.equal(checkboxes(document).length, 0);
  assert.equal(environment.listeners.size, 0);
});

test('ambiguous rows offer no checkbox; SPA href update removes stale selection', async () => {
  const document = makeDocument(URL_BASE); const { row, cell, anchor } = addIssueRow(document);
  const environment = browserEnvironment(document); const app = mountContent(environment);
  anchor.setAttribute('href', `${URL_BASE}/issues/changed`);
  environment.observers[0].emit({ type: 'attributes', target: anchor }); await flush();
  checkboxes(document)[0].checked = true; await root(document).querySelector('button').click();
  assert.equal(environment.sent[0].payload.issues[0].issueId, 'changed');
  cell.append(element('a', 'Another issue', { href: ISSUE_URL })); environment.observers[0].emit(); await flush();
  assert.equal(checkboxes(document).length, 0); assert.equal(row.hasAttribute('data-crashbridge-selection'), false);
  app.dispose();
});

test('capture survives fragment removal while waiting for DOM and submits once with the query job and event', async () => {
  const detailUrl = `${JOB_URL}&eventId=event-a`;
  const document = makeDocument(`${detailUrl}#initial-fragment`); const environment = browserEnvironment(document);
  const app = mountContent(environment);
  assert.equal(environment.sent.length, 0); assert.equal([...environment.timers.values()][0].ms, 60000);
  await navigate(environment, detailUrl);
  assert.equal(environment.sent.length, 0);
  const section = element('section', '', { 'aria-label': 'Stack trace' }); section.append(element('pre', STACK)); document.body.append(section);
  environment.observers[0].emit(); await flush();
  assert.equal(environment.sent.length, 1); const message = parseMessage(environment.sent[0]);
  assert.equal(message.type, 'CAPTURE_RESULT'); assert.equal(message.payload.jobId, UUID);
  assert.equal(message.payload.capture.issue.url, `${ISSUE_URL}?eventId=event-a`);
  assert.equal(message.payload.capture.event.eventId, 'event-a');
  assert.equal(message.payload.capture.stacktrace, STACK); assert.equal(message.payload.error, null);
  assert.equal(environment.timers.size, 0);
  environment.observers[0].emit(); environment.window.dispatchEvent({ type: 'hashchange' }); await flush();
  assert.equal(environment.sent.length, 1); assert.match(root(document).textContent, /已保存/);
  app.dispose();
});

test('capture still submits from a detail document with a legacy job hash', async () => {
  const environment = browserEnvironment(stackDocument(LEGACY_JOB_URL).document);
  const app = mountContent(environment);
  await flush();
  assert.equal(environment.sent.length, 1);
  const { jobId, capture } = parseMessage(environment.sent[0]).payload;
  assert.equal(jobId, UUID);
  assert.equal(capture.stacktrace, STACK);
  app.dispose();
});

test('missing stacks wait until deadline and fail visibly without empty success', async () => {
  const { document } = stackDocument(JOB_URL, 'Exception only'); const environment = browserEnvironment(document);
  const app = mountContent(environment);
  assert.match(root(document).textContent, /missing-stack/);
  const timeout = [...environment.timers.values()][0]; timeout.callback(); await flush();
  assert.equal(environment.sent[0].payload.capture, null); assert.equal(environment.sent[0].payload.error.code, 'missing-stack');
  assert.match(root(document).textContent, /采集失败/);
  environment.observers[0].emit(); await flush(); assert.equal(environment.sent.length, 1);
  app.dispose();
});

test('unsupported DOM deadline and sign-in failure preserve error codes; messaging rejection visible', async () => {
  const unsupported = browserEnvironment(makeDocument(JOB_URL)); const a = mountContent(unsupported);
  [...unsupported.timers.values()][0].callback(); await flush();
  assert.equal(unsupported.sent[0].payload.error.code, 'unsupported'); a.dispose();
  const document = makeDocument(JOB_URL); document.body.append(element('form', '', { action: 'https://accounts.google.com/signin' }));
  const auth = browserEnvironment(document); const b = mountContent(auth); await flush();
  assert.equal(auth.sent[0].payload.error.code, 'login-required'); b.dispose();
  const rejected = browserEnvironment(stackDocument(JOB_URL).document);
  rejected.runtime.sendMessage = async () => { throw new Error('Disconnected'); };
  const c = mountContent(rejected); await flush();
  assert.match(root(rejected.document).textContent, /未发送/); c.dispose();
});

test('a changed job fails conservatively and an old in-flight reply cannot overwrite its status', async () => {
  const document = stackDocument(JOB_URL).document; const environment = browserEnvironment(document);
  let release;
  environment.runtime.sendMessage = message => { environment.sent.push(message); return environment.sent.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: false, error: { code: 'storage-failed' } }); };
  const app = mountContent(environment);
  const next = JOB_URL.replace(UUID, '87654321-4321-4321-8321-cba987654321');
  environment.window.location.href = next; document.location.href = next;
  environment.window.dispatchEvent({ type: 'hashchange' }); await flush();
  assert.equal(environment.sent.length, 2);
  assert.equal(environment.sent[1].payload.capture, null);
  assert.equal(environment.sent[1].payload.error.code, 'unsupported');
  assert.match(root(document).textContent, /storage-failed/);
  release({ ok: true }); await flush(); assert.match(root(document).textContent, /storage-failed/);
  app.dispose();
});

test('readystatechange and load retry only after complete and are removed on dispose', async () => {
  for (const trigger of ['readystatechange', 'load']) {
    const { document } = stackDocument(JOB_URL);
    document.readyState = 'loading';
    const environment = browserEnvironment(document); const app = mountContent(environment);
    assert.equal(environment.sent.length, 0);
    assert.equal(document.listeners.get('readystatechange').size, 1);
    assert.equal(environment.listeners.get('load').size, 1);
    const fire = () => (trigger === 'load' ? environment.window : document).dispatchEvent({ type: trigger });
    document.readyState = 'interactive'; fire(); await flush();
    environment.observers[0].emit(); await flush();
    assert.equal(environment.sent.length, 0);
    document.readyState = 'complete'; fire(); await flush();
    assert.equal(environment.sent.length, 1);
    assert.equal(parseMessage(environment.sent[0]).payload.capture.stacktrace, STACK);
    fire(); await flush(); assert.equal(environment.sent.length, 1);
    app.dispose();
    assert.equal(document.listeners.size, 0); assert.equal(environment.listeners.size, 0);
    assert.equal(environment.timers.size, 0);
    fire(); await flush(); assert.equal(environment.sent.length, 1);
  }
});

const NEXT_UUID = '87654321-4321-4321-8321-cba987654321';
const navigate = async (environment, url) => {
  environment.window.location.href = url; environment.document.location.href = url;
  environment.window.dispatchEvent({ type: 'hashchange' }); await flush();
};
for (const [name, nextUrl] of [
  ['issue and job', JOB_URL.replace('synthetic-issue', 'issue-b').replace(UUID, NEXT_UUID)],
  ['event and job', `${JOB_URL.replace(UUID, NEXT_UUID)}&eventId=event-b`],
  ['job only', JOB_URL.replace(UUID, NEXT_UUID)],
]) {
  test(`${name} navigation never labels retained A DOM as B, even after B DOM arrives`, async () => {
    const { document, pre } = stackDocument(JOB_URL, `${STACK}\nSYNTHETIC_A_ONLY`);
    const environment = browserEnvironment(document); const app = mountContent(environment);
    assert.equal(environment.sent[0].payload.capture.stacktrace, `${STACK}\nSYNTHETIC_A_ONLY`);
    await navigate(environment, nextUrl);
    assert.equal(environment.sent.length, 2);
    const failed = parseMessage(environment.sent[1]).payload;
    assert.equal(failed.jobId, NEXT_UUID); assert.equal(failed.capture, null);
    assert.equal(failed.error.code, 'unsupported');
    pre.textContent = `${STACK}\nSYNTHETIC_B_ONLY`;
    environment.observers[0].emit(); await flush();
    assert.equal(environment.sent.length, 2);
    app.dispose();
    // Normal background scheduling opens a new document/tab per job and still works.
    const fresh = browserEnvironment(stackDocument(nextUrl, `${STACK}\nSYNTHETIC_B_ONLY`).document);
    const nextApp = mountContent(fresh);
    assert.equal(fresh.sent.length, 1);
    assert.equal(parseMessage(fresh.sent[0]).payload.capture.stacktrace, `${STACK}\nSYNTHETIC_B_ONLY`);
    nextApp.dispose();
  });
}

for (const [name, nextUrl] of [
  ['issue', JOB_URL.replace('synthetic-issue', 'issue-b')],
  ['event', `${JOB_URL}&eventId=event-b`],
]) {
  test(`same job UUID cannot change ${name} while initial document is still loading`, async () => {
    const { document, pre } = stackDocument(JOB_URL, `${STACK}\nSYNTHETIC_A_ONLY`);
    document.readyState = 'interactive';
    const environment = browserEnvironment(document); const app = mountContent(environment);
    assert.equal(environment.sent.length, 0);
    await navigate(environment, nextUrl);
    assert.equal(environment.sent.length, 1);
    assert.equal(environment.sent[0].payload.capture, null);
    assert.equal(environment.sent[0].payload.error.code, 'unsupported');
    pre.textContent = `${STACK}\nSYNTHETIC_B_ONLY`; document.readyState = 'complete';
    document.dispatchEvent({ type: 'readystatechange' }); environment.observers[0].emit(); await flush();
    assert.equal(environment.sent.length, 1); app.dispose();
  });
}

test('a document initially without a job rejects an SPA-added job and binding invalidation is sticky', async () => {
  const { document } = stackDocument(ISSUE_URL); const environment = browserEnvironment(document);
  // Simulate: background says no active job (queriedJob stays null).
  environment.runtime.sendMessage = async msg => {
    if (msg?.type === 'QUERY_ACTIVE_JOB') return { ok: true, data: null };
    environment.sent.push(msg);
    return { ok: true, data: {} };
  };
  const app = mountContent(environment);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(environment.sent.length, 0);
  await navigate(environment, JOB_URL);
  assert.equal(environment.sent[0].payload.capture, null);
  assert.equal(environment.sent[0].payload.error.code, 'unsupported');
  app.dispose();
  const waiting = stackDocument(JOB_URL).document; waiting.readyState = 'interactive';
  const second = browserEnvironment(waiting); const secondApp = mountContent(second);
  await navigate(second, ISSUE_URL); assert.equal(second.sent.length, 0);
  waiting.readyState = 'complete'; await navigate(second, JOB_URL);
  assert.equal(second.sent[0].payload.capture, null);
  assert.equal(second.sent[0].payload.error.code, 'unsupported'); secondApp.dispose();
});

test('visibility attribute changes trigger a retry without mocking extraction', async () => {
  const { document, pre } = stackDocument(JOB_URL); pre.hidden = true;
  const environment = browserEnvironment(document); const app = mountContent(environment);
  assert.equal(environment.sent.length, 0);
  const filter = environment.observers[0].options.attributeFilter;
  for (const name of ['hidden', 'aria-hidden', 'style']) assert.ok(filter.includes(name));
  pre.hidden = false; environment.observers[0].emit({ type: 'attributes', target: pre, attributeName: 'hidden' }); await flush();
  assert.equal(environment.sent[0].payload.capture.stacktrace, STACK); app.dispose();
});

test('route changes clear job timers and pagehide cleans observers', async () => {
  const document = makeDocument(JOB_URL); const environment = browserEnvironment(document); mountContent(environment);
  environment.window.location.href = URL_BASE; environment.window.dispatchEvent({ type: 'hashchange' }); await flush();
  assert.equal(environment.timers.size, 0); assert.equal(environment.sent.length, 0);
  environment.window.dispatchEvent({ type: 'pagehide' }); assert.equal(environment.observers[0].disconnected, true);
});
