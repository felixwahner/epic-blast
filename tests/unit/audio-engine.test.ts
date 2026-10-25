import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioEngine } from '../../src/audio/audio-engine.ts';
import { comboSoundProfile } from '../../src/audio/combo-sound.ts';
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
