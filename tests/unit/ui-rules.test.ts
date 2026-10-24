import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CelebrationKind } from '../../src/core/session.ts';
import { CELEBRATION_COOLDOWN_MS, CELEBRATION_LABELS, CELEBRATION_PRIORITY, pickCelebration } from '../../src/ui/celebrations.ts';
import { comboMood } from '../../src/ui/effects.ts';

describe('celebration selection', () => {
  it('has a label and a priority for every kind', () => {
    assert.deepEqual([...CELEBRATION_PRIORITY].sort(), Object.keys(CELEBRATION_LABELS).sort());
  });

  it('shows only the most important event of a move', () => {
    assert.equal(pickCelebration(['triple', 'clean', 'record'], 0, new Map()), 'clean');
    assert.equal(pickCelebration([], 0, new Map()), null);
  });

  it('skips events on cooldown and falls back to the next one', () => {
    const shown = new Map<CelebrationKind, number>([['clean', 1000]]);
    assert.equal(pickCelebration(['clean', 'triple'], 1000 + CELEBRATION_COOLDOWN_MS, shown), 'triple');
    assert.equal(pickCelebration(['clean'], 1001 + CELEBRATION_COOLDOWN_MS, shown), 'clean');
  });
});

describe('combo mood', () => {
  it('escalates at 2, 5 and 10', () => {
    assert.deepEqual([0, 1, 2, 4, 5, 9, 10, 50].map(comboMood), ['calm', 'calm', 'warm', 'warm', 'hot', 'hot', 'legend', 'legend']);
  });
});
