import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { closeApp, type AppCloseEnvironment } from '../../src/platform/app-close.ts';

function fakeWindow(options: { allowClose: boolean; fullscreen?: boolean; throws?: boolean }) {
  let exited = 0;
  const env: AppCloseEnvironment & { exited(): number } = {
    closed: false,
    close() {
      if (options.throws) throw new Error('blocked');
      if (options.allowClose) (env as { closed: boolean }).closed = true;
    },
    setTimeout: fn => { fn(); return 0; },
    document: {
      fullscreenElement: options.fullscreen ? ({} as Element) : null,
      exitFullscreen: async () => { exited += 1; },
    },
    exited: () => exited,
  };
  return env;
}

describe('closing the installed app', () => {
  it('reports success when the browser closes the window', async () => {
    const env = fakeWindow({ allowClose: true, fullscreen: true });
    assert.equal(await closeApp(env), true);
    assert.equal(env.exited(), 0);
  });

  it('leaves fullscreen when the browser refuses to close', async () => {
    const env = fakeWindow({ allowClose: false, fullscreen: true });
    assert.equal(await closeApp(env), false);
    assert.equal(env.exited(), 1);
  });

  it('survives a close() that throws and outside fullscreen does nothing else', async () => {
    const env = fakeWindow({ allowClose: false, throws: true });
    assert.equal(await closeApp(env), false);
    assert.equal(env.exited(), 0);
  });
});
