import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { StadiumAnnouncer, type AnnouncerContext } from '../../src/audio/announcer.ts';

interface FakeSource { buffer: unknown; onended: (() => void) | null; connect(): void; disconnect(): void; start(): void; stop(): void }

function setup() {
  const state = { enabled: true, cancelled: 0, downloads: 0, fail: false };
  const played: FakeSource[] = [];
  const listeners: Record<string, () => void> = {};
  const host = { document: { hidden: false, addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; } } };
  const ctx = {
    state: 'running', destination: {},
    decodeAudioData: async (bytes: ArrayBuffer) => ({ bytes }),
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: (): FakeSource => ({
      buffer: null, onended: null, connect() {}, disconnect() {},
      start() { played.push(this); },
      stop() { state.cancelled++; this.onended?.(); },
    }),
  } satisfies AnnouncerContext;
  const announcer = new StadiumAnnouncer({
    host, context: () => ctx, enabled: () => state.enabled,
    fetchClip: async () => { state.downloads++; return { ok: !state.fail, arrayBuffer: async () => new ArrayBuffer(1) }; },
  });
  /** Speaks the pending call immediately instead of waiting for the timer. */
  const flush = () => { if (announcer.timer) clearTimeout(announcer.timer); announcer.speak(); };
  return { state, played, listeners, host, ctx, announcer, flush };
}

describe('stadium announcer', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  it('downloads and caches all seven clips once', async () => {
    const { announcer, state } = setup();
    await announcer.prepare();
    assert.equal(announcer.buffers.size, 7);
    await announcer.prepare();
    assert.equal(state.downloads, 7);
  });

  it('plays the highest-priority pending call at a restrained volume', async () => {
    const { announcer, played, flush } = setup();
    await announcer.prepare();
    announcer.announce('combo', 5); announcer.announce('record'); announcer.announce('level', 2); flush();
    assert.equal(played.length, 1);
    assert.equal(played[0].buffer, announcer.buffers.get('record'));
    assert.equal(announcer.active?.gain.gain.value, 0.22);
    announcer.announce('combo', 10); flush();
    assert.equal(played.length, 1, 'nearby calls stay quiet');
  });

  it('lets game over interrupt a celebration and releases ducking at the end', async () => {
    const { announcer, played, state, flush } = setup();
    await announcer.prepare();
    announcer.announce('record'); flush();
    announcer.announce('over'); flush();
    assert.equal(played.length, 2);
    assert.equal(state.cancelled, 1);
    played[1].onended?.();
    assert.equal(announcer.active, null);
  });

  it('respects mute, backgrounding and suspended audio', async () => {
    const { announcer, played, state, host, listeners, ctx, flush } = setup();
    await announcer.prepare();
    state.enabled = false; announcer.announce('record'); flush();
    assert.equal(played.length, 0);
    state.enabled = true; announcer.announce('revive'); host.document.hidden = true; listeners.visibilitychange();
    assert.equal(announcer.pending, null);
    host.document.hidden = false; announcer.announce('revive'); state.enabled = false; flush();
    assert.equal(played.length, 0, 'mute is rechecked after scheduling');
    state.enabled = true; ctx.state = 'suspended'; announcer.announce('record'); flush();
    assert.equal(played.length, 0);
  });

  it('retries clips that failed to download', async () => {
    const { announcer, state } = setup();
    state.fail = true;
    await announcer.prepare();
    assert.equal(announcer.buffers.size, 0);
    state.fail = false;
    await announcer.prepare();
    assert.equal(announcer.buffers.has('record'), true);
  });

  it('ignores unknown events and odd combos', () => {
    new StadiumAnnouncer({ host: {} }).announce('unknown');
    const { announcer } = setup();
    announcer.announce('combo', 3);
    assert.equal(announcer.pending, null);
  });

  it('limits "Unstoppable" to once per 45 seconds, even across resets', async () => {
    const { announcer, played, flush } = setup();
    await announcer.prepare();
    let time = 100000;
    Date.now = () => time;
    announcer.announce('combo', 5); flush();
    assert.equal(played.length, 1);
    assert.equal(played[0].buffer, announcer.buffers.get('unstoppable'));
    announcer.stop(); time += 10000;
    announcer.reset();
    announcer.announce('combo', 5); flush();
    assert.equal(played.length, 1, 'repeated combo 5 stays quiet for 45 seconds');
    announcer.announce('combo', 10); flush();
    assert.equal(played.length, 2, 'other milestones remain available');
    announcer.stop(); time += 35000;
    announcer.announce('combo', 5); flush();
    assert.equal(played.length, 3, 'unstoppable returns after its repeat cooldown');
    announcer.stop();
  });
});
