import { copyFile, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { files, inside } from './files.mjs';
import { check } from './check.mjs';

async function safeDestination(root, destination) {
  let current = destination;
  while (current !== root) {
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing linked output: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    current = path.dirname(current);
  }
}

/** Build only known inputs, never recursively delete dist or unrelated files. */
export async function build(root = process.cwd()) {
  root = path.resolve(root);
  await check(root);
  let count = 0;
  for (const directory of ['extension', 'src']) {
    const base = path.join(root, directory);
    for (const file of await files(base)) {
      const relative = path.relative(base, file);
      const destination = inside(root, path.join('dist', ...(directory === 'src' ? ['src'] : []), relative).replaceAll(path.sep, '/'));
      await safeDestination(root, destination);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(file, destination);
      count++;
    }
  }
  console.log(`build: copied ${count} files to dist (unrelated files retained)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build().catch(error => { console.error(error.message); process.exitCode = 1; });
}
