import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCapture, parseIssueUrl } from '../../src/adapter/firebase.js';
import { validateCapture } from '../../src/domain/model.js';
import { element, stackDocument, makeDocument, ISSUE_URL, STACK } from './fake-dom.js';
const NOW = '2026-11-16T07:00:00.000Z';
const issue = parseIssueUrl(ISSUE_URL);
const code = expected => error => error.code === expected;

test('extracts one rendered cause chain, null metadata, unknown completeness and actual URL event ID', () => {
  const { document } = stackDocument(`${ISSUE_URL}?eventId=synthetic-event`);
  const capture = extractCapture(document, issue, NOW);
  assert.equal(capture.stacktrace, STACK);
  assert.deepEqual(capture.event, { eventId: 'synthetic-event', identitySource: 'event-id' });
  assert.equal(capture.completeness, 'unknown');
  assert.equal(capture.selection, 'currently-displayed');
  assert.equal(capture.eventTimestamp, null);
  for (const name of ['appVersion', 'versionCode', 'osVersion', 'deviceModel']) assert.equal(capture[name], null);
  assert.deepEqual(capture.statistics, { events: null, users: null, timeRange: null });
  assert.deepEqual(validateCapture(capture), capture);
});

test('real Firebase console frames without "at" prefix are captured; icon ligatures excluded; sibling region with frames preferred', () => {
  // Mirrors the real detail DOM: div.stack-trace > div[role=region] with frames like
  // "pkg.Class.method (File.kt:42)" concatenated on one line, plus mat-icon ligatures.
  const document = makeDocument(ISSUE_URL);
  const outer = element('div', '', { class: 'stack-trace fire-theme-container' });
  const header = element('div', 'Fatal Exception: java.util.ConcurrentModificationException');
  const icon = element('mat-icon', 'keyboard_arrow_up', { class: 'mat-icon google-symbols', 'aria-hidden': 'true' });
  const region = element('div', '', { role: 'region', 'aria-labelledby': 'trace-heading' });
  document.body.append(element('h2', 'Fatal Exception header', { id: 'trace-heading' }));
  region.append(element('span', 'app.lawnchair.feed.FeedOverlayManager.openQuickTool (FeedOverlayManager.kt:529)'));
  region.append(element('mat-icon', 'arrow_drop_down', { class: 'mat-icon google-symbols' }));
  region.append(element('span', 'com.tapkit.launchertools.QuickAccessActivityKt.QuickAccessScreen$lambda$2$0$0 (QuickAccessActivity.kt:383)'));
  region.append(element('span', 'androidx.compose.foundation.AbstractClickableNode.performClick (Clickable.kt:1699)'));
  region.append(element('span', 'com.android.internal.os.ZygoteInit.main (ZygoteInit.java:972)'));
  outer.append(header, icon, region);
  document.body.append(outer);
  const capture = extractCapture(document, issue, NOW);
  assert.equal(capture.completeness, 'unknown');
  assert.ok(capture.stacktrace.includes('openQuickTool (FeedOverlayManager.kt:529)'));
  assert.ok(capture.stacktrace.includes('ZygoteInit.main (ZygoteInit.java:972)'));
  assert.ok(!capture.stacktrace.includes('arrow_drop_down'), 'decorative icon ligatures must not leak into the stack');
  assert.ok(!capture.stacktrace.includes('keyboard_arrow_up'));
  assert.deepEqual(validateCapture(capture), capture);
  // A second sibling region that lacks frames is ignored; the one with frames wins.
  const sibling = element('div', 'Only a header, no frames', { class: 'stacktrace' });
  document.body.append(sibling);
  const second = extractCapture(document, issue, NOW);
  assert.equal(second.stacktrace, capture.stacktrace);
  // Two sibling regions that both contain frames remain ambiguous.
  const other = element('div', 'at other.Foo.bar(Foo.java:1)', { class: 'stack-trace' });
  document.body.append(other);
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
});

