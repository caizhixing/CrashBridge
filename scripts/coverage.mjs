import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { files, requireFile } from './files.mjs';

/** Enumerate source files independently of the loaded-module report. */
export async function coverage(root = process.cwd()) {
  const domain = (await files(path.join(root, 'src', 'domain'))).filter(file => file.endsWith('.js'));
  if (!domain.length) throw new Error('No domain modules found');
  const queue = await requireFile(path.join(root, 'src', 'background', 'queue.js'));
  const stateModules = (await files(path.join(root, 'src', 'background'))).filter(file => file.endsWith('.js') && !file.endsWith('service-worker.js'));
  const tests = (await files(path.join(root, 'tests'))).filter(file => file.endsWith('.test.js'));
  if (!tests.length) throw new Error('No tests found');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'crashbridge-coverage-'));
  try {
    const output = path.join(temporary, 'events.jsonl');
    const handle = await open(output, 'w');
    let result;
    try {
      const reporter = new URL('./coverage-reporter.mjs', import.meta.url).href;
      const env = { ...process.env };
      delete env.NODE_V8_COVERAGE;
      delete env.NODE_TEST_CONTEXT;
      result = spawnSync(process.execPath, ['--experimental-test-coverage', '--test', `--test-reporter=${reporter}`, ...tests], {
        cwd: root, stdio: ['ignore', handle.fd, 'inherit'], env,
      });
    } finally {
      await handle.close();
    }
    if (result.error) throw result.error;
    const events = (await readFile(output, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const failures = events.filter(event => event.type === 'test:fail');
    for (const event of failures) console.error(JSON.stringify(event.data));
    const summary = events.find(event => event.type === 'test:coverage')?.data.summary;
    if (!summary || result.status !== 0 || failures.length) {
      for (const event of events.filter(event => event.type === 'test:diagnostic' || event.type === 'test:stderr')) console.error(event.data.message);
      throw new Error('Tests failed or native coverage report missing');
    }
    let failed = false;
    for (const file of [...domain, ...stateModules]) {
      const entry = summary.files.find(entry => path.resolve(entry.path) === path.resolve(file));
      const threshold = stateModules.includes(file) ? 90 : 100;
      const percent = entry ? entry.coveredLinePercent : 0;
      console.log(`${path.relative(root, file).replaceAll(path.sep, '/')}: ${percent.toFixed(2)}% lines (required ${threshold}%)${entry ? '' : ' — NOT LOADED'}`);
      if (!entry || percent < threshold || (threshold === 100 && entry.coveredLineCount !== entry.totalLineCount)) failed = true;
    }
    console.log('DOM/UI/Chrome glue: n/a (behavior tests still required)');
    if (failed) throw new Error('Per-file coverage gate failed');
    const summaryEvent = events.findLast(event => event.type === 'test:summary' && !event.data.file);
    console.log(`coverage: ${summaryEvent?.data.counts.passed ?? 0} tests passed`);
  } finally {
    // Only our mkdtemp-owned directory is removed; never a caller-provided path.
    if (path.dirname(temporary) !== os.tmpdir() || !path.basename(temporary).startsWith('crashbridge-coverage-')) throw new Error('Unexpected temporary path');
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  coverage().catch(error => { console.error(error.message); process.exitCode = 1; });
}
