import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNoSharpInDist, isSharpModule } from './no-sharp';

describe('Sharp build protection', () => {
  let root = '';
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('recognises Sharp and libvips module paths', () => {
    expect(isSharpModule('/repo/node_modules/sharp/lib/index.js')).toBe(true);
    expect(isSharpModule('C:\\repo\\node_modules\\@img\\sharp-libvips-linux-x64\\lib.node')).toBe(true);
    expect(isSharpModule('/repo/node_modules/other/index.js')).toBe(false);
  });

  it('rejects renamed copies of Sharp files in a build', async () => {
    root = await mkdtemp(join(tmpdir(), 'ecosystem-build-check-'));
    for (const dir of ['node_modules/sharp', 'node_modules/@img/sharp-libvips-test',
      'apps/hub/dist', 'apps/sportapp/dist', 'apps/sidequest/dist']) {
      await mkdir(join(root, dir), { recursive: true });
    }
    await writeFile(join(root, 'node_modules/sharp/source.js'), 'sharp source');
    await writeFile(join(root, 'node_modules/@img/sharp-libvips-test/library'), 'libvips binary');
    for (const app of ['hub', 'sportapp', 'sidequest']) {
      await writeFile(join(root, 'apps', app, 'dist', 'index.html'), 'app shell');
    }
    await expect(assertNoSharpInDist(root)).resolves.toBeUndefined();
    await writeFile(join(root, 'apps/hub/dist/copied.bin'), 'libvips binary');
    await expect(assertNoSharpInDist(root)).rejects.toThrow('Sharp/libvips file');
  });
});