test('semantic labelled region fallback and narrow metadata dl support', () => {
  const document = makeDocument(ISSUE_URL);
  const heading = element('h2', 'Stack trace', { id: 'trace-heading' });
  const region = element('section', '', { 'aria-labelledby': 'trace-heading' });
  region.append(element('pre', STACK)); document.body.append(heading, region);
  const dl = element('dl');
  for (const [label, value] of [['App version', '1.2'], ['Version code', '12'], ['Android version', '14'], ['Device model', 'Synthetic'], ['Events', '3'], ['Users', '2'], ['Time range', '24 hours'], ['Event time', '2026-11-16']]) dl.append(element('dt', label), element('dd', value));
  const details = element('section', '', { 'aria-label': 'Event details' }); details.append(dl); document.body.append(details);
  const capture = extractCapture(document, issue, NOW);
  assert.equal(capture.appVersion, '1.2'); assert.equal(capture.versionCode, '12');
  assert.equal(capture.osVersion, '14'); assert.equal(capture.deviceModel, 'Synthetic');
  assert.deepEqual(capture.statistics, { events: '3', users: '2', timeRange: '24 hours' });
  assert.equal(capture.eventTimestamp, '2026-11-16');
  assert.deepEqual(capture.event, { eventId: null, identitySource: 'unavailable' });
  dl.append(element('dt', 'App version'), element('dd', 'ambiguous'));
  assert.equal(extractCapture(document, issue, NOW).appVersion, null);
});

test('long stack truncates with warning; collapsed content marks partial without clicking', () => {
  const { document, section, pre } = stackDocument(ISSUE_URL, STACK + 'x'.repeat(200000));
  let capture = extractCapture(document, issue, NOW);
  assert.equal(capture.stacktrace.length, 200000); assert.equal(capture.completeness, 'partial');
  assert.ok(capture.warnings.some(value => value.includes('truncated')));
  pre.textContent = STACK; section.append(element('button', 'More threads', { 'aria-expanded': 'false' }));
  capture = extractCapture(document, issue, NOW);
  assert.equal(capture.completeness, 'partial'); assert.equal(capture.stacktrace, STACK);
});

test('rejects wrong URL/canonical identity, auth pages and invalid capture time', () => {
  const { document } = stackDocument(ISSUE_URL.replace('synthetic-issue', 'other-issue'));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  const auth = makeDocument('https://accounts.google.com/signin');
  assert.throws(() => extractCapture(auth, issue, NOW), code('login-required'));
  const supported = stackDocument().document;
  supported.body.append(element('link', '', { rel: 'canonical', href: ISSUE_URL.replace('synthetic-issue', 'other') }));
  assert.throws(() => extractCapture(supported, issue, NOW), code('unsupported'));
  assert.throws(() => extractCapture(stackDocument().document, issue, 'invalid'), code('unsupported'));
});

test('event URL and scoped event ID metadata must not conflict', () => {
  const expected = parseIssueUrl(`${ISSUE_URL}?eventId=expected-event`);
  assert.throws(() => extractCapture(stackDocument().document, expected, NOW), code('unsupported'));
  const { document } = stackDocument(`${ISSUE_URL}?eventId=expected-event`);
  const details = element('section', '', { 'aria-label': 'Event details' });
  const dl = element('dl'); dl.append(element('dt', 'Event ID'), element('dd', 'other-event')); details.append(dl); document.body.append(details);
  assert.throws(() => extractCapture(document, expected, NOW), code('unsupported'));
});

test('unscoped page/pre text is never a stack; empty/exception-only region fails missing-stack', () => {
  const document = makeDocument(ISSUE_URL);
  document.body.append(element('pre', STACK), element('p', 'Private custom keys and unrelated page text'));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  for (const text of ['', 'Fatal Exception: java.lang.Exception: no rendered frames', 'events 100 users 3']) {
    assert.throws(() => extractCapture(stackDocument(ISSUE_URL, text).document, issue, NOW), code('missing-stack'));
  }
});

