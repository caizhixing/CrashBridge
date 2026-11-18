import { validateSelection, listUrl } from '../adapter/selection.js';
import { pageIdentity, parseIssueUrl } from '../adapter/firebase.js';

const envelope = (type, payload = {}) => ({ namespace: 'crashbridge', version: 1, type, payload });
const fail = (code, message) => ({ ok: false, error: { code, message } });
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

/** Independent session-only resolver; queue schema and IssueRef identity remain unchanged. */
export function createResolver(platform, controller) {
  let state = null;
  let recoveryError = null;
  // Browser activation is recorded synchronously, before the serialized event tail.
  const intervened = new Set();
  let recovered = false;
  let opening = false;
  const takeover = active => Boolean(active?.intervened || intervened.has(active?.tabId));
  const interventionError = () => ({ code: 'unsupported', message: 'Temporary resolution tab was activated or taken over; no further navigation result is accepted. Close that tab and select again.' });
  const send = (tabId, message) => new Promise((resolve, reject) => {
    const timer = (platform.setTimeout ?? globalThis.setTimeout)(() => reject(new Error('Content response timeout.')), 5000);
    Promise.resolve().then(() => {
      if (message.type === 'RESOLVE_ROW' && takeover(state?.active)) throw new Error('Resolution tab was activated.');
      return platform.send(tabId, message);
    }).then(resolve, reject).finally(() => (platform.clearTimeout ?? globalThis.clearTimeout)(timer));
  });
  let tail = Promise.resolve();
  const serial = operation => { const result = tail.then(operation); tail = result.catch(() => {}); return result; };
  const result = () => ({ ok: true, data: state ? structuredClone({ running: state.running, results: state.results, error: state.error }) : { running: false, results: [], error: null } });
  const manager = { id: new URL(platform.extensionUrl('manager.html')).host, url: platform.extensionUrl('manager.html') };
  const own = sender => sender?.id === manager.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id);
  const source = sender => own(sender) && listUrl(sender.url) === state?.selection.listUrl && sender.tab.id === state?.sourceTab;
  const sameApp = url => JSON.stringify(pageIdentity(url)) === JSON.stringify(pageIdentity(state.selection.listUrl));

  async function save() {
    try { await platform.writeSession(state); return true; }
    catch { state.running = false; state.error = { code: 'storage-failed', message: 'Resolution session was not saved; stop and retry.' }; return false; }
  }
  async function cleanup(closed = false) {
    const active = state.active;
    if (!active) return true;
    try {
      await platform.clearAlarm(active.token);
      if (!closed) {
        const tab = await platform.getTab(active.tabId);
        if (tab) {
          if (takeover(active)) {
            active.intervened = true; state.running = false; state.error = interventionError(); return false;
          }
          // Firebase SPA may strip the resolve hash; compare origin+path+search.
          const basis = value => { const url = new URL(value); url.hash = ''; return url.href; };
          const safeList = basis(tab.url ?? '') === basis(active.url);
          const safeDetail = typeof active.resolvedUrl === 'string' && tab.url === active.resolvedUrl;
          if (tab.id !== active.tabId || (!safeList && !safeDetail)) throw new Error('unverified');
          await platform.close(active.tabId);
        }
      }
      state.active = null;
      return true;
    } catch {
      state.running = false;
      state.error = { code: 'unsupported', message: 'Cannot verify or clean up temporary resolution tab; batch stopped. The unverified tab was not closed.' };
      return false;
    }
  }
  async function recoverCleanup() {
    // In-memory intervention memory does not survive a restart, so recovery only
    // trusts the persisted token-bearing URL (or the already verified detail URL)
    // before closing; activation state is irrelevant for a tab we opened ourselves.
    const active = state.active;
    state.active = null;
    try {
      await platform.clearAlarm(active.token);
      const tab = await platform.getTab(active.tabId);
      const safeDetail = typeof active.resolvedUrl === 'string' && tab?.url === active.resolvedUrl;
      const basis = value => { const url = new URL(value); url.hash = ''; return url.href; };
      if (tab && (basis(tab.url ?? '') === basis(active.url) || safeDetail)) await platform.close(active.tabId);
    } catch { /* Best effort: a temp tab that cannot be re-verified stays open and never blocks the batch. */ }
  }
  async function next() {
    if (!state.running) return;
    const entry = state.results.find(entry => entry.status === 'pending');
    if (!entry) { state.running = false; await save(); return; }
    const token = platform.uuid();
    const url = new URL(state.selection.listUrl); url.hash = `crashbridge-resolve=${token}`;
    try {
      opening = true;
      let tabId;
      try { tabId = await platform.open(url.href); } finally { opening = false; }
      if (!Number.isInteger(tabId)) throw new Error('missing id');
      state.active = { tabId, token, url: url.href, index: entry.index, phase: 'loading', deadline: platform.now() + 60000 };
      entry.status = 'resolving';
      if (!await save()) { await cleanup(); return; }
      await platform.alarm(token, state.active.deadline);
    } catch {
      entry.status = 'failed'; entry.error = { code: 'unsupported', message: 'Cannot create resolution tab or timeout alarm; batch stopped.' };
      state.running = false; state.error = entry.error;
      await cleanup(); await save();
    }
  }
  async function finish(error, closed = false) {
    const entry = state.results.find(entry => entry.index === state.active.index);
    if (error && entry.status !== 'succeeded') { entry.status = 'failed'; entry.error = error; }
    if (!await cleanup(closed)) { await save(); return result(); }
    if (await save()) await next();
    return result();
  }
  async function recover() {
    try { state = await platform.readSession(); }
    catch { recoveryError = { code: 'storage-failed', message: 'Cannot read resolution session; reload extension before retrying.' }; return { ok: false, error: recoveryError }; }
    recovered = true;
    if (state !== null) {
      try {
        if (!plainObject(state)) throw new Error('Invalid session root.');
        const selection = validateSelection(state.selection);
        if (!Array.isArray(state.results) || state.results.length !== selection.selected.length || typeof state.running !== 'boolean' || !Number.isInteger(state.sourceTab) || !('active' in state) || state.results.some((entry, index) => entry.index !== selection.selected[index] || !['pending', 'resolving', 'succeeded', 'failed'].includes(entry.status))) throw new Error('Invalid session.');
        const active = state.active;
        if (active !== null) {
          if (!plainObject(active)) throw new Error('Invalid active task type.');
          const expected = new URL(selection.listUrl); expected.hash = `crashbridge-resolve=${active.token}`;
          const basis = value => { const url = new URL(value); url.hash = ''; return url.href; };
          if (!Number.isInteger(active.tabId) || active.tabId === state.sourceTab || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(active.token) || basis(active.url) !== basis(expected.href) || !selection.selected.includes(active.index) || !['loading', 'clicked'].includes(active.phase) || !Number.isFinite(active.deadline)) throw new Error('Invalid active task.');
          if (active.resolvedUrl && (!parseIssueUrl(active.resolvedUrl) || !sameApp(active.resolvedUrl))) throw new Error('Invalid detail identity.');
        }
      } catch {
        recoveryError = { code: 'storage-failed', message: 'Unknown resolution session; original session was not overwritten.' };
        return { ok: false, error: recoveryError };
      }
    }
    if (state?.running || state?.active) {
      // An MV3 service worker can suspend at any await; a restart is not user
      // cancellation. Resume the batch from the persisted phase instead of voiding it.
      state.error = null;
      const active = state.active;
      if (active) {
        const entry = state.results.find(entry => entry.index === active.index);
        if (active.phase === 'clicked' && typeof active.resolvedUrl === 'string') {
          // resolvedUrl is persisted only after updated() verified the detail route
          // live, so this row was already resolved; only bookkeeping was interrupted.
          if (entry.status === 'resolving') { entry.status = 'succeeded'; entry.error = null; }
        } else if (entry.status === 'resolving') {
          // The content-script handshake (RESOLVER_READY) is sent once and is not
          // replayed after a restart, so the in-flight row can only be retried.
          entry.status = 'failed';
          entry.error = { code: 'cancelled', message: 'Extension restarted during resolution; select again to retry this row.' };
        }
        await recoverCleanup();
      }
      await save();
      await next();
    }
    return result();
  }
  async function handle(message, sender) {
    try {
      if (recoveryError) return { ok: false, error: recoveryError };
      if (message?.namespace !== 'crashbridge' || message.version !== 1 || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload) || new TextEncoder().encode(JSON.stringify(message)).length > 262144) throw new Error('Invalid resolver protocol or payload.');
      if (!own(sender) || !listUrl(sender.url) && !parseIssueUrl(sender.url)) throw new Error('Invalid resolver sender/frame.');
      if (message.type === 'RESOLVE_SELECTION') {
        if (state?.running || state?.active) throw new Error('Resolution already active; inspect or cancel before retrying.');
        const selection = validateSelection(message.payload);
        if (listUrl(sender.url) !== selection.listUrl || sender.url !== selection.listUrl) throw new Error('List source mismatch.');
        const queue = await controller.handle(envelope('GET_STATE'), manager);
        if (!queue.ok || queue.data.running || queue.data.active) throw new Error('Capture is active or unavailable.');
        state = { sourceTab: sender.tab.id, selection, running: true, results: selection.selected.map(index => ({ index, status: 'pending', error: null })), active: null, error: null };
        if (await save()) await next();
        return result();
      }
      if (message.type === 'GET_RESOLUTION' || message.type === 'CANCEL_RESOLUTION') {
        if (Object.keys(message.payload ?? {}).length || (state ? !source(sender) : !listUrl(sender.url))) throw new Error('Resolution source mismatch.');
        if (!state) return result();
        if (message.type === 'CANCEL_RESOLUTION') {
          state.running = false;
          const error = { code: 'cancelled', message: 'Resolution cancelled; select again to retry.' };
          for (const entry of state.results) if (['pending', 'resolving'].includes(entry.status)) { entry.status = 'failed'; entry.error = error; }
          await cleanup(); await save();
        }
        return result();
      }
      if (message.type === 'RESOLVER_READY') {
        const active = state?.active;
        if (!active || !state.running || sender.tab.id !== active.tabId || message.payload?.token !== active.token || Object.keys(message.payload).length !== 1) throw new Error('Resolution tab/token mismatch.');
        if (active.phase !== 'loading') return result();
        let tab;
        let original;
        try { tab = await platform.getTab(active.tabId); original = await platform.getTab(state.sourceTab); }
        catch { state.running = false; state.error = { code: 'unsupported', message: 'Cannot query resolution/source tab; batch stopped.' }; return finish(state.error); }
        // Firebase SPA strips the resolve hash after load; compare origin+path+search only.
        const urlBasis = value => { const url = new URL(value); url.hash = ''; return url.href; };
        if (!tab || urlBasis(tab.url ?? '') !== urlBasis(active.url) || takeover(active)) { active.intervened = true; state.running = false; state.error = interventionError(); await save(); return result(); }
        if (original?.url !== state.selection.listUrl) return finish({ code: 'unsupported', message: 'Original list route changed; select again.' });
        try {
          const checked = await send(state.sourceTab, envelope('CHECK_SELECTION', { snapshot: state.selection.snapshot, index: active.index }));
          if (!checked?.ok) return finish({ code: 'unsupported', message: 'Original list snapshot changed; select again.' });
        } catch { return finish({ code: 'unsupported', message: 'Original list content unavailable; refresh Firebase.' }); }
        active.phase = 'clicked';
        if (!await save()) { await cleanup(); return result(); }
        try {
          const beforeClick = await platform.getTab(active.tabId);
          const clickUrlBasis = value => { const url = new URL(value); url.hash = ''; return url.href; };
          if (takeover(active) || !beforeClick || clickUrlBasis(beforeClick.url ?? '') !== clickUrlBasis(active.url)) {
            active.intervened = true; state.running = false; state.error = interventionError(); await save(); return result();
          }
          const reply = await send(active.tabId, envelope('RESOLVE_ROW', { token: active.token, snapshot: state.selection.snapshot, index: active.index }));
          if (!reply?.ok) return finish({ code: 'unsupported', message: 'List snapshot changed, ambiguous, or unsupported; refresh and select again.' });
        } catch { return finish({ code: 'unsupported', message: 'Resolution content unavailable; reload the extension and refresh Firebase.' }); }
        return result();
      }
      throw new Error('Unknown resolver message.');
    } catch (error) { return fail('unsupported', error.message); }
  }
  async function updated(tabId, url) {
    if (!state?.running || state.active?.tabId !== tabId || state.active.phase !== 'clicked') return result();
    const issue = parseIssueUrl(url);
    if (!issue) {
      if (url === state.active.url) return result();
      return finish({ code: /^https:\/\/accounts\.google\.com\//.test(url) ? 'login-required' : 'unsupported', message: 'Resolution navigated outside the supported detail route.' });
    }
    if (!sameApp(url)) return finish({ code: 'unsupported', message: 'Resolved project/app does not match the source list.' });
    try {
      const tab = await platform.getTab(tabId);
      if (takeover(state.active)) {
        state.active.intervened = true; state.running = false; state.error = interventionError(); await save(); return result();
      }
      if (tab?.url !== url || tab.id !== tabId) throw new Error('unverified');
      state.active.resolvedUrl = url;
      if (!await save()) { await cleanup(); return result(); }
      const original = await platform.getTab(state.sourceTab);
      if (original?.url !== state.selection.listUrl) return finish({ code: 'unsupported', message: 'Original list changed before resolution completed.' });
      try {
        const checked = await send(state.sourceTab, envelope('CHECK_SELECTION', { snapshot: state.selection.snapshot, index: state.active.index }));
        if (!checked?.ok) return finish({ code: 'unsupported', message: 'Original list snapshot changed before resolution completed.' });
      } catch { return finish({ code: 'unsupported', message: 'Original list content unavailable before saving resolution.' }); }
      if (takeover(state.active)) { state.active.intervened = true; state.running = false; state.error = interventionError(); await save(); return result(); }
      const response = await controller.handle(envelope('ADD_ISSUES', { issues: [issue] }), { id: manager.id, frameId: 0, tab: { id: tabId }, url });
      const entry = state.results.find(entry => entry.index === state.active.index);
      if (!response.ok) {
        if (response.error.code === 'storage-failed') { state.running = false; state.error = response.error; }
        return finish(response.error);
      }
      entry.status = 'succeeded'; entry.added = response.added; entry.duplicates = response.duplicates;
      return finish(null);
    } catch {
      state.running = false;
      return finish({ code: 'unsupported', message: 'Cannot verify resolved tab URL; batch stopped.' });
    }
  }
  return {
    activated: tabId => {
      if (!recovered || opening || state?.active?.tabId === tabId) intervened.add(tabId);
      return serial(async () => {
        if (!recovered) return result();
        if (state?.active?.tabId === tabId) {
          state.active.intervened = true; state.running = false; state.error = interventionError();
          const entry = state.results.find(entry => entry.index === state.active.index);
          if (entry.status !== 'succeeded') { entry.status = 'failed'; entry.error = state.error; }
          await save();
        }
        return result();
      });
    },
    recover: () => serial(recover),
    handle: (message, sender) => serial(() => handle(message, sender)),
    updated: (tabId, url) => serial(() => updated(tabId, url)),
    closed: tabId => serial(() => state?.active?.tabId === tabId ? finish({ code: 'tab-closed', message: 'Temporary resolution tab was closed.' }, true) : result()),
    timeout: token => serial(() => state?.running && state.active?.token === token && platform.now() >= state.active.deadline ? finish({ code: 'timeout', message: 'Resolution exceeded 60 seconds.' }) : result()),
    busy: () => Boolean(recoveryError || state?.running || state?.active),
  };
}
