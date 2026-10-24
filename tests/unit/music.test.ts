import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { BackgroundMusic, DUCK_LEVEL } from '../../src/audio/music.ts';
import { memoryStorage } from '../helpers/fakes.ts';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('background music', () => {
  const listeners: Record<string, () => void> = {};
  const counters = { plays: 0, pauses: 0, fail: false };
  const globals = globalThis as Record<string, unknown>;
  const saved = { document: globals.document, Audio: globals.Audio };

  before(() => {
    globals.document = { visibilityState: 'visible', addEventListener: (name: string, fn: () => void) => { listeners[name] = fn; } };
    globals.Audio = class {
      url: string; currentTime = 12; loop = false; preload = '';
      constructor(url: string) { this.url = url; }
      play() { counters.plays++; return counters.fail ? Promise.reject(new Error('Autoplay blocked')) : Promise.resolve(); }
      pause() { counters.pauses++; }
    };
  });
  after(() => Object.assign(globals, saved));

  it('plays, ducks, survives SFX mute, pauses and recovers from autoplay blocks', async () => {
    const document = globals.document as { visibilityState: string };
    const levels: number[] = [];
    const ctx = {
      state: 'running', currentTime: 1, destination: {},
      createMediaElementSource: () => ({ connect() {}, disconnect() {} }),
      createGain: () => ({ gain: { value: 0, cancelScheduledValues() {}, setTargetAtTime: (v: number) => levels.push(v) }, connect() {}, disconnect() {} }),
    } as unknown as AudioContext;
    const audio: { ctx: AudioContext | null; volume: number; isMuted: boolean; announcer?: { active: unknown } } =
      { ctx: null, volume: 0.25, isMuted: false };
    const music = new BackgroundMusic(audio, memoryStorage());
    clearInterval(music.timer!);

    music.tick();
    assert.equal(counters.plays, 0, 'no audio before activation');
    audio.ctx = ctx;
    music.tick();
    assert.equal(counters.plays, 1);
    assert(music.media!.loop);
    assert((music.media as unknown as { url: string }).url.endsWith('smth-smth.mp3'));
    music.tick();
    assert.equal(counters.plays, 1, 'do not restart playback every tick');
    assert.equal(levels.at(-1), 0.175);

    audio.announcer = { active: {} };
    music.tick();
    assert.equal(levels.at(-1), 0.175 * DUCK_LEVEL, 'music ducks under announcements');
    audio.announcer.active = null;
    music.tick();
    assert.equal(levels.at(-1), 0.175);

    audio.isMuted = true;
    music.tick();
    assert.equal(music.playing, true, 'muting sound effects keeps music playing');
    audio.isMuted = false;

    for (const reason of ['hidden', 'toggle'] as const) {
      if (reason === 'hidden') document.visibilityState = 'hidden';
      else music.toggle();
      music.tick();
      assert.equal(music.playing, false, reason);
      await wait(70);
      assert(counters.pauses > 0);
      if (reason === 'hidden') document.visibilityState = 'visible';
      else music.toggle();
      music.tick();
      assert.equal(music.playing, true);
      assert.equal(music.media!.currentTime, 12, 'resume position retained');
    }

    music.stop();
    counters.fail = true;
    music.tick();
    await Promise.resolve();
    assert(music.blocked);
    const attempts = counters.plays;
    music.tick();
    assert.equal(counters.plays, attempts, 'no autoplay retry loop');
    counters.fail = false;
    listeners.pointerdown();
    assert(music.playing);

    // Rapid off/on must cancel the delayed pause.
    music.stop();
    music.tick();
    const before = counters.pauses;
    await wait(80);
    assert.equal(counters.pauses, before);
    music.stop();
    await wait(70);
  });

  it('remembers the music preference', () => {
    const storage = memoryStorage({ epic_blast_music: 'off' });
    const music = new BackgroundMusic({ ctx: null, volume: 0.25 }, storage);
    clearInterval(music.timer!);
    assert.equal(music.enabled, false);
    music.toggle();
    assert.equal(storage.getItem('epic_blast_music'), 'on');
  });
});
