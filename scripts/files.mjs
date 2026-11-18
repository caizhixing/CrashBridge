import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not build inputs: ${file}`);
    if (entry.isDirectory()) found.push(...await files(file));
    else if (entry.isFile()) found.push(file);
  }
  return found.sort();
}

export async function requireFile(file) {
  if (!(await lstat(file)).isFile()) throw new Error(`Not a regular file: ${file}`);
  return file;
}

export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes('\0')) throw new Error('Invalid local reference');
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error(`Reference escapes root: ${relative}`);
  return file;
}

export async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}
