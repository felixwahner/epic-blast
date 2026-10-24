import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Haptics } from '../../src/platform/haptics.ts';
import { STORAGE_KEYS, readNumber, safeStorage } from '../../src/platform/storage.ts';
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
