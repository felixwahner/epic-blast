// Generates dist/sw.js from the service worker template after every build.
// The cache version is a content hash of all output files, so any change to
// an asset automatically creates a new cache.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

export function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]);
}

/**
 * World scenery and board art is only needed once a world appears, so it is cached
 * on first use instead of being downloaded for all worlds when the app installs.
 */
export const isLazyAsset = (path: string): boolean => /\/(scene|board)-[\w-]+\.webp$/.test(path);

/** Fills the template placeholders; exported for tests. */
export function renderServiceWorker(template: string, outDir: string): string {
  const files = listFiles(outDir).filter(file => !file.endsWith('sw.js')).sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(relative(outDir, file)).update(readFileSync(file));
  const version = hash.digest('hex').slice(0, 16);
  const paths = files.map(file => './' + relative(outDir, file).replaceAll('\\', '/'));
  return template
    .replace('__VERSION__', version)
    .replace('__ASSETS__', JSON.stringify(paths.filter(path => !isLazyAsset(path))))
    .replace('__LAZY_ASSETS__', JSON.stringify(paths.filter(isLazyAsset)));
}

export function pwaPlugin(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'epic-blast-pwa',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const template = readFileSync(join(root, 'build/service-worker.template.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, outDir));
    },
  };
}
