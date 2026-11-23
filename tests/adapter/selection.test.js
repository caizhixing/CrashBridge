import test from 'node:test';
import assert from 'node:assert/strict';
import { readList, matchRow, validateSelection, listUrl } from '../../src/adapter/selection.js';
import { mountContent } from '../../src/content/app.js';
import { element, makeDocument, browserEnvironment, URL_BASE, ISSUE_URL, flush } from './fake-dom.js';

export function hashRow(document, title = 'Synthetic crash', subtitle = 'Synthetic location', href = '#') {
  const row = element('tr', '', { role: 'row', class: 'data-row' });
  const nativeCell = element('td', '', { role: 'gridcell', class: 'cdk-column-issueCheckbox' });
  const native = element('input', '', { type: 'checkbox' }); native.checked = true; nativeCell.append(native);
  const cell = element('td', '', { role: 'gridcell' });
  const caption = element('div', '', { 'data-test-id': 'issue-caption-table-cell' });
  const anchor = element('a', '', { href, class: 'link-wrapper' });
  const heading = element('div', '', { 'data-test-id': 'titleWrapper', class: 'title-wrapper' });
  const subheading = element('div', '', { 'data-test-id': 'subtitleWrapper', class: 'subtitle-wrapper' });
  heading.append(element('span', title, { class: 'copy-target' }));
  subheading.append(element('span', subtitle, { class: 'copy-target' }));
  anchor.append(heading, subheading); caption.append(anchor); cell.append(caption); row.append(nativeCell, cell); document.body.append(row);
  return { row, native, nativeCell, caption, anchor, heading, subheading };
}
const snapshot = document => readList(document, URL_BASE).map(row => row.descriptor);

test('anonymous observed hash rows preserve native checkbox and support independent fixed toolbar selection', async () => {
  const document = makeDocument(URL_BASE); const first = hashRow(document); hashRow(document, 'Second synthetic crash');
  const environment = browserEnvironment(document);
  const sent = environment.sent;
  environment.runtime.sendMessage = async message => { sent.push(message); return message.type === 'GET_RESOLUTION' ? { ok: true, data: { running: false, results: [{ index: 0, status: 'succeeded', added: 1, duplicates: 0 }], error: null } } : { ok: true }; };
  const app = mountContent(environment);
  const toolbar = document.querySelector('[data-crashbridge-root]').shadowRoot;
  assert.match(toolbar.querySelector('style').textContent, /position:fixed!important/);
  const add = toolbar.querySelector('button');
  assert.equal(add.disabled, true); assert.match(toolbar.textContent, /已选 0 条/);
  const controls = document.querySelectorAll('[data-crashbridge-control]'); assert.equal(controls.length, 2);
  assert.equal(first.nativeCell.querySelector('[data-crashbridge-control]'), null);
  const input = controls[0].shadowRoot.querySelector('input'); input.checked = true; input.listeners.get('change')();
  assert.equal(add.disabled, false); assert.match(toolbar.textContent, /已选 1 条/);
  await add.click();
  assert.equal(sent[0].type, 'RESOLVE_SELECTION'); assert.deepEqual(sent[0].payload.selected, [0]);
  assert.equal(Object.hasOwn(sent[0].payload.snapshot[0], 'issueId'), false);
  assert.match(toolbar.textContent, /新增 1/); assert.equal(first.native.checked, true); assert.equal(first.anchor.getAttribute('href'), '#');
  await toolbar.querySelectorAll('button')[1].click(); assert.equal(sent.at(-1).type, 'OPEN_MANAGER');
  app.dispose();
});

test('selected row substitution and reordered snapshot before observer flush never resolve a different row', async () => {
  for (const mutate of ['title', 'reorder']) {
    const document = makeDocument(URL_BASE); const first = hashRow(document, 'Synthetic A'); const second = hashRow(document, 'Synthetic B');
    const environment = browserEnvironment(document); const app = mountContent(environment);
    const toolbar = document.querySelector('[data-crashbridge-root]').shadowRoot;
    const input = document.querySelector('[data-crashbridge-control]').shadowRoot.querySelector('input');
    input.checked = true; input.listeners.get('change')();
    if (mutate === 'title') first.heading.querySelector('span').textContent = 'Synthetic replacement';
    else document.body.append(first.row);
    await toolbar.querySelector('button').click();
    assert.equal(environment.sent.some(message => message.type === 'RESOLVE_SELECTION'), false);
    assert.match(toolbar.textContent, /列表已变化/); assert.equal(first.native.checked, true); assert.equal(second.native.checked, true);
    app.dispose();
  }
});

