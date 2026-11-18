import { LIMITS, issueKey, validateQueueItem, createQueueItem } from '../domain/model.js';
import { parseMessage } from '../domain/protocol.js';
import { parseIssueUrl } from '../adapter/firebase.js';

/** @typedef {ReturnType<typeof createQueueItem>} QueueItem */
/** @typedef {{code:string,message:string}} QueueError */
/** @typedef {{key:string,tabId:number,jobId:string,url:string,deadline:string}} ActiveTask */
/** @typedef {{schemaVersion:1,items:QueueItem[],active:ActiveTask|null,running:boolean,lastError:QueueError|null}} State */
/** @typedef {{id?:string,url?:string,tab?:{id?:number}}} Sender */
/** @typedef {{ok:true,data:State}|{ok:false,error:QueueError}} Response */
/**
 * @typedef {object} Platform
 * @property {()=>Promise<object|null>} read
 * @property {(state:State)=>Promise<void>} write
 * @property {(url:string)=>Promise<number>} open
 * @property {(tabId:number)=>Promise<void>} close
 * @property {(tabId:number)=>Promise<{id:number,url?:string}|null>} getTab
 * @property {(name:string,when:number)=>Promise<void>} alarm
 * @property {(name:string)=>Promise<void>} clearAlarm
 * @property {()=>string} now ISO timestamp.
 * @property {()=>string} uuid
 * @property {(path:string)=>string} extensionUrl
 */

/**
 * A single-writer controller. Platform I/O is deliberately inside the serial
 * section: queued cancellation cannot be overtaken by an old browser callback.
 * @param {Platform} platform Frozen platform port from docs/contracts.md.
 * @returns {{handle:(message:unknown,sender?:Sender)=>Promise<Response>,recover:()=>Promise<Response>}}
 */
