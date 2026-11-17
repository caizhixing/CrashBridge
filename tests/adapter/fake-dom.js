// A deliberately small browser boundary fake, not a Firebase/parser stub. It supports only
// selectors used by this adapter; unsupported selector syntax fails rather than matching all.
function splitSelectors(selector) { return selector.split(',').map(part => part.trim()); }
function simpleMatches(node, selector) {
  if (node.nodeType !== 1) return false;
  const attrs = [...selector.matchAll(/\[([\w-]+)(?:([*~^]?=)"([^"]*)")?\]/g)];
  const head = selector.replace(/\[[^\]]+\]/g, '');
  if (head.startsWith('.')) {
    if (!node.className.split(/\s+/).includes(head.slice(1))) return false;
  } else if (head && !/^[\w-]+$/.test(head)) throw new Error(`Unsupported fake selector ${selector}`);
  else if (head && node.tagName.toLowerCase() !== head.toLowerCase()) return false;
  return attrs.every(([, name, operator, expected]) => {
    const value = node.getAttribute(name);
    return operator === '=' ? value === expected : operator === '^=' ? value?.startsWith(expected) : operator === '*=' ? value?.includes(expected) : operator === '~=' ? value?.split(/\s+/).includes(expected) : value !== null;
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

class FakeText {
  constructor(text) { this.nodeType = 3; this.nodeValue = String(text); this.parentNode = null; }
  get textContent() { return this.nodeValue; }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get isConnected() { return Boolean(this.parentNode?.isConnected); }
  contains(node) { return node === this; }
  remove() { detach(this); }
}
function detach(node) {
  if (node.parentNode) {
    const nodes = node.parentNode.childNodes;
    nodes.splice(nodes.indexOf(node), 1); node.parentNode = null;
  }
}
function eventBoundary() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) {
      const entries = listeners.get(name); entries?.delete(listener);
      if (!entries?.size) listeners.delete(name);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
      return true;
    },
  };
}

export class FakeElement {
  constructor(tagName, text = '') {
    this.tagName = tagName.toUpperCase(); this.nodeType = 1; this.attributes = new Map();
    this.childNodes = []; this.parentNode = null; this.listeners = new Map();
    this.style = {}; this.rects = [{ x: 0, y: 0, width: 100, height: 20 }];
    this.checked = false; this.disabled = false;
    if (text) this.append(new FakeText(text));
  }
  get children() { return this.childNodes.filter(child => child.nodeType === 1); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get className() { return this.getAttribute('class') ?? ''; }
  get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
  set textContent(value) {
    for (const child of [...this.childNodes]) child.remove();
    if (value !== '') this.append(new FakeText(value));
  }
  get isConnected() { return this.tagName === 'HTML' || Boolean(this.parentNode?.isConnected); }
  get nextElementSibling() { const nodes = this.parentNode?.children ?? []; return nodes[nodes.indexOf(this) + 1] ?? null; }
  getClientRects() { return this.rects; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.childNodes.push(child); } }
  remove() { detach(this); }
  contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
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
    ...eventBoundary(), URL: url, location: { href: url }, documentElement: html, body, readyState: 'complete',
    defaultView: {
      getComputedStyle(node) {
        const block = /^(?:HTML|BODY|SECTION|DIV|PRE|P|DL|DT|DD|H2|TR|LI)$/.test(node.tagName);
        return { display: block ? 'block' : 'inline', visibility: 'visible', contentVisibility: 'visible', ...node.style };
      },
    },
    querySelectorAll: selector => html.querySelectorAll(selector),
    querySelector: selector => html.querySelector(selector),
    getElementById: id => {
      const visit = node => node.getAttribute('id') === id ? node : node.children.map(visit).find(Boolean);
      return visit(html) ?? null;
    },
    createElement: tag => element(tag), createTextNode: text => new FakeText(text),
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
  const timers = new Map(); const sent = []; const observers = [];
  const window = { ...eventBoundary(), location: { href: url }, navigation: null };
  const listeners = window.listeners;
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