test('full ordered snapshot and unique fingerprints reject reorder, edits, duplicates and hidden titles', () => {
  const document = makeDocument(URL_BASE); const a = hashRow(document, ' A   synthetic '); const b = hashRow(document, 'B synthetic');
  const before = snapshot(document); assert.equal(before[0].title, 'A synthetic');
  assert.equal(matchRow(document, URL_BASE, { snapshot: before, index: 0 }), a.anchor);
  document.body.append(a.row); assert.throws(() => matchRow(document, URL_BASE, { snapshot: before, index: 0 }), /snapshot changed/);
  a.row.remove(); b.row.remove(); hashRow(document); hashRow(document);
  assert.throws(() => validateSelection({ listUrl: URL_BASE, snapshot: snapshot(document), selected: [0] }), /Ambiguous/);
  a.heading.hidden = true;
  const hidden = makeDocument(URL_BASE); const row = hashRow(hidden); row.heading.hidden = true;
  assert.throws(() => validateSelection({ listUrl: URL_BASE, snapshot: snapshot(hidden), selected: [0] }), /descriptor/);
});

test('viewport-dependent cell counts do not break cross-tab row matching', () => {
  const source = makeDocument(URL_BASE); const a = hashRow(source, 'A synthetic'); hashRow(source, 'B synthetic');
  const before = snapshot(source);
  // A temp tab at a different viewport renders more/fewer responsive columns.
  const temp = makeDocument(URL_BASE); const ta = hashRow(temp, 'A synthetic'); hashRow(temp, 'B synthetic');
  const extra = element('td', '', { role: 'gridcell' }); ta.row.append(extra);
  assert.notEqual(snapshot(temp)[0].cells, before[0].cells, 'fixture must differ in cell count');
  assert.equal(matchRow(temp, URL_BASE, { snapshot: before, index: 0 }), ta.anchor);
});

test('list URL and selection payload reject wrong origin/routes/credentials/oversize/bad indices; real href preserved', () => {
  for (const url of ['bad', ISSUE_URL, URL_BASE.replace('console.firebase.google.com', 'evil.test'), URL_BASE.replace('https://', 'https://user:pass@'), URL_BASE + '#arbitrary']) assert.equal(listUrl(url), null);
  assert.equal(listUrl(URL_BASE + '?filter=synthetic'), URL_BASE + '?filter=synthetic');
  const document = makeDocument(URL_BASE); hashRow(document, 'Direct synthetic', 'Sub', ISSUE_URL);
  assert.equal(snapshot(document)[0].href, ISSUE_URL);
  const good = { listUrl: URL_BASE, snapshot: snapshot(document), selected: [0] };
  assert.deepEqual(validateSelection(good), good);
  for (const value of [{ ...good, selected: [1] }, { ...good, selected: [0, 0] }, { ...good, snapshot: [] }, { ...good, extra: 'x'.repeat(300000) }, { ...good, snapshot: [{ ...good.snapshot[0], href: 'https://evil.test/' }] }]) assert.throws(() => validateSelection(value));
});

test('only owned token-bound instructions click a matched caption, and source CHECK never clicks', async () => {
  const token = '00000000-0000-4000-8000-000000000001'; const url = `${URL_BASE}#crashbridge-resolve=${token}`;
  const document = makeDocument(url); const row = hashRow(document); let clicks = 0;
  row.anchor.addEventListener('click', () => { clicks++; });
  const environment = browserEnvironment(document); environment.runtime.id = 'synthetic-extension';
  let listener; environment.runtime.onMessage = { addListener: value => { listener = value; }, removeListener() {} };
  const app = mountContent(environment); assert.equal(environment.sent[0].type, 'RESOLVER_READY');
  assert.deepEqual(environment.sent[0].payload, { token });
  const message = { namespace: 'crashbridge', version: 1, type: 'RESOLVE_ROW', payload: { token, snapshot: readList(document, url).map(entry => entry.descriptor), index: 0 } };
  let reply; listener(message, { id: 'evil' }, value => { reply = value; }); await flush(); assert.equal(clicks, 0); assert.equal(reply, undefined);
  listener({ ...message, payload: { ...message.payload, token: 'wrong' } }, { id: environment.runtime.id }, value => { reply = value; }); assert.equal(reply.ok, false);
  listener({ ...message, type: 'CHECK_SELECTION' }, { id: environment.runtime.id }, value => { reply = value; }); assert.equal(reply.ok, true); assert.equal(clicks, 0);
  listener(message, { id: environment.runtime.id }, value => { reply = value; }); assert.equal(reply.ok, true); await flush(); assert.equal(clicks, 1);
  document.visibilityState = 'visible'; listener(message, { id: environment.runtime.id }, value => { reply = value; }); await flush(); assert.equal(reply.ok, false); assert.equal(clicks, 1);
  document.visibilityState = 'hidden';
  row.heading.textContent = 'Changed'; listener(message, { id: environment.runtime.id }, value => { reply = value; }); await flush(); assert.equal(reply.ok, false); assert.equal(clicks, 1);
  app.dispose();
});
