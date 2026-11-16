// A deliberately small browser boundary fake, not a Firebase/parser stub. It supports only
// selectors used by this adapter; unsupported selector syntax fails rather than matching all.
function splitSelectors(selector) { return selector.split(',').map(part => part.trim()); }
function simpleMatches(node, selector) {
  if (node.nodeType !== 1) return false;
  const attrs = [...selector.matchAll(/\[([\w-]+)(?:(\^?=)"([^"]*)")?\]/g)];
  const head = selector.replace(/\[[^\]]+\]/g, '');
  if (head.startsWith('.')) {
    if (!node.className.split(/\s+/).includes(head.slice(1))) return false;
  } else if (head && !/^[\w-]+$/.test(head)) throw new Error(`Unsupported fake selector ${selector}`);
  else if (head && node.tagName.toLowerCase() !== head.toLowerCase()) return false;
  return attrs.every(([, name, operator, expected]) => {
    const value = node.getAttribute(name);
    return operator === '=' ? value === expected : operator === '^=' ? value?.startsWith(expected) : value !== null;
  });
}
function matches(node, selector) {
  return splitSelectors(selector).some(part => {
    // Spaces inside quoted attributes are not descendant separators.
    const tokens = part.match(/(?:\[[^\]]*\]|[^\s])+/g);
    let current = node;
    if (!simpleMatches(current, tokens.pop())) return false;
    while (tokens.length) {
      const token = tokens.pop();
      current = current.parentNode;
      while (current && !simpleMatches(current, token)) current = current.parentNode;
      if (!current) return false;
    }
    return true;
  });
}

export class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = tagName.toUpperCase(); this.nodeType = 1; this.attributes = new Map();
    this.children = []; this.parentNode = null; this.listeners = new Map(); this.text = text;
    this.checked = false; this.disabled = false; this.hidden = false;
  }
  get className() { return this.getAttribute('class') ?? ''; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.text = value; this.children = []; }
  get isConnected() { return this.tagName === 'HTML' || Boolean(this.parentNode?.isConnected); }
  get nextElementSibling() { const nodes = this.parentNode?.children ?? []; return nodes[nodes.indexOf(this) + 1] ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) {
    const result = [];
    for (const child of this.children) { if (matches(child, selector)) result.push(child); result.push(...child.querySelectorAll(selector)); }
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { return matches(this, selector) ? this : this.parentNode?.closest(selector) ?? null; }
  attachShadow() { this.shadowRoot = new FakeElement('shadow'); return this.shadowRoot; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
  async click() { return this.listeners.get('click')?.({ target: this }); }
}

export function element(tag, text = '', attrs = {}) {
  const node = new FakeElement(tag, text);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
export function makeDocument(url) {
  const html = element('html'); const body = element('body'); html.append(body);
  return {
    URL: url, location: { href: url }, documentElement: html, body,
    querySelectorAll: selector => html.querySelectorAll(selector),
    querySelector: selector => html.querySelector(selector),
    getElementById: id => {
      const visit = node => node.getAttribute('id') === id ? node : node.children.map(visit).find(Boolean);
      return visit(html) ?? null;
    },
    createElement: tag => element(tag), createTextNode: text => { const node = element('text', text); node.nodeType = 3; return node; },
  };
}
export const URL_BASE = 'https://console.firebase.google.com/project/synthetic-project/crashlytics/app/android:example.synthetic';
export const ISSUE_URL = `${URL_BASE}/issues/synthetic-issue`;
export const STACK = 'Fatal Exception: java.lang.IllegalStateException: synthetic\n    at example.synthetic.Main.run(Main.java:42)\nCaused by: java.io.IOException: synthetic\n    at example.synthetic.Loader.load(Loader.java:8)';
export function stackDocument(url = ISSUE_URL, stack = STACK) {
  const document = makeDocument(url); const section = element('section', '', { 'aria-label': 'Stack trace' });
  const pre = element('pre', stack); section.append(pre); document.body.append(section);
  return { document, section, pre };
}
export function addIssueRow(document, href = ISSUE_URL, title = 'Synthetic crash') {
  const row = element('tr'); const cell = element('td'); const anchor = element('a', title, { href });
  cell.append(anchor); row.append(cell); document.body.append(row); return { row, cell, anchor };
}
export function browserEnvironment(document, url = document.URL) {
  const listeners = new Map(); const timers = new Map(); const sent = []; const observers = [];
  const window = {
    location: { href: url }, addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name), navigation: null,
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
    emit(record = { type: 'childList', target: document.body, addedNodes: [element('div')], removedNodes: [] }) { if (!this.disconnected) this.callback([record]); }
  }
  return {
    document, window, MutationObserver: Observer, observers, listeners, sent, timers,
    runtime: { async sendMessage(message) { sent.push(message); return { ok: true, data: {} }; } },
    now: () => '2026-11-16T07:00:00.000Z',
    setTimeout: (callback, ms) => { const id = timers.size + 1; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
}
export async function flush() { await Promise.resolve(); await Promise.resolve(); }
