import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDLE_DELAY, Parallax } from '../../src/render/parallax.ts';

const run = (p: Parallax, seconds: number, still = false) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, still);
};

describe('Parallax', () => {
  it('leans toward the pointer and never past the edge', () => {
    const p = new Parallax();
    p.point(3, -0.5);
    run(p, 1);
    assert.ok(p.x > 0.95 && p.x <= 1);
    assert.ok(Math.abs(p.y + 0.5) < 0.05);
  });

  it('eases back to flat once the pointer rests, and never moves on its own', () => {
    const p = new Parallax();
    p.point(1, -1);
    run(p, 0.5);
    assert.ok(p.x > 0.5);
    run(p, IDLE_DELAY + 3);
    assert.ok(Math.hypot(p.x, p.y) < 0.01);
    const before = [p.x, p.y];
    run(p, 5);
    assert.deepEqual(
      [p.x, p.y].map(v => Math.abs(v) < 0.01),
      [true, true],
    );
    assert.ok(Math.abs(p.x - before[0]) < 0.01);
  });

  it('settles flat when motion is reduced', () => {
    const p = new Parallax();
    p.point(1, 1);
    run(p, 1);
    run(p, 2, true);
    assert.ok(Math.hypot(p.x, p.y) < 0.01);
  });

  it('ignores invalid input', () => {
    const p = new Parallax();
    p.point(Number.NaN, Infinity);
    run(p, 0.5);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  });
});
