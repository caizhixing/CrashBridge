import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const scripts = fileURLToPath(new URL('../../scripts/', import.meta.url));

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'crashbridge-script-test-'));
  const put = async (relative, content) => {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  try {
    await put('package.json', '{"type":"module"}');
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'tests'));
    await put('src/background/service-worker.js', '// synthetic glue\n');
    await put('src/content/main.js', '// synthetic content\n');
    await put('src/domain/model.js', 'export const value = 1;\n');
    await put('extension/manager.html', '<script type="module" src="manager.js"></script><link href="manager.css" rel="stylesheet">');
    await put('extension/manager.js', "import { value } from './src/domain/model.js';\nconsole.log(value);\n");
    await put('extension/manager.css', 'body { color: black; }');
    const manifest = { manifest_version: 3, name: 'Synthetic build fixture', version: '1.0.0', permissions: ['storage', 'alarms', 'downloads'], host_permissions: ['https://console.firebase.google.com/*'], background: { service_worker: 'src/background/service-worker.js', type: 'module' }, action: {}, content_scripts: [{ matches: ['https://console.firebase.google.com/*'], js: ['src/content/main.js'] }], web_accessible_resources: [{ matches: ['https://console.firebase.google.com/*'], resources: ['src/domain/*.js'] }] };
    await put('extension/manifest.json', JSON.stringify(manifest));
    const cli = name => spawnSync(process.execPath, [path.join(scripts, name + '.mjs')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    await run({ root, put, cli, manifest });
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('crashbridge-script-test-'));
    await rm(root, { recursive: true, force: true });
  }
}

function passed(result) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
function failed(result, pattern) {
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, 'must reject invalid fixture');
  assert.match(result.stdout + result.stderr, pattern);
}

test('CLI check verifies real syntax and manifest/module/HTML references; build preserves unknown files', async () => fixture(async ({ root, put, cli, manifest }) => {
  passed(cli('check'));
  await put('dist/user-owned.txt', 'retain me');
  await put('elsewhere/keep.txt', 'retain elsewhere');
  passed(cli('build'));
  assert.equal(await readFile(path.join(root, 'dist/user-owned.txt'), 'utf8'), 'retain me');
  assert.equal(await readFile(path.join(root, 'elsewhere/keep.txt'), 'utf8'), 'retain elsewhere');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'dist/manifest.json'), 'utf8')), manifest);
  assert.equal(await readFile(path.join(root, 'dist/src/domain/model.js'), 'utf8'), 'export const value = 1;\n');
  assert.equal(await readFile(path.join(root, 'dist/manager.js'), 'utf8'), await readFile(path.join(root, 'extension/manager.js'), 'utf8'));
  await put('src/domain/broken.js', 'export const = ;');
  failed(cli('check'), /Syntax check failed/);
  await put('src/domain/broken.js', 'export const valid = true;');
  await put('extension/manager.html', '<script src="missing.js"></script>');
  failed(cli('check'), /ENOENT/);
  await put('extension/manager.html', '<script src="https://remote.invalid/code.js"></script>');
  failed(cli('check'), /Remote executable/);
  await put('extension/manager.html', '<script src="manager.js"></script>');
  await put('extension/manager.js', "import './absent.js';");
  failed(cli('check'), /ENOENT/);
  await put('extension/manager.js', '');
  await put('extension/manifest.json', JSON.stringify({ ...manifest, permissions: [...manifest.permissions, 'cookies'] }));
  failed(cli('check'), /Unexpected permissions/);
  await put('extension/manifest.json', JSON.stringify({ ...manifest, content_scripts: [{ matches: ['https://console.firebase.google.com/*'], js: ['../outside.js'] }] }));
  failed(cli('build'), /escapes root/);
  assert.equal(await readFile(path.join(root, 'dist/user-owned.txt'), 'utf8'), 'retain me');
}));

test('CLI build fails honestly when other task files have not arrived', async () => fixture(async ({ root, cli }) => {
  const manifest = path.resolve(root, 'extension/manifest.json');
  assert.ok(manifest.startsWith(root + path.sep));
  await rm(manifest);
  failed(cli('build'), /manifest.json/);
  await assert.rejects(lstat(path.join(root, 'dist')), { code: 'ENOENT' });
}));

test('CLI coverage uses native per-file reports, rejects unloaded domain and queue modules, and propagates test failures', async () => fixture(async ({ put, cli }) => {
  await put('src/background/queue.js', 'export const value = 2;\n');
  await put('tests/synthetic.test.js', "import { value } from '../src/domain/model.js';\nimport { value as queue } from '../src/background/queue.js';\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('real imports', () => assert.equal(value + queue, 3));\n");
  const green = cli('coverage');
  passed(green);
  assert.match(green.stdout, /src\/domain\/model.js: 100.00% lines \(required 100%\)/);
  assert.match(green.stdout, /src\/background\/queue.js: 100.00% lines \(required 90%\)/);
  await put('src/domain/unloaded.js', 'export function neverLoaded() {\n  return 1;\n}\n');
  failed(cli('coverage'), /unloaded.js: 0.00%.*NOT LOADED/);
  await put('tests/synthetic.test.js', "import '../src/domain/unloaded.js';\nimport { value } from '../src/domain/model.js';\nimport { value as queue } from '../src/background/queue.js';\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('real imports', () => assert.equal(value + queue, 3));\n");
  failed(cli('coverage'), /unloaded.js: (?!100.00)[\d.]+%.*required 100%/);
  await put('src/domain/unloaded.js', 'export const loaded = 1;\n');
  passed(cli('coverage'));
  await put('src/background/queue.js', 'export const value = 2;\nexport function notExercised() {\n  let count = 0;\n  count++;\n  count++;\n  count++;\n  count++;\n  count++;\n  return count;\n}\n');
  failed(cli('coverage'), /queue.js: (?!100.00)[\d.]+%.*required 90%/);
  await put('src/background/queue.js', 'export const value = 2;\n');
  await put('tests/synthetic.test.js', "import { value } from '../src/domain/model.js';\nimport { loaded } from '../src/domain/unloaded.js';\nimport test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('domain only', () => assert.equal(value + loaded, 2));\n");
  failed(cli('coverage'), /queue.js: 0.00%.*NOT LOADED/);
  await put('tests/synthetic.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('failure propagation', () => assert.equal(1, 2));\n");
  failed(cli('coverage'), /Tests failed/);
}));
