import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaptureJob, mountContent } from '../../src/content/app.js';
import { parseMessage } from '../../src/domain/protocol.js';
import { element, makeDocument, stackDocument, addIssueRow, browserEnvironment, flush, ISSUE_URL, URL_BASE, STACK } from './fake-dom.js';
const UUID = '12345678-1234-4234-8234-123456789abc';
const JOB_URL = `${ISSUE_URL}#crashbridge-job=${UUID}`;
const root = document => document.querySelector('[data-crashbridge-root]').shadowRoot;
const checkboxes = document => document.querySelectorAll('[data-crashbridge-control]').map(host => host.shadowRoot.querySelector('input'));

test('job parser requires exact UUID hash and supported issue identity', () => {
  assert.equal(parseCaptureJob(JOB_URL).jobId, UUID);
  for (const url of [ISSUE_URL, `${ISSUE_URL}#crashbridge-job=arbitrary`, JOB_URL + '&extra=1', JOB_URL.replace('console.firebase.google.com', 'evil.test'), `${URL_BASE}#crashbridge-job=${UUID}`, 'invalid']) assert.equal(parseCaptureJob(url), null, url);
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

test('capture waits for DOM then submits exactly once with domain-valid payload', async () => {
  const document = makeDocument(JOB_URL); const environment = browserEnvironment(document);
  const app = mountContent(environment);
  assert.equal(environment.sent.length, 0); assert.equal([...environment.timers.values()][0].ms, 60000);
  const section = element('section', '', { 'aria-label': 'Stack trace' }); section.append(element('pre', STACK)); document.body.append(section);
  environment.observers[0].emit(); await flush();
  assert.equal(environment.sent.length, 1); const message = parseMessage(environment.sent[0]);
  assert.equal(message.type, 'CAPTURE_RESULT'); assert.equal(message.payload.jobId, UUID);
  assert.equal(message.payload.capture.stacktrace, STACK); assert.equal(message.payload.error, null);
  assert.equal(environment.timers.size, 0);
  environment.observers[0].emit(); environment.listeners.get('hashchange')(); await flush();
  assert.equal(environment.sent.length, 1); assert.match(root(document).textContent, /已保存/);
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

test('a new job is not blocked by an old in-flight reply and old reply cannot overwrite its status', async () => {
  const document = stackDocument(JOB_URL).document; const environment = browserEnvironment(document);
  let release;
  environment.runtime.sendMessage = message => { environment.sent.push(message); return environment.sent.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: false, error: { code: 'storage-failed' } }); };
  const app = mountContent(environment);
  const next = JOB_URL.replace(UUID, '87654321-4321-4321-8321-cba987654321');
  environment.window.location.href = next; document.location.href = next;
  environment.listeners.get('hashchange')(); await flush();
  assert.equal(environment.sent.length, 2); assert.match(root(document).textContent, /storage-failed/);
  release({ ok: true }); await flush(); assert.match(root(document).textContent, /storage-failed/);
  app.dispose();
});

test('route changes clear job timers and pagehide cleans observers', async () => {
  const document = makeDocument(JOB_URL); const environment = browserEnvironment(document); mountContent(environment);
  environment.window.location.href = URL_BASE; environment.listeners.get('hashchange')(); await flush();
  assert.equal(environment.timers.size, 0); assert.equal(environment.sent.length, 0);
  environment.listeners.get('pagehide')(); assert.equal(environment.observers[0].disconnected, true);
});
