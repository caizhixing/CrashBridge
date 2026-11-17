import { pageIdentity, parseIssueUrl } from './firebase.js';

export const MAX_SELECTION_BYTES = 262144;
const LIST = /^\/project\/[^/]+\/crashlytics\/app\/android:[^/]+(?:\/issues\/?)?$/;
export const RESOLVE_HASH = /^#crashbridge-resolve=([\da-f-]{36})$/i;

/** List navigation preserves filters, never credentials or an arbitrary route. */
export function listUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://console.firebase.google.com' || url.username || url.password || !LIST.test(url.pathname) || !pageIdentity(value) || (url.hash && !RESOLVE_HASH.test(url.hash)) || value.length > 8192) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

/** Temporary descriptors are not IssueRefs and are never deduplication identities. */
export function validateSelection(payload) {
  if (!payload || new TextEncoder().encode(JSON.stringify(payload)).length > MAX_SELECTION_BYTES) throw new Error('Selection payload too large or invalid.');
  const url = listUrl(payload.listUrl);
  if (!url || url !== payload.listUrl || !Array.isArray(payload.snapshot) || !payload.snapshot.length || payload.snapshot.length > 100 || !Array.isArray(payload.selected) || !payload.selected.length || payload.selected.length > 100) throw new Error('Unsupported list selection.');
  const snapshot = payload.snapshot.map(row => {
    if (!row || typeof row.title !== 'string' || !row.title.trim() || row.title.length > 1000 || typeof row.subtitle !== 'string' || row.subtitle.length > 2000 || typeof row.href !== 'string' || row.href.length > 8192 || !Number.isInteger(row.cells) || row.cells < 1 || row.cells > 100) throw new Error('Invalid row descriptor.');
    if (row.href !== '#') {
      const issue = parseIssueUrl(row.href); const source = pageIdentity(url);
      if (!issue || issue.projectId !== source.projectId || issue.appId !== source.appId) throw new Error('Invalid row link.');
    }
    return { title: row.title, subtitle: row.subtitle, href: row.href, cells: row.cells };
  });
  const selected = [...new Set(payload.selected)];
  if (selected.length !== payload.selected.length || selected.some(index => !Number.isInteger(index) || index < 0 || index >= snapshot.length)) throw new Error('Invalid selected row indices.');
  for (const index of selected) if (snapshot.filter(row => JSON.stringify(row) === JSON.stringify(snapshot[index])).length !== 1) throw new Error('Ambiguous row fingerprint.');
  return { listUrl: url, snapshot, selected };
}

function visibleText(document, element) {
  if (!element || !element.isConnected) return '';
  for (let node = element; node?.nodeType === 1; node = node.parentElement) {
    const style = document.defaultView.getComputedStyle(node);
    if (node.hidden || node.getAttribute('aria-hidden') === 'true' || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.contentVisibility === 'hidden') return '';
  }
  if (!element.getClientRects().length) return '';
  const walk = node => node.nodeType === 3 ? node.nodeValue ?? '' : visibleText(document, node);
  return [...element.childNodes].map(walk).join(' ').replace(/\s+/g, ' ').trim();
}

/** Only the observed caption structure; native checkbox/state controls are never read. */
export function readList(document, url) {
  if (!listUrl(url)) return [];
  const rows = [...document.querySelectorAll('tr[role="row"]')].filter(row => row.className.split(/\s+/).includes('data-row'));
  if (rows.length > 100) throw new Error('List snapshot exceeds 100 rows.');
  return rows.map(row => {
    const anchors = row.querySelectorAll('td[role="gridcell"] [data-test-id="issue-caption-table-cell"] a[href]');
    if (anchors.length !== 1 || !anchors[0].className.split(/\s+/).includes('link-wrapper')) throw new Error('Unsupported caption structure.');
    const anchor = anchors[0];
    const titles = anchor.querySelectorAll('[data-test-id="titleWrapper"] span[class~="copy-target"]');
    const subtitles = anchor.querySelectorAll('[data-test-id="subtitleWrapper"] span[class~="copy-target"]');
    if (titles.length !== 1 || subtitles.length > 1) throw new Error('Ambiguous caption structure.');
    const href = anchor.getAttribute('href');
    return { row, anchor, descriptor: { title: visibleText(document, titles[0]), subtitle: subtitles.length ? visibleText(document, subtitles[0]) : '', href: href === '#' ? '#' : new URL(href, url).href, cells: row.querySelectorAll('td[role="gridcell"]').length } };
  });
}

/** Re-read immediately before clicking; no row index fallback when the snapshot changed. */
export function matchRow(document, url, payload) {
  const selection = validateSelection({ listUrl: listUrl(url), snapshot: payload.snapshot, selected: [payload.index] });
  const rows = readList(document, url);
  if (JSON.stringify(rows.map(row => row.descriptor)) !== JSON.stringify(selection.snapshot)) throw new Error('List snapshot changed; refresh and select again.');
  return rows[payload.index].anchor;
}
