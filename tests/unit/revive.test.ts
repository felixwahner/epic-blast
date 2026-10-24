import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reviveDefinitions } from '../../src/ai/revive.ts';
import { applyMove, moves, type SolverPiece } from '../../src/ai/solver.ts';
import { SHAPE_DEFINITIONS } from '../../src/core/shapes.ts';

/** True when the pieces can be placed in some order with at least one clear and a playable board after. */
function canClear(rows: number[], pieces: (SolverPiece | null)[], lines = 0): boolean {
  for (const move of moves(rows, pieces)) {
    const next = applyMove(rows, pieces[move.slot]!, move);
    const rest = pieces.slice();
    rest[move.slot] = null;
    const total = lines + next.lines;
    if (!rest.some(Boolean) && total > 0 && moves(next.rows, SHAPE_DEFINITIONS).length > 0) return true;
    if (rest.some(Boolean) && canClear(next.rows, rest, total)) return true;
  }
  return false;
}

describe('revive planner', () => {
  const boards = {
    empty: Array(8).fill(0),
    diagonal: [254, 253, 251, 247, 239, 223, 191, 127],
    stripes: Array(8).fill(170),
    scattered: [15, 240, 85, 170, 129, 126, 24, 66],
  };
  for (const [name, rows] of Object.entries(boards)) {
    it(`guarantees a clear on the ${name} board without changing it`, () => {
      const original = rows.slice();
      const pieces = reviveDefinitions(rows, SHAPE_DEFINITIONS, () => 0.5);
      assert.equal(pieces.length, 3);
      assert.deepEqual(rows, original);
      assert(canClear(rows, pieces));
    });
  }

  it('refuses a completely full board', () => {
    assert.throws(() => reviveDefinitions(Array(8).fill(255), SHAPE_DEFINITIONS));
  });
});
