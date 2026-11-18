import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueUrl, pageIdentity } from '../../src/adapter/firebase.js';
import { validateIssue } from '../../src/domain/model.js';
import { ISSUE_URL, URL_BASE } from './fake-dom.js';

test('strict Android URL parsing normalizes query/hash and preserves event ID', () => {
  const issue = parseIssueUrl(`${ISSUE_URL}?noise=remove&eventId=synthetic-event&crashbridge-job=ignore#fragment`);
  assert.deepEqual(issue, { projectId: 'synthetic-project', appId: 'android:example.synthetic', issueId: 'synthetic-issue', title: null, url: `${ISSUE_URL}?eventId=synthetic-event` });
  assert.deepEqual(validateIssue(issue), issue);
  assert.equal(parseIssueUrl(`${ISSUE_URL}/`).url, ISSUE_URL);
  assert.equal(pageIdentity(URL_BASE).appId, 'android:example.synthetic');
});

test('unsupported origins, credentials, routes, ambiguous events and invalid IDs reject', () => {
  for (const url of [
    ISSUE_URL.replace('https:', 'http:'), ISSUE_URL.replace('console.firebase.google.com', 'console.firebase.google.com.evil.test'),
    ISSUE_URL.replace('https://', 'https://user@'), `${ISSUE_URL}/events/not-an-issue`, `${URL_BASE}/arbitrary-tail`,
    ISSUE_URL.replace('crashlytics', 'analytics'), ISSUE_URL.replace('android:example.synthetic', 'ios:example.synthetic'),
    ISSUE_URL.replace('/synthetic-issue', '/%2F'), ISSUE_URL.replace('/synthetic-issue', '/%E0%A4'),
    ISSUE_URL.replace('/synthetic-issue', `/${'x'.repeat(513)}`), `${ISSUE_URL}?eventId=`, `${ISSUE_URL}?eventId=a&eventId=b`,
    ISSUE_URL.replace('android:example.synthetic', 'android:'), 'not a URL', 'https://accounts.google.com/signin',
  ]) assert.equal(parseIssueUrl(url), null, url);
  assert.equal(pageIdentity('https://evil.test/project/a/crashlytics/app/android:b'), null);
  assert.equal(pageIdentity(`${URL_BASE}/arbitrary-tail`), null);
});
