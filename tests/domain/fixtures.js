import { createQueueItem } from '../../src/domain/model.js';
export const at = '2026-11-16T00:00:00.000Z';
export function issue(changes = {}) {
  return { projectId: 'demo-project', appId: 'android:example.synthetic', issueId: 'synthetic-issue', url: 'https://console.firebase.google.com/project/demo-project/crashlytics/app/android:example.synthetic/issues/synthetic-issue', title: 'Synthetic exception', ...changes };
}
export function capture(changes = {}) {
  return { issue: issue(), event: { eventId: null, identitySource: 'unavailable' }, capturedAt: at, eventTimestamp: null, selection: 'currently-displayed', source: 'rendered-dom', completeness: 'unknown', stacktrace: 'SyntheticError\n    at example.synthetic(Test.java:1)', appVersion: 'version-visible', versionCode: 'code-visible', osVersion: 'os-hidden', deviceModel: 'device-hidden', statistics: { events: 'events-hidden', users: 'users-hidden', timeRange: null }, warnings: ['Completeness unverified'], ...changes };
}
export function succeeded(changes = {}) {
  return { ...createQueueItem(issue()), status: 'succeeded', capture: capture(), ...changes };
}
