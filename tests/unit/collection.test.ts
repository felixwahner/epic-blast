import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LINES_PER_UNLOCK,
  addLines,
  chooseStart,
  emptyCollection,
  isUnlocked,
  markSeen,
  nextUnlock,
  parseCollection,
  unlockedWorlds,
} from '../../src/core/collection.ts';
import { extendWorldOrder } from '../../src/theme/themes.ts';
import { seededRandom } from '../helpers/fakes.ts';

describe('world collection', () => {
  it('starts with only the first world', () => {
    assert.deepEqual(unlockedWorlds(emptyCollection(), 19), [0]);
    assert.deepEqual(nextUnlock(emptyCollection(), 19), { index: 1, remaining: LINES_PER_UNLOCK });
  });

  it('unlocks worlds in list order as lines add up across games', () => {
    const collection = emptyCollection();
    assert.deepEqual(addLines(collection, LINES_PER_UNLOCK - 1, 19), []);
    assert.deepEqual(addLines(collection, 1, 19), [1]);
    assert.deepEqual(addLines(collection, LINES_PER_UNLOCK * 2, 19), [2, 3]);
    assert.deepEqual(collection.fresh, [1, 2, 3]);
    assert.deepEqual(nextUnlock(collection, 19), { index: 4, remaining: LINES_PER_UNLOCK });
  });

  it('unlocks a world reached in a game, once', () => {
    const collection = emptyCollection();
    assert(markSeen(collection, 12));
    assert(!markSeen(collection, 12));
    assert(isUnlocked(collection, 12));
    assert.deepEqual(collection.fresh, [12]);
    // Worlds unlocked by lines first do not count twice.
    addLines(collection, LINES_PER_UNLOCK, 19);
    assert(!markSeen(collection, 1));
    assert.deepEqual(collection.fresh, [12, 1]);
  });

  it('only lets unlocked worlds open a game', () => {
    const collection = emptyCollection();
    assert(!chooseStart(collection, 5));
    assert.equal(collection.start, 0);
    markSeen(collection, 5);
    assert(chooseStart(collection, 5));
    assert.equal(collection.start, 5);
  });

  it('reads saved data defensively', () => {
    assert.deepEqual(parseCollection(null, 19), emptyCollection());
    assert.deepEqual(parseCollection('{oops', 19), emptyCollection());
    assert.deepEqual(parseCollection(JSON.stringify({ lines: -4, seen: [3, 3, 99, 'x'], start: 7, fresh: [3] }), 19), {
      lines: 0,
      seen: [0, 3],
      start: 0,
      fresh: [3],
    });
    assert.deepEqual(parseCollection(JSON.stringify({ lines: 85, seen: [0], start: 2, fresh: [] }), 19), {
      lines: 85,
      seen: [0],
      start: 2,
      fresh: [],
    });
  });

  it('opens a game with the chosen world and still visits every world', () => {
    const order = extendWorldOrder([], 19, seededRandom(4), 6);
    assert.equal(order[0], 6);
    assert.equal(new Set(order).size, 19);
  });
});
