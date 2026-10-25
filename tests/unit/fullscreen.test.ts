import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { enterFullscreenOnFirstTouch, isInstalledApp, type FullscreenEnvironment } from '../../src/platform/pwa.ts';

function fakeEnvironment(displayMode: string | null, options: { standalone?: boolean; enabled?: boolean } = {}) {
  const listeners: { type: string; fn: () => void; options: unknown }[] = [];
  const requests: unknown[] = [];
  const env: FullscreenEnvironment = {
    matchMedia: query => ({ matches: displayMode !== null && query === `(display-mode: ${displayMode})` }),
    navigator: { standalone: options.standalone },
    document: {
      fullscreenEnabled: options.enabled ?? true,
      fullscreenElement: null,
      addEventListener: ((type: string, fn: () => void, opts: unknown) => {
        listeners.push({ type, fn, options: opts });
      }) as Document['addEventListener'],
      documentElement: {
        requestFullscreen: async (opts?: FullscreenOptions) => {
          requests.push(opts);
        },
      },
    },
  };
  return { env, listeners, requests };
}

describe('fullscreen by default', () => {
  it('asks the installed app to launch fullscreen, falling back to standalone', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
    assert.equal(manifest.display, 'fullscreen');
    assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone', 'minimal-ui']);
  });

  it('marks the page as a full-screen web app for iOS', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
    assert.match(html, /viewport-fit=cover/);
  });

  it('detects installed apps, including iOS home-screen apps', () => {
    assert.equal(isInstalledApp(fakeEnvironment('standalone').env), true);
    assert.equal(isInstalledApp(fakeEnvironment('fullscreen').env), true);
    assert.equal(isInstalledApp(fakeEnvironment(null, { standalone: true }).env), true);
    assert.equal(isInstalledApp(fakeEnvironment('browser').env), false);
  });

  it('goes fullscreen on the first tap when the app opened as a window', async () => {
    const { env, listeners, requests } = fakeEnvironment('standalone');
    enterFullscreenOnFirstTouch(env);
    assert.equal(listeners.length, 1);
    assert.equal(listeners[0].type, 'pointerdown');
    assert.deepEqual(listeners[0].options, { once: true, capture: true });
    listeners[0].fn();
    assert.deepEqual(requests, [{ navigationUI: 'hide' }]);
  });

  it('leaves browser tabs, already-fullscreen apps and unsupported platforms alone', () => {
    for (const { env, listeners } of [
      fakeEnvironment('browser'),
      fakeEnvironment('fullscreen'),
      fakeEnvironment('standalone', { enabled: false }),
    ]) {
      enterFullscreenOnFirstTouch(env);
      assert.equal(listeners.length, 0);
    }
  });
});
