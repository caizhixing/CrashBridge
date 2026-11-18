import test from 'node:test';
import assert from 'node:assert/strict';
import { mountContent } from '../../src/content/app.js';
import { readList } from '../../src/adapter/selection.js';
import { element, makeDocument, browserEnvironment, URL_BASE, flush } from './fake-dom.js';

function appendRow(document, title) {
  const row = element('tr', '', { role: 'row', class: 'data-row' });
  const cell = element('td', '', { role: 'gridcell' });
  const caption = element('div', '', { 'data-test-id': 'issue-caption-table-cell' });
  const anchor = element('a', '', { href: '#', class: 'link-wrapper' });
  const wrapper = element('div', '', { 'data-test-id': 'titleWrapper' });
  wrapper.append(element('span', title, { class: 'copy-target' })); anchor.append(wrapper); caption.append(anchor); cell.append(caption); row.append(cell); document.body.append(row);
  return { row, anchor };
}

for (const stage of ['before-instruction', 'prefix-wait', 'before-click-microtask']) {
  test(`resolver visibility takeover stays invalid after hiding again: ${stage}`, async () => {
    const token = '00000000-0000-4000-8000-000000000001'; const url = `${URL_BASE}#crashbridge-resolve=${token}`;
    const document = makeDocument(url); document.visibilityState = 'hidden';
    const first = appendRow(document, 'Synthetic A'); const second = appendRow(document, 'Synthetic B');
    const snapshot = readList(document, url).map(entry => entry.descriptor);
    if (stage === 'prefix-wait') second.row.remove();
    const environment = browserEnvironment(document); environment.runtime.id = 'synthetic-extension';
    let instruction;
    environment.runtime.onMessage = { addListener: value => { instruction = value; }, removeListener() {} };
    let clicks = 0; first.anchor.addEventListener('click', () => { clicks++; });
    const app = mountContent(environment); const replies = [];
    const message = { namespace: 'crashbridge', version: 1, type: 'RESOLVE_ROW', payload: { token, snapshot, index: 0 } };
    const takeover = () => {
      document.visibilityState = 'visible'; document.dispatchEvent({ type: 'visibilitychange' });
      document.visibilityState = 'hidden'; document.dispatchEvent({ type: 'visibilitychange' });
    };
    if (stage === 'before-instruction') takeover();
    instruction(message, { id: environment.runtime.id }, value => replies.push(value));
    const queued = [...environment.timers.values()].map(timer => timer.callback);
    if (stage !== 'before-instruction') takeover();
    if (stage === 'prefix-wait') {
      assert.equal(environment.timers.size, 0, 'activation cancels prefix timers');
      assert.deepEqual(replies, [{ ok: false }], 'pending instruction is rejected immediately');
      document.body.append(second.row);
      for (const callback of queued) callback(); // A stale callback cannot resurrect it.
    }
    await flush(); assert.equal(clicks, 0);
    assert.equal(replies.length, 1, 'one response per instruction');
    const retried = []; instruction(message, { id: environment.runtime.id }, value => retried.push(value));
    await flush(); assert.deepEqual(retried, [{ ok: false }]); assert.equal(clicks, 0);
    app.dispose(); assert.equal(document.listeners.has('visibilitychange'), false);
  });
}

test('temporary prefix rendering waits at most three seconds for full ordered snapshot before click', async () => {
  const token = '00000000-0000-4000-8000-000000000001'; const url = `${URL_BASE}#crashbridge-resolve=${token}`;
  const document = makeDocument(url); const first = appendRow(document, 'Synthetic A'); const second = appendRow(document, 'Synthetic B');
  const snapshot = readList(document, url).map(entry => entry.descriptor); second.row.remove();
  const environment = browserEnvironment(document); environment.runtime.id = 'synthetic-extension';
  let instruction;
  environment.runtime.onMessage = { addListener: value => { instruction = value; }, removeListener() {} };
  let clicks = 0; first.anchor.addEventListener('click', () => { clicks++; });
  const app = mountContent(environment); let reply;
  const message = { namespace: 'crashbridge', version: 1, type: 'RESOLVE_ROW', payload: { token, snapshot, index: 0 } };
  assert.equal(instruction(message, { id: environment.runtime.id }, value => { reply = value; }), true);
  assert.equal(reply, undefined); assert.equal(clicks, 0);
  document.body.append(second.row); [...environment.timers.values()][0].callback(); await flush();
  assert.equal(reply.ok, true); assert.equal(clicks, 1);
  second.row.remove(); reply = undefined;
  instruction(message, { id: environment.runtime.id }, value => { reply = value; });
  for (let count = 0; count < 12; count++) { const current = [...environment.timers.values()].at(-1); current.callback(); }
  assert.equal(reply.ok, false); assert.equal(clicks, 1);
  app.dispose();
});