export function createController(platform) {
  let state = emptyState();
  let loaded = false;
  let locked = false;
  let tail = Promise.resolve();
  const snapshot = () => structuredClone(state);
  const serialize = (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  const problem = (code, message) => ({ code, message });
  const failure = (error) => ({ ok: false, error });
  const success = () => ({ ok: true, data: snapshot() });
  const report = (code, message) => {
    state.lastError = problem(code, message);
    state.running = false;
    return state.lastError;
  };

  async function save() {
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
      if (bytes > LIMITS.maxStorageBytes) throw new Error('Local queue exceeds the 4 MiB UTF-8 budget.');
      await platform.write(snapshot());
      return true;
    } catch (error) {
      report('storage-failed', `Queue not saved: ${error.message}`);
      return false;
    }
  }

  function sameTab(tab, active) {
    const item = state.items.find((entry) => entry.key === active.key);
    if (!item || tab?.id !== active.tabId) return false;
    const issue = parseIssueUrl(item.issue.url);
    if (!issue) return false;
    const tabIssue = parseIssueUrl(tab.url ?? '');
    return tabIssue ? issueKey(tabIssue) === issueKey(issue) : false;
  }

  async function cleanup(active, alreadyClosed = false) {
    let clean = true;
    try {
      await platform.clearAlarm(active.jobId);
    } catch (error) {
      report('unsupported', `Cannot clear capture alarm: ${error.message}`);
      clean = false;
    }
    if (!alreadyClosed) {
      try {
        const tab = await platform.getTab(active.tabId);
        if (tab && (typeof tab.url !== 'string' || !tab.url)) {
          throw new Error('Capture tab URL unavailable; cannot verify cleanup identity.');
        }
        if (sameTab(tab, active)) await platform.close(active.tabId);
      } catch (error) {
        report('unsupported', `Cannot clean up capture tab: ${error.message}`);
        clean = false;
      }
    }
    return clean;
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const stored = await platform.read();
      if (stored === null || stored === undefined) return;
      if (stored.schemaVersion !== 1 || !Array.isArray(stored.items)
          || typeof stored.running !== 'boolean' || !('active' in stored)) {
        throw new Error('Unsupported or invalid storage schema; original storage is unchanged.');
      }
      const keys = new Set();
      for (const item of stored.items) {
        validateQueueItem(item);
        if (keys.has(item.key)) {
          throw new Error('Invalid stored queue item; original storage is unchanged.');
        }
        keys.add(item.key);
      }
      if (stored.items.length > LIMITS.maxIssues) throw new Error('Stored queue exceeds issue limit.');
      const active = stored.active;
      if (active !== null && (!keys.has(active.key) || !Number.isInteger(active.tabId)
          || typeof active.jobId !== 'string' || !active.jobId
          || typeof active.url !== 'string' || !Number.isFinite(Date.parse(active.deadline)))) {
        throw new Error('Invalid stored capture task; original storage is unchanged.');
      }
      state = structuredClone(stored);
    } catch (error) {
      locked = true;
      report('storage-failed', `Cannot restore queue: ${error.message}`);
    }
  }

  async function recoverNow() {
    if (loaded) return locked ? failure(state.lastError) : success();
    await load();
    if (locked) return failure(state.lastError);
    const active = state.active;
    state.active = null;
    state.running = false;
    for (const item of state.items) {
      if (item.status === 'collecting') {
        item.status = 'cancelled';
        item.capture = null;
        item.error = problem('cancelled', 'Capture interrupted by extension restart.');
      }
    }
    if (active && !await cleanup(active)) state.active = active;
    const saved = await save();
    return saved && !state.lastError ? success() : failure(state.lastError);
  }

  async function cancel() {
    state.running = false;
    const active = state.active;
    state.active = null;
    if (active) {
      const item = state.items.find((entry) => entry.key === active.key);
      if (item.status === 'collecting') {
        item.status = 'cancelled';
        item.capture = null;
        item.error = problem('cancelled', 'Capture cancelled by user.');
      }
      const clean = await cleanup(active);
      if (!clean) state.active = active;
      return clean;
    }
    return true;
  }

  async function schedule() {
    if (!state.running || state.active) return true;
    const item = state.items.find((entry) => entry.status === 'pending');
    if (!item) {
      state.running = false;
      return save();
    }
    const jobId = platform.uuid();
    const url = captureUrl(item.issue.url, jobId);
    item.status = 'collecting';
    item.capture = null;
    item.error = null;
    if (!await save()) {
      item.status = 'cancelled';
      item.error = problem('storage-failed', 'Capture not started because queue was not saved.');
      return false;
    }
    let active = null;
    try {
      const tabId = await platform.open(url);
      if (!Number.isInteger(tabId)) throw new Error('Browser returned no capture tab ID.');
      active = {
        key: item.key, tabId, jobId, url,
        deadline: new Date(Date.parse(platform.now()) + LIMITS.timeoutMs).toISOString(),
      };
      state.active = active;
      if (!await save()) {
        state.active = null;
        item.status = 'cancelled';
        item.error = problem('storage-failed', 'Capture stopped because task identity was not saved.');
        if (!await cleanup(active)) state.active = active;
        return false;
      }
      await platform.alarm(jobId, Date.parse(active.deadline));
      return true;
    } catch (error) {
      state.active = null;
      item.status = 'failed';
      item.error = report('unsupported', `Cannot start capture: ${error.message}`);
      if (active && !await cleanup(active)) state.active = active;
      await save();
      return false;
    }
  }

  async function finish(error, capture, alreadyClosed = false) {
    const active = state.active;
    state.active = null;
    const item = state.items.find((entry) => entry.key === active.key);
    item.status = error ? 'failed' : 'succeeded';
    item.capture = error ? null : capture;
    item.error = error;
    const clean = await cleanup(active, alreadyClosed);
    if (!clean) state.active = active;
    if (!await save() || !clean) return false;
    return schedule();
  }

  function ownSender(sender) {
    const manager = new URL(platform.extensionUrl('manager.html'));
    return sender?.id === manager.host;
  }

  function managerSender(sender) {
    if (!ownSender(sender) || typeof sender.url !== 'string') return false;
    const expected = new URL(platform.extensionUrl('manager.html'));
    try {
      const actual = new URL(sender.url);
      return actual.protocol === expected.protocol && actual.host === expected.host
        && actual.pathname === expected.pathname && actual.search === '';
    } catch { return false; }
  }

  function firebaseSender(sender) {
    if (!ownSender(sender) || !Number.isInteger(sender.tab?.id) || sender.frameId !== 0) return null;
    try {
      const url = new URL(sender.url);
      if (url.origin !== 'https://console.firebase.google.com') return null;
      const match = /^\/project\/([^/]+)\/crashlytics\/app\/(android:[^/]+)(?:\/|$)/.exec(url.pathname);
      if (!match) return null;
      return { projectId: decodeURIComponent(match[1]), appId: decodeURIComponent(match[2]), url };
    } catch { return null; }
  }

  async function handleNow(raw, sender) {
    await recoverNow();
    if (locked) return failure(state.lastError);
    let message;
    const internal = raw?.namespace === 'crashbridge' && raw.version === 1
      && ['TIMEOUT', 'TAB_CLOSED'].includes(raw.type);
    try {
      if (internal) {
        if (sender !== undefined) throw new Error('Internal event cannot come from runtime.');
        message = raw;
      } else {
        message = parseMessage(raw);
      }
      const { type, payload } = message;
      if (type === 'TIMEOUT' || type === 'TAB_CLOSED') {
        const active = state.active;
        if (!active || !state.running || (type === 'TIMEOUT' ? payload?.jobId !== active.jobId : payload?.tabId !== active.tabId)) {
          throw new Error('Stale capture event.');
        }
        if (type === 'TIMEOUT' && Date.parse(platform.now()) < Date.parse(active.deadline)) {
          throw new Error('Capture deadline has not expired.');
        }
        const error = type === 'TIMEOUT'
          ? problem('timeout', 'Capture exceeded the 60 second deadline.')
          : problem('tab-closed', 'Capture tab was closed.');
        return await finish(error, null, type === 'TAB_CLOSED') ? success() : failure(state.lastError);
      }
      if (type === 'ADD_ISSUES') {
        const source = firebaseSender(sender);
        if (!source || payload.issues.some((issue) => issue.projectId !== source.projectId || issue.appId !== source.appId)) {
          throw new Error('Issue source sender/project/app mismatch.');
        }
        const keys = new Set(state.items.map((item) => item.key));
        const additions = [];
        for (const issue of payload.issues) {
          const key = issueKey(issue);
          if (!keys.has(key)) { additions.push(createQueueItem(issue)); keys.add(key); }
        }
        if (state.items.length + additions.length > LIMITS.maxIssues) throw new Error('Queue limit is 100 issues.');
        state.items.push(...additions);
        if (!await save()) return failure(state.lastError);
        return { ...success(), added: additions.length, duplicates: payload.issues.length - additions.length };
      } else if (type === 'CAPTURE_RESULT') {
        const active = state.active;
        const source = firebaseSender(sender);
        if (!source || !active || !state.running || sender.tab.id !== active.tabId || payload.jobId !== active.jobId
            || payload.issueKey !== active.key) {
          throw new Error('Capture sender/tab/job/issue mismatch.');
        }
        if (payload.capture && issueKey(payload.capture.issue) !== active.key) throw new Error('Capture issue mismatch.');
        return await finish(payload.error, payload.capture) ? success() : failure(state.lastError);
      } else if (type === 'QUERY_ACTIVE_JOB') {
        const active = state.active;
        const source = firebaseSender(sender);
        if (!source || !active || !state.running || sender.tab.id !== active.tabId) {
          return { ok: true, data: null };
        }
        const item = state.items.find((entry) => entry.key === active.key);
        if (!item) return { ok: true, data: null };
        const activeIssue = parseIssueUrl(item.issue.url);
        if (!activeIssue || source.projectId !== activeIssue.projectId || source.appId !== activeIssue.appId) {
          return { ok: true, data: null };
        }
        return { ok: true, data: { jobId: active.jobId, issue: activeIssue } };
      } else {
        if (!managerSender(sender)) throw new Error('Only this extension manager can access the queue.');
        if (type === 'GET_STATE') return success();
        if (['START_CAPTURE', 'RETRY_FAILED'].includes(type)) {
          if (state.running || state.active) throw new Error('Capture is already running.');
          state.lastError = null;
          for (const item of state.items) {
            if ((type === 'START_CAPTURE' && item.status === 'cancelled')
                || (type === 'RETRY_FAILED' && item.status === 'failed')) {
              item.status = 'pending'; item.error = null; item.capture = null;
            }
          }
          state.running = true;
          return await schedule() ? success() : failure(state.lastError);
        }
        if (['CLEAR_QUEUE', 'REMOVE_ISSUE'].includes(type) && (state.running || state.active)) {
          throw new Error('Stop capture before changing the queue.');
        }
        state.lastError = null;
        if (['CANCEL_CAPTURE', 'CLEAR_QUEUE', 'REMOVE_ISSUE'].includes(type)) {
          if (!await cancel()) { await save(); return failure(state.lastError); }
          if (type === 'CLEAR_QUEUE') state.items = [];
          if (type === 'REMOVE_ISSUE') state.items = state.items.filter((item) => item.key !== payload.key);
        }
      }
      return await save() ? success() : failure(state.lastError);
    } catch (error) {
      return failure(problem('unsupported', error.message));
    }
  }

  return {
    handle: (message, sender) => serialize(() => handleNow(message, sender)),
    recover: () => serialize(recoverNow),
  };
}

function captureUrl(issueUrl, jobId) {
  const url = new URL(issueUrl);
  url.searchParams.set('crashbridge-job', jobId);
  return url.href;
}

function emptyState() {
  return { schemaVersion: 1, items: [], active: null, running: false, lastError: null };
}
