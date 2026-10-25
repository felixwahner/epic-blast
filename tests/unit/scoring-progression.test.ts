import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { levelStart, progression, worldProgress } from '../../src/core/progression.ts';
import { clearScore, comboClearScore, comboMilestone } from '../../src/core/scoring.ts';
import { canRecoverStreak } from '../../src/core/streak-recovery.ts';
import { themeFor } from '../../src/theme/themes.ts';

describe('clear scoring', () => {
  it('matches the values read from high-combo screenshots', () => {
    assert.equal(clearScore(19, 1) + 6, 1574);
    assert.equal(clearScore(18, 2) + 12, 2988);
    assert.equal(clearScore(17, 2) + 16, 2832);
    assert.equal(clearScore(1, 0), 0);
  });

  it('scores each line of a multi-line clear at its own combo step', () => {
    assert.equal(comboClearScore(0, 1), clearScore(1, 1));
    assert.equal(comboClearScore(0, 3), clearScore(1, 1) + clearScore(2, 1) + clearScore(3, 1));
    assert.equal(comboClearScore(4, 2), clearScore(5, 1) + clearScore(6, 1));
    assert.equal(comboClearScore(7, 0), 0);
  });

  it('finds combo milestones that a multi-line clear jumps over', () => {
    assert.equal(comboMilestone(4, 5), 5);
    assert.equal(comboMilestone(3, 6), 5);
    assert.equal(comboMilestone(8, 11), 10);
    assert.equal(comboMilestone(3, 12), 10);
    assert.equal(comboMilestone(19, 21), 20);
    assert.equal(comboMilestone(5, 7), null);
    assert.equal(comboMilestone(10, 13), null);
    assert.equal(comboMilestone(0, 2), null);
  });
});

describe('level progression', () => {
  it('uses exponential thresholds', () => {
    assert.equal(progression(0).level, 1);
    assert.deepEqual([1, 2, 3, 4, 5].map(levelStart), [0, 10000, 30000, 70000, 150000]);
    assert(levelStart(15) - levelStart(14) > 1900000);
  });

  it('switches level exactly at each threshold and doubles the gap', () => {
    for (let level = 2; level <= 35; level++) {
      const threshold = levelStart(level);
      assert.equal(progression(threshold - 1).level, level - 1);
      assert.equal(progression(threshold).level, level);
      assert.equal(progression(threshold).progress, 0);
      const gap = levelStart(level + 1) - threshold;
      const previous = threshold - levelStart(level - 1);
      assert(Math.abs(gap - previous * 2) <= 2);
    }
  });

  it('can skip several levels at once', () => {
    assert.equal(progression(70000).level - progression(0).level, 3);
  });
});

describe('world progression', () => {
  it('advances every 20 lines with a light stage every 5 lines', () => {
    for (const lines of [0, 4, 5, 9, 10, 14, 15, 19, 20, 39, 40, 360]) {
      const state = worldProgress(lines);
      assert.equal(state.world, Math.floor(lines / 20) + 1);
      assert.equal(themeFor(state.world, state.progress).stage, Math.floor((lines % 20) / 5));
    }
    assert.deepEqual(worldProgress(20), { world: 2, progress: 0 });
  });
});

describe('streak recovery eligibility', () => {
  it('requires a combo of 25, no clear this round and a revive', () => {
    assert(canRecoverStreak(10, false, 1));
    assert(canRecoverStreak(100, false, 2));
    assert(!canRecoverStreak(9, false, 1));
    assert(!canRecoverStreak(25, true, 1));
    assert(!canRecoverStreak(25, false, 0));
  });
});
