import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Haptics } from '../../src/platform/haptics.ts';
import { STORAGE_KEYS, readNumber, safeStorage, syncBestScore } from '../../src/platform/storage.ts';
import { memoryStorage } from '../helpers/fakes.ts';

describe('haptics', () => {
  it('sends a single short pulse per clear', () => {
    const calls: number[] = [];
    const device = { vibrate(ms: number) { assert.equal(this, device); calls.push(ms); return true; } };
    const haptics = new Haptics(memoryStorage());
    assert.equal(haptics.lineClear(device), true);
    assert.deepEqual(calls, [10]);
  });

  it('never throws when vibration is unavailable or blocked', () => {
    const haptics = new Haptics(memoryStorage());
    assert.equal(haptics.lineClear({}), false);
    assert.equal(haptics.lineClear({ vibrate: () => false }), false);
    assert.equal(haptics.lineClear({ vibrate() { throw new Error('blocked'); } }), false);
  });

  it('can be switched off and remembers the choice', () => {
    const storage = memoryStorage();
    const calls: number[] = [];
    const device = { vibrate: (ms: number) => { calls.push(ms); return true; } };
    const haptics = new Haptics(storage);
    assert.equal(haptics.toggle(), false);
    assert.equal(haptics.lineClear(device), false);
    assert.equal(storage.getItem(STORAGE_KEYS.vibration), 'off');
    assert.equal(new Haptics(storage).enabled, false);
    assert.equal(haptics.toggle(), true);
    assert.equal(haptics.lineClear(device), true);
    assert.deepEqual(calls, [10]);
  });
});

describe('storage', () => {
  it('survives a throwing localStorage', () => {
    const globals = globalThis as Record<string, unknown>;
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      assert.equal(safeStorage.getItem('x'), null);
      assert.doesNotThrow(() => safeStorage.setItem('x', '1'));
    } finally {
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
      else delete globals.localStorage;
    }
  });

  it('reads numbers with a fallback', () => {
    const storage = memoryStorage({ a: '42', b: 'oops' });
    assert.equal(readNumber(storage, 'a'), 42);
    assert.equal(readNumber(storage, 'b', 7), 7);
    assert.equal(readNumber(storage, 'missing'), 0);
  });
});

describe('best score', () => {
  it('stores a new record', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.bestScore]: '100' });
    assert.equal(syncBestScore(storage, 250), 250);
    assert.equal(storage.getItem(STORAGE_KEYS.bestScore), '250');
  });

  it('adopts a higher record stored by another window', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.bestScore]: '5000' });
    assert.equal(syncBestScore(storage, 300), 5000);
    assert.equal(storage.getItem(STORAGE_KEYS.bestScore), '5000');
  });

  it('starts from an empty or unreadable store', () => {
    const storage = memoryStorage({ [STORAGE_KEYS.bestScore]: 'garbage' });
    assert.equal(syncBestScore(storage, 0), 0);
    assert.equal(syncBestScore(storage, 12), 12);
    assert.equal(storage.getItem(STORAGE_KEYS.bestScore), '12');
  });
});
