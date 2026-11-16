import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverIssues } from '../../src/adapter/firebase.js';
import { makeDocument, addIssueRow, ISSUE_URL, URL_BASE } from './fake-dom.js';

test('discovers real-style anchors, deduplicates same identity, excludes foreign projects/apps', () => {
  const document = makeDocument(URL_BASE);
  addIssueRow(document); addIssueRow(document, ISSUE_URL, 'Duplicate');
  addIssueRow(document, `${URL_BASE}/issues/second`, 'Second');
  addIssueRow(document, ISSUE_URL.replace('synthetic-project', 'foreign-project'));
  addIssueRow(document, ISSUE_URL.replace('example.synthetic', 'other.app'));
  addIssueRow(document, 'https://evil.test/issues/foreign');
  const issues = discoverIssues(document, URL_BASE);
  assert.deepEqual(issues.map(issue => issue.issueId), ['synthetic-issue', 'second']);
  assert.equal(issues[0].title, 'Synthetic crash');
  assert.deepEqual(discoverIssues(document, 'https://evil.test'), []);
});

test('relative links resolve only against a supported Firebase page', () => {
  const document = makeDocument(URL_BASE);
  addIssueRow(document, '/project/synthetic-project/crashlytics/app/android:example.synthetic/issues/relative', '');
  assert.equal(discoverIssues(document, URL_BASE)[0].title, null);
  assert.equal(discoverIssues(document, URL_BASE)[0].issueId, 'relative');
});
