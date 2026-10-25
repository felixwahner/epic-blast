import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { renderServiceWorker } from '../../build/pwa-plugin.ts';

const version = (source: string) => source.match(/PREFIX \+ '([0-9a-f]{16})'/)![1];

describe('service worker generation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epic-blast-sw-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const template = readFileSync(new URL('../../build/service-worker.template.js', import.meta.url), 'utf8');

  it('lists every output file except sw.js and fills both placeholders', () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, 'sw.js'), 'old');
    const output = renderServiceWorker(template, dir);
    assert(!output.includes('__VERSION__') && !output.includes('__ASSETS__') && !output.includes('__LAZY_ASSETS__'));
    assert(output.includes('["./assets/app.js","./index.html"]'));
    assert(!output.includes('./sw.js'));
  });

  it('caches world art on first use instead of on install', () => {
    writeFileSync(join(dir, 'assets', 'scene-Ab12_x.webp'), 'scene');
    writeFileSync(join(dir, 'assets', 'board-Cd34.webp'), 'board');
    const output = renderServiceWorker(template, dir);
    assert(output.includes('const ASSETS = ["./assets/app.js","./index.html"];'));
    assert(output.includes('const LAZY_ASSETS = ["./assets/board-Cd34.webp","./assets/scene-Ab12_x.webp"];'));
    rmSync(join(dir, 'assets', 'scene-Ab12_x.webp'));
    rmSync(join(dir, 'assets', 'board-Cd34.webp'));
  });

  it('changes the cache version when any asset changes', () => {
    const before = version(renderServiceWorker(template, dir));
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(2)');
    assert.notEqual(version(renderServiceWorker(template, dir)), before);
  });
});
