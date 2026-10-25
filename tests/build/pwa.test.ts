// Runs against the production build: `npm run test:build` builds first.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';

const dist = new URL('../../dist/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, dist), 'utf8');

type Handler = (event: Record<string, unknown>) => void;

describe('production PWA build', () => {
  it('precaches the build, serves an offline shell and removes old caches', async () => {
    const source = read('sw.js');
    assert(!source.includes('__VERSION__') && !source.includes('__ASSETS__') && !source.includes('__LAZY_ASSETS__'));
    const handlers: Record<string, Handler> = {};
    const scope = 'https://example.com/games/blast/';
    const deleted: string[] = [];
    let precached: Request[] = [];
    let claimed = false, skipped = false, online = true;
    const cache = { addAll: async (requests: Request[]) => { precached = requests; }, match: async () => new Response('offline shell') };
    vm.runInNewContext(source, {
      self: {
        skipWaiting: async () => { skipped = true; }, registration: { scope }, location: { origin: 'https://example.com' },
        clients: { claim: async () => { claimed = true; } }, addEventListener: (name: string, fn: Handler) => { handlers[name] = fn; },
      },
      caches: { open: async () => cache, keys: async () => [`epic-blast-${scope}-old`, 'unrelated-cache'], delete: async (key: string) => { deleted.push(key); } },
      URL, Request, Response,
      fetch: async (request: Request) => {
        assert.equal(request.cache, 'no-store');
        if (!online) throw new Error('Offline');
        return new Response('new shell');
      },
    });

    let pending: Promise<unknown> = Promise.resolve();
    const waitUntil = (promise: Promise<unknown>) => { pending = promise; };
    handlers.install({ waitUntil });
    await pending;
    assert(skipped);
    assert(precached.length >= 8);
    for (const request of precached) {
      assert.equal(request.cache, 'reload');
      assert(request.url.startsWith(scope));
      assert(existsSync(new URL(request.url.slice(scope.length), dist)), request.url);
    }
    assert(precached.some(request => /PressStart2P.*\.ttf$/.test(request.url)), 'the font is precached');

    handlers.activate({ waitUntil });
    await pending;
    assert.deepEqual(deleted, [`epic-blast-${scope}-old`]);
    assert(claimed);

    const navigation = new Request(scope);
    Object.defineProperty(navigation, 'mode', { value: 'navigate' });
    const respondWith = (promise: Promise<unknown>) => { pending = promise; };
    handlers.fetch({ request: navigation, respondWith });
    assert.equal(await ((await pending) as Response).text(), 'new shell');
    online = false;
    handlers.fetch({ request: navigation, respondWith });
    assert.equal(await ((await pending) as Response).text(), 'offline shell');
  });

  it('ships the manifest icons, hashed game assets and the solver worker', () => {
    const manifest = JSON.parse(read('manifest.webmanifest')) as { icons: { src: string }[] };
    for (const icon of manifest.icons) assert(existsSync(new URL(icon.src, dist)), icon.src);
    const html = read('index.html');
    assert(!html.includes('/src/'), 'index.html references bundled assets only');
    const assets = readdirSync(new URL('assets/', dist));
    for (const pattern of [/^board-.*\.webp$/, /^neon-jewel-.*\.png$/, /^solver\.worker-.*\.js$/, /^smth-smth-.*\.mp3$/, /^record-.*\.mp3$/]) {
      assert(assets.some(name => pattern.test(name)), `missing ${pattern}`);
    }
  });
});
