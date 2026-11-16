import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { files, requireFile, inside, json } from './files.mjs';

const firebase = 'https://console.firebase.google.com/*';

export async function check(root = process.cwd()) {
  const source = await files(path.join(root, 'src'));
  const extension = await files(path.join(root, 'extension'));
  const scripts = await files(path.join(root, 'scripts'));
  const tests = await files(path.join(root, 'tests'));
  const virtual = reference => reference.startsWith('src/') ? inside(root, reference) : inside(path.join(root, 'extension'), reference);
  const local = (file, reference) => {
    const target = path.resolve(path.dirname(file), reference);
    const extensionRoot = path.join(root, 'extension');
    if (target.startsWith(extensionRoot + path.sep)) return virtual(path.relative(extensionRoot, target).replaceAll(path.sep, '/'));
    if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Resource escapes root');
    return target;
  };
  for (const file of [...source, ...extension, ...scripts, ...tests]) {
    if (!/\.(?:m?js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Syntax check failed: ${file}`);
  }
  const manifest = await json(path.join(root, 'extension', 'manifest.json'));
  if (manifest.manifest_version !== 3 || manifest.background?.type !== 'module' || manifest.background?.service_worker !== 'src/background/service-worker.js') throw new Error('Invalid MV3 background');
  const permissions = manifest.permissions;
  if (!Array.isArray(permissions) || permissions.length !== 3 || new Set(permissions).size !== 3 || permissions.some(p => !['storage', 'alarms', 'downloads'].includes(p))) throw new Error('Unexpected permissions');
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify([firebase]) || manifest.optional_permissions?.length || manifest.optional_host_permissions?.length) throw new Error('Unexpected host permissions');
  if (manifest.action?.default_popup) throw new Error('Action must open manager, not a popup');
  await requireFile(virtual(manifest.background.service_worker));
  if (!Array.isArray(manifest.content_scripts) || !manifest.content_scripts.length) throw new Error('Missing content scripts');
  for (const content of manifest.content_scripts) {
    if (JSON.stringify(content.matches) !== JSON.stringify([firebase])) throw new Error('Unexpected content host');
    for (const reference of [...(content.js ?? []), ...(content.css ?? [])]) await requireFile(virtual(reference));
  }
  for (const group of manifest.web_accessible_resources ?? []) {
    if (JSON.stringify(group.matches) !== JSON.stringify([firebase])) throw new Error('Unexpected resource host');
    for (const resource of group.resources) {
      if (!/^src\/(content|adapter|domain)\//.test(resource)) throw new Error('Unexpected public resource');
      if (resource.includes('*')) {
        const prefix = resource.slice(0, resource.indexOf('*'));
        if (!source.some(file => path.relative(root, file).replaceAll(path.sep, '/').startsWith(prefix))) throw new Error(`Missing resource: ${resource}`);
      } else await requireFile(virtual(resource));
    }
  }
  for (const reference of Object.values(manifest.icons ?? {})) await requireFile(virtual(reference));
  for (const reference of Object.values(manifest.action?.default_icon ?? {})) await requireFile(virtual(reference));
  for (const file of [...source, ...extension]) {
    const content = await readFile(file, 'utf8');
    if (/\.(?:m?js)$/.test(file)) {
      const references = [...content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)];
      for (const [, reference] of references) {
        if (!reference.startsWith('.')) throw new Error(`Non-local module: ${reference}`);
        await requireFile(local(file, reference));
      }
    }
    if (file.endsWith('.html')) {
      for (const [, reference] of content.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
        if (/^(?:[a-z]+:|\/\/)/i.test(reference)) throw new Error('Remote executable resource');
        await requireFile(local(file, reference));
      }
    }
  }
  console.log(`check: ${source.length + extension.length} extension/source files verified`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  check().catch(error => { console.error(error.message); process.exitCode = 1; });
}
