import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioEngine } from '../../src/audio/audio-engine.ts';
import { comboSoundProfile } from '../../src/audio/combo-sound.ts';
import { DEFAULT_SOUND_WORLD, SOUND_WORLDS } from '../../src/audio/sound-worlds.ts';
import { STORAGE_KEYS } from '../../src/platform/storage.ts';
import { memoryStorage } from '../helpers/fakes.ts';

function engine(muted: boolean) {
  let resumes = 0;
  class FakeContext {
    state = 'suspended';
    resume() {
      resumes++;
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
  }
  const storage = memoryStorage({ [STORAGE_KEYS.muted]: String(muted) });
  const audio = new AudioEngine({ storage, contextClass: () => FakeContext as unknown as new () => AudioContext });
  return { audio, storage, resumes: () => resumes };
}

describe('audio engine activation', () => {
  it('activates the context even while sound effects are muted (music needs it)', () => {
    const { audio, resumes } = engine(true);
    audio.init();
    assert.equal(resumes(), 1);
    assert.equal(audio.isMuted, true);
  });

  it('resumes on unmute and on every later interaction while suspended', () => {
    const { audio, resumes, storage } = engine(true);
    audio.init();
    (audio.ctx as { state: string }).state = 'suspended';
    assert.equal(audio.toggleMute(), false);
    assert.equal(resumes(), 2, 'unmuting resumes audio in the same user interaction');
    assert.equal(storage.getItem(STORAGE_KEYS.muted), 'false');
    (audio.ctx as { state: string }).state = 'interrupted';
    audio.init();
    assert.equal(resumes(), 3);
  });

  it('replaces a closed context', () => {
    const { audio } = engine(false);
    audio.init();
    const old = audio.ctx;
    (audio.ctx as { state: string }).state = 'closed';
    audio.init();
    assert.notEqual(audio.ctx, old);
    assert.equal(audio.ctx!.state, 'running');
  });

  it('works without Web Audio support', () => {
    const audio = new AudioEngine({ storage: memoryStorage(), contextClass: () => undefined });
    audio.init();
    audio.playPlace();
    audio.playClear(2, 3);
    assert.equal(audio.ctx, null);
  });
});

describe('combo sound profile', () => {
  it('keeps a fixed positive root and bounded stages', () => {
    assert.deepEqual(
      [1, 4, 10, 20, 40].map(c => comboSoundProfile(c).stage),
      [0, 1, 2, 3, 4],
    );
    for (const combo of [1, 5, 15, 50, 100, 1000, 1000000]) {
      assert.equal(comboSoundProfile(combo).root, 261.63);
      assert(comboSoundProfile(combo).stage <= 4);
    }
  });

  it('adds rhythmic milestones every 25 combos from 50', () => {
    assert(comboSoundProfile(50).milestone);
    assert(comboSoundProfile(75).milestone);
    assert(!comboSoundProfile(51).milestone);
    assert(!comboSoundProfile(25).milestone);
  });
});

const checkTime = (time: number) => assert(Number.isFinite(time) && time >= 0, `bad time ${time}`);
const param = (value = 0) => {
  return {
    value,
    setValueAtTime: (_: number, t: number) => checkTime(t),
    linearRampToValueAtTime: (_: number, t: number) => checkTime(t),
    exponentialRampToValueAtTime: (v: number, t: number) => {
      checkTime(t);
      assert(v > 0, `exponential ramp to ${v}`);
    },
    setTargetAtTime: (_: number, t: number) => checkTime(t),
  };
};
const node = (extra: object = {}) => ({ connect() {}, disconnect() {}, ...extra });

/** A Web Audio stand-in that records sources and rejects the scheduling values real browsers reject. */
function recordingContext() {
  const sources: { start: number; stop: number }[] = [];
  const source = () => {
    const entry = { start: -1, stop: -1 };
    sources.push(entry);
    return node({
      frequency: param(440),
      detune: param(),
      type: 'sine',
      buffer: null,
      onended: null,
      start: (t = 0) => (entry.start = t),
      stop: (t = 0) => (entry.stop = t),
    });
  };
  class Ctx {
    state = 'running';
    currentTime = 3;
    sampleRate = 8000;
    destination = node();
    resume = () => Promise.resolve();
    createOscillator = source;
    createBufferSource = source;
    createGain = () => node({ gain: param(1) });
    createBiquadFilter = () => node({ frequency: param(350), Q: param(1), type: 'lowpass' });
    createConvolver = () => node({ buffer: null });
    createWaveShaper = () => node({ curve: null, oversample: 'none' });
    createDynamicsCompressor = () =>
      node({ threshold: param(), ratio: param(), knee: param(), attack: param(), release: param() });
    createBuffer = (channels: number, length: number, sampleRate: number) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { sampleRate, length, getChannelData: (c: number) => data[c] };
    };
  }
  return { sources, contextClass: () => Ctx as unknown as new () => AudioContext };
}

describe('sound worlds', () => {
  it('defaults to the impact world and cycles through every world, storing the choice', () => {
    const storage = memoryStorage();
    const audio = new AudioEngine({ storage, contextClass: () => undefined });
    assert.equal(audio.soundWorld, DEFAULT_SOUND_WORLD);
    const seen = SOUND_WORLDS.map(() => audio.cycleSoundWorld());
    assert.deepEqual([...seen].sort(), [...SOUND_WORLDS].sort());
    assert.equal(storage.getItem(STORAGE_KEYS.soundWorld), audio.soundWorld);
    assert.equal(new AudioEngine({ storage, contextClass: () => undefined }).soundWorld, audio.soundWorld);
  });

  it('ignores an unknown stored world', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.soundWorld]: 'kazoo' });
    assert.equal(new AudioEngine({ storage, contextClass: () => undefined }).soundWorld, DEFAULT_SOUND_WORLD);
  });

  for (const world of SOUND_WORLDS) {
    it(`schedules every event in the ${world} world at valid times`, () => {
      const { sources, contextClass } = recordingContext();
      const storage = memoryStorage({ [STORAGE_KEYS.soundWorld]: world });
      const audio = new AudioEngine({ storage, contextClass });
      audio.init();
      audio.playPickup();
      audio.playCancel();
      audio.playPlace();
      for (const [lines, combo] of [
        [1, 0],
        [2, 4],
        [3, 10],
        [2, 20],
        [4, 40],
        [1, 50],
      ])
        audio.playClear(lines, combo, 0.14);
      audio.playComboFanfare();
      audio.playNewRecord();
      audio.playRevive();
      audio.playGameOver();
      assert(sources.length > 40);
      for (const { start, stop } of sources) assert(start >= 3 && stop > start, `${world}: ${start}..${stop}`);
    });
  }

  it('stays silent while muted', () => {
    const { sources, contextClass } = recordingContext();
    const audio = new AudioEngine({ storage: memoryStorage({ [STORAGE_KEYS.muted]: 'true' }), contextClass });
    audio.init();
    audio.playPlace();
    audio.playClear(2, 10);
    assert.equal(sources.length, 0);
  });
});
