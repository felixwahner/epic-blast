import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMove, boardQuality, moves, solve, type SolverPiece } from '../../src/ai/solver.ts';

const single = { matrix: [[1]] };
const empty = Array(8).fill(0);

/** Independent exhaustive oracle, including every order. */
function oracle(rows: number[], rest: (SolverPiece | null)[], placed = 0, total = 0): number[] {
  let best = [placed, total, boardQuality(rows)];
  for (const move of moves(rows, rest)) {
    const next = applyMove(rows, rest[move.slot]!, move);
    const tail = rest.slice();
    tail[move.slot] = null;
    const candidate = oracle(next.rows, tail, placed + 1, total + next.lines);
    const diff = candidate[0] - best[0] || candidate[1] - best[1] || candidate[2] - best[2];
    if (diff > 0) best = candidate;
  }
  return best;
}

describe('solver', () => {
  it('enumerates legal moves', () => {
    assert.equal(moves(empty, [single]).length, 64);
    const nearlyFull = Array(8).fill(255);
    nearlyFull[0] = 254;
    assert.equal(moves(nearlyFull, [single]).length, 1);
  });

  it('applies simultaneous row and column clears without mutating input', () => {
    const nearlyFull = Array(8).fill(255);
    nearlyFull[0] = 254;
    const cleared = applyMove(nearlyFull, single, { x: 0, y: 0 });
    assert.equal(cleared.lines, 16);
    assert.deepEqual(cleared.rows, empty);
    assert.equal(nearlyFull[0], 254, 'simulation must not mutate live state');
  });

  it('places nothing on a full board', () => {
    assert.equal(solve(Array(8).fill(255), [single]).placed, 0);
  });

  it('finds the order that unlocks the board and returns a legal replay', () => {
    const board = [252, 255, 255, 255, 255, 255, 255, 255];
    const pieces = [single, { matrix: [[1, 1]] }, single];
    const result = solve(board, pieces);
    let replay = board, lines = 0;
    const remaining: (SolverPiece | null)[] = pieces.slice();
    for (const move of result.path) {
      assert(moves(replay, remaining).some(m => m.slot === move.slot && m.x === move.x && m.y === move.y));
      const next = applyMove(replay, remaining[move.slot]!, move);
      replay = next.rows;
      lines += next.lines;
      remaining[move.slot] = null;
    }
    assert.equal(result.placed, 3);
    assert.equal(result.lines, lines);
    assert.equal(result.quality, boardQuality(replay));
    assert.equal(result.path[0].slot, 1, 'solver must find the piece that unlocks the board');
  });

  it('matches an exhaustive oracle', () => {
    const constrained = [253, 251, 247, 239, 223, 191, 127, 254];
    const actual = solve(constrained, [single, single, single]);
    assert.deepEqual([actual.placed, actual.lines, actual.quality], oracle(constrained, [single, single, single]));
  });

  it('solves an empty board with three singles quickly', () => {
    const start = performance.now();
    assert.equal(solve(empty, [single, single, single]).placed, 3);
    assert(performance.now() - start < 5000);
  });
});