const hideCases = [
  ['hidden', node => { node.hidden = true; }],
  ['aria-hidden', node => node.setAttribute('aria-hidden', 'true')],
  ['display none', node => { node.style.display = 'none'; }],
  ['visibility hidden', node => { node.style.visibility = 'hidden'; }],
  ['visibility collapse', node => { node.style.visibility = 'collapse'; }],
  ['contentVisibility hidden', node => { node.style.contentVisibility = 'hidden'; }],
  ['no layout rects', node => { node.rects = []; }],
];
for (const [name, hide] of hideCases) {
  test(`${name}: hidden region/block cannot supply a stack and hidden descendants never leak`, () => {
    for (const target of ['section', 'pre']) {
      const fixture = stackDocument(ISSUE_URL, `${STACK}\nSYNTHETIC_HIDDEN_DATA`);
      hide(fixture[target]);
      assert.throws(() => extractCapture(fixture.document, issue, NOW), code(target === 'section' ? 'unsupported' : 'missing-stack'));
    }
    const { document, pre } = stackDocument();
    const secret = element('span', '\nSYNTHETIC_HIDDEN_DATA\n    at example.secret.Hidden.run(Hidden.java:1)');
    hide(secret); pre.append(secret);
    // textContent intentionally sees hidden children, like the browser DOM.
    assert.match(pre.textContent, /SYNTHETIC_HIDDEN_DATA/);
    assert.equal(extractCapture(document, issue, NOW).stacktrace, STACK);
    pre.textContent = 'Exception only'; pre.append(secret);
    assert.throws(() => extractCapture(document, issue, NOW), code('missing-stack'));
  });
}

test('hidden competing regions and blocks do not obscure the one visible stack', () => {
  const { document, section } = stackDocument();
  const hiddenRegion = element('div', STACK, { class: 'stacktrace', hidden: '' });
  document.body.append(hiddenRegion);
  section.append(element('pre', 'SYNTHETIC_HIDDEN_DATA', { 'aria-hidden': 'true' }));
  assert.equal(extractCapture(document, issue, NOW).stacktrace, STACK);
});

test('text-node traversal preserves literal newlines, br, block lines, Java/native frames and cause chains', () => {
  const { document, pre } = stackDocument(ISSUE_URL, 'Fatal Exception: java.lang.Exception: synthetic');
  pre.append(element('br'), element('span', '    at example.synthetic.Main.run(Main.java:42)'), element('br'));
  pre.append(document.createTextNode('Caused by: java.io.IOException: synthetic\n'));
  const native = element('span', '    #00 pc 000000000001abcd /synthetic/libexample.so');
  pre.append(native, element('div', '    at example.synthetic.Loader.load(Loader.java:8)'));
  const contents = element('span', '\n    at example.synthetic.More.run(More.java:1)');
  contents.style.display = 'contents'; contents.rects = []; pre.append(contents);
  assert.equal(pre.childNodes[0].nodeType, 3);
  const stack = extractCapture(document, issue, NOW).stacktrace;
  assert.equal(stack, 'Fatal Exception: java.lang.Exception: synthetic\n    at example.synthetic.Main.run(Main.java:42)\nCaused by: java.io.IOException: synthetic\n    #00 pc 000000000001abcd /synthetic/libexample.so\n    at example.synthetic.Loader.load(Loader.java:8)\n\n    at example.synthetic.More.run(More.java:1)');
  pre.textContent = 'Synthetic native crash\n    #01 pc 0000abcd /synthetic/libexample.so';
  assert.equal(extractCapture(document, issue, NOW).stacktrace, pre.textContent);
});

test('hidden metadata descendants do not leak through optional fields', () => {
  const { document } = stackDocument();
  const details = element('section', '', { 'aria-label': 'Event details' });
  const dl = element('dl'); const value = element('dd', '1.2');
  value.append(element('span', 'SYNTHETIC_HIDDEN_DATA', { hidden: '' }));
  dl.append(element('dt', 'App version'), value); details.append(dl); document.body.append(details);
  assert.equal(extractCapture(document, issue, NOW).appVersion, '1.2');
  details.hidden = true;
  assert.equal(extractCapture(document, issue, NOW).appVersion, null);
});

test('ambiguous regions/blocks reject; nested named regions do not duplicate', () => {
  const { document, section } = stackDocument();
  section.append(element('pre', STACK));
  assert.throws(() => extractCapture(document, issue, NOW), code('unsupported'));
  const other = stackDocument();
  other.document.body.append(element('div', STACK, { class: 'stacktrace' }));
  assert.throws(() => extractCapture(other.document, issue, NOW), code('unsupported'));
  const nested = stackDocument(); nested.pre.setAttribute('class', 'stack-trace');
  assert.equal(extractCapture(nested.document, issue, NOW).stacktrace, STACK);
});
