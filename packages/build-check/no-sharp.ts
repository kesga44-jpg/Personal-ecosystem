import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

export function isSharpModule(id: string): boolean {
  return /(?:^|\/)node_modules\/(?:sharp|@img\/sharp-[^/]+)(?:\/|$)/.test(id.replaceAll('\\', '/'));
}

export function rejectSharpModules(): Plugin {
  return {
    name: 'reject-sharp-modules',
    generateBundle() {
      for (const id of this.getModuleIds()) {
        if (isSharpModule(id)) this.error(`Sharp/libvips module in app build: ${id}`);
      }
    }
  };
}

async function filesIn(directory: string, skipNestedModules = false): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (skipNestedModules && entry.name === 'node_modules') continue;
    if (entry.isDirectory()) files.push(...await filesIn(path, skipNestedModules));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unsupported entry while checking build output: ${path}`);
  }
  return files;
}

async function digest(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function assertNoSharpInDist(root: string): Promise<void> {
  const modules = join(root, 'node_modules');
  const img = join(modules, '@img');
  const sharpPackages = [
    join(modules, 'sharp'),
    ...(await readdir(img))
      .filter((name) => name.startsWith('sharp-'))
      .map((name) => join(img, name))
  ];
  const hashes = new Set<string>();
  for (const directory of sharpPackages) {
    for (const file of await filesIn(directory, true)) hashes.add(await digest(file));
  }
  for (const app of ['hub', 'sportapp', 'sidequest']) {
    const dist = join(root, 'apps', app, 'dist');
    if (!(await stat(join(dist, 'index.html'))).isFile()) {
      throw new Error(`Missing index.html in ${dist}`);
    }
    for (const file of await filesIn(dist)) {
      const name = relative(dist, file);
      if (/(?:sharp|libvips)/i.test(name) || hashes.has(await digest(file))) {
        throw new Error(`Sharp/libvips file in ${app} build: ${name}`);
      }
    }
  }
}
