import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundle, toMarkdown } from '../../src/domain/export.js';
import { createQueueItem } from '../../src/domain/model.js';
import { at, issue, capture, succeeded } from './fixtures.js';
const all = { stacktrace: true, version: true, device: true, statistics: true };

test('Export allowlists all nested fields without mutating captures or queue', () => {
  const items = [succeeded({ secret: 'SECRET', capture: capture({ secret: 'SECRET', issue: { ...issue(), cookie: 'SECRET' }, statistics: { events: '1', users: null, timeRange: null, secret: 'SECRET' } }) })];
  const before = structuredClone(items);
  const bundle = createBundle(items, all, at);
  assert.deepEqual(items, before);
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.exportedAt, at);
  assert.ok(!JSON.stringify(bundle).includes('SECRET'));
  bundle.issues[0].capture.warnings.push('independent');
  assert.deepEqual(items, before);
  assert.match(toMarkdown(bundle), /Schema: 1/);
});

test('Every field option excludes the same fields in JSON and Markdown', () => {
  for (let mask = 0; mask < 16; mask++) {
    const options = Object.fromEntries(Object.keys(all).map((key, i) => [key, !!(mask & (1 << i))]));
    const bundle = createBundle([succeeded()], options, at);
    const json = JSON.stringify(bundle);
    const md = toMarkdown(bundle);
    for (const [flag, markers] of Object.entries({ stacktrace: ['SyntheticError'], version: ['version-visible', 'code-visible'], device: ['os-hidden', 'device-hidden'], statistics: ['events-hidden', 'users-hidden'] })) {
      for (const marker of markers) {
        assert.equal(json.includes(marker), options[flag], `${flag}: JSON`);
        assert.equal(md.replace(/\\-/g, '-').includes(marker), options[flag], `${flag}: Markdown`);
      }
    }
    for (const marker of ['rendered-dom', 'currently-displayed', 'unknown', 'Completeness unverified']) assert.ok(json.includes(marker));
    assert.match(md, /Capture source: rendered\\-dom/);
    assert.match(md, /Event: not available/);
  }
});

test('Failures, pending rows, bundle warnings and completeness survive both formats', () => {
  const pending = createQueueItem(issue({ title: null }));
  const failed = { ...pending, status: 'failed', error: { code: 'missing-stack', message: '<not loaded>' } };
  const bundle = createBundle([pending, failed, succeeded()], all, at);
  bundle.warnings.push('Synthetic bundle warning');
  const md = toMarkdown(bundle);
  assert.match(md, /Status: pending/);
  assert.match(md, /Error: missing\\-stack — &lt;not loaded&gt;/);
  assert.match(md, /Warning: Synthetic bundle warning/);
  assert.match(md, /Completeness: unknown/);
  assert.equal(bundle.issues[1].error.code, 'missing-stack');
});

test('Markdown escapes hostile headings/HTML and fences arbitrary stack text', () => {
  const stacktrace = '```\n<script>not executable</script>\n`````\n# fake heading';
  const hostile = issue({ title: '<img>\n# [bad](javascript:bad) `x` &', url: issue().url + '?eventId=evt(foo)' });
  const bundle = createBundle([succeeded({ issue: hostile, capture: capture({ issue: hostile, stacktrace }) })], all, at);
  const md = toMarkdown(bundle);
  assert.ok(md.includes('``````text\n' + stacktrace + '\n``````'));
  assert.ok(!md.includes('## <img>'));
  assert.ok(!md.includes('\n# [bad]'));
  assert.match(md, /&lt;img&gt;/);
  assert.ok(md.includes('evt%28foo%29'));
  assert.equal(bundle.issues[0].capture.stacktrace, stacktrace);
});

test('Maximum stack with many separated backtick runs exports without argument overflow', () => {
  const stacktrace = '`x'.repeat(100000);
  const bundle = createBundle([succeeded({ capture: capture({ stacktrace }) })], all, at);
  assert.ok(toMarkdown(bundle).includes('```text\n' + stacktrace + '\n```'));
});

test('Export rejects invalid queue, timestamps and options', () => {
  for (const items of [null, Array(101).fill(succeeded())]) assert.throws(() => createBundle(items, all, at));
  assert.throws(() => createBundle([], { ...all, device: 'false' }, at));
  assert.throws(() => createBundle([], null, at));
  assert.throws(() => createBundle([], all, 'invalid'));
});
