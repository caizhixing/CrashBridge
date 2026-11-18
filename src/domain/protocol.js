import { LIMITS, record, text, issueKey, validateIssue, validateCapture, validateError } from './model.js';

/** Validate untrusted runtime messages; sender authorization belongs to the controller. */
export function parseMessage(value) {
  const input = record(value);
  if (input.namespace !== 'crashbridge' || input.version !== 1) throw new Error('Invalid protocol version');
  const payload = record(input.payload);
  let normalized;
  switch (input.type) {
    case 'ADD_ISSUES': {
      if (!Array.isArray(payload.issues) || payload.issues.length > LIMITS.maxIssues) throw new Error('Invalid issues array');
      normalized = { issues: payload.issues.map(validateIssue) };
      break;
    }
    case 'REMOVE_ISSUE': {
      const key = text(payload.key, LIMITS.maxIdLength * 6 + 32);
      const parts = JSON.parse(key);
      if (!Array.isArray(parts) || parts.length !== 3 || parts.some(part => typeof part !== 'string' || !part.trim() || part.length > LIMITS.maxIdLength) || JSON.stringify(parts) !== key) throw new Error('Invalid issue key');
      normalized = { key };
      break;
    }
    case 'GET_STATE':
    case 'CLEAR_QUEUE':
    case 'START_CAPTURE':
    case 'RETRY_FAILED':
    case 'CANCEL_CAPTURE':
      if (Object.keys(payload).length !== 0) throw new Error('Expected empty payload');
      normalized = {};
      break;
    case 'CAPTURE_RESULT': {
      const jobId = text(payload.jobId, LIMITS.maxIdLength);
      const key = text(payload.issueKey, LIMITS.maxIdLength * 6 + 32);
      const capture = payload.capture === null ? null : validateCapture(payload.capture);
      const error = payload.error === null ? null : validateError(payload.error);
      if ((capture === null) === (error === null)) throw new Error('Expected capture or error');
      if (capture !== null && issueKey(capture.issue) !== key) throw new Error('Capture identity mismatch');
      const parts = JSON.parse(key);
      if (!Array.isArray(parts) || parts.length !== 3 || parts.some(part => typeof part !== 'string' || !part.trim() || part.length > LIMITS.maxIdLength) || JSON.stringify(parts) !== key) throw new Error('Invalid issue key');
      normalized = { jobId, issueKey: key, capture, error };
      break;
    }
    case 'QUERY_ACTIVE_JOB': {
      if (Object.keys(payload).length !== 0) throw new Error('Expected empty payload');
      normalized = {};
      break;
    }
    default: throw new Error('Unknown runtime message type');
  }
  const result = { namespace: 'crashbridge', version: 1, type: input.type, payload: normalized };
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > LIMITS.maxStorageBytes) throw new Error('Message too large');
  return result;
}
