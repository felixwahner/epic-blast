import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardClearPath, finishingShape } from '../../src/ai/board-clear.ts';
import { BOARD_CLEAR_CHANCE, createHelpDealer } from '../../src/ai/helpful-dealer.ts';
import { applyMove, moves, type RowMasks } from '../../src/ai/solver.ts';
import { canFitAnywhere, clearGrid } from '../../src/core/board.ts';
import { allClearBonus, allClearMultiplier, MAX_ALL_CLEAR_MULTIPLIER } from '../../src/core/scoring.ts';
import { GameSession } from '../../src/core/session.ts';
import { SHAPE_DEFINITIONS, isSatisfyingShape, type ShapeDefinition } from '../../src/core/shapes.ts';
import { noHelp, seededRandom } from '../helpers/fakes.ts';

const dot = { matrix: [[1]], weight: 1 };
const key = (def: { matrix: readonly (readonly number[])[] }) => JSON.stringify(def.matrix);

/** Rows from strings: '#' = block, '.' = empty; x grows to the right. */
const board = (lines: string[]): number[] =>
  lines.map(line => [...line].reduce((mask, ch, x) => mask | (ch === '#' ? 1 << x : 0), 0));

/** True when the pieces, placed in this order somewhere, leave the board empty. */
function emptiesBoard(rows: RowMasks, path: readonly ShapeDefinition[]): boolean {
  if (!path.length) return rows.every(mask => mask === 0);
  return moves(rows, [path[0]]).some(move => emptiesBoard(applyMove(rows, path[0], move).rows, path.slice(1)));
}

describe('piece distribution', () => {
  it('weights solid pieces (lines, 2x2, 2x3, 3x3) at over 40% of all spawns', () => {
    const total = SHAPE_DEFINITIONS.reduce((sum, def) => sum + def.weight, 0);
    const solid = SHAPE_DEFINITIONS.filter(def => isSatisfyingShape(def.matrix)).reduce((sum, def) => sum + def.weight, 0);
    assert(solid / total > 0.4, `solid share ${solid / total}`);
    for (const matrix of [[[1, 1, 1], [1, 1, 1]], [[1, 1], [1, 1], [1, 1]], [[1, 1, 1], [1, 1, 1], [1, 1, 1]]]) {
      assert(SHAPE_DEFINITIONS.some(def => key(def) === JSON.stringify(matrix)), `catalog has ${JSON.stringify(matrix)}`);
    }
  });

  it('only counts solid rectangles of three or more blocks as satisfying', () => {
    assert(isSatisfyingShape([[1, 1, 1]]));
    assert(isSatisfyingShape([[1, 1], [1, 1]]));
    assert(!isSatisfyingShape([[1, 1]]));
    assert(!isSatisfyingShape([[1]]));
    assert(!isSatisfyingShape([[1, 0], [1, 1]]));
  });

  it('deals a solid piece in about nine of ten random trays, while keeping every shape in play', () => {
    const session = new GameSession({ random: seededRandom(3), helpDealer: noHelp });
    session.start();
    const seen = new Set<string>();
    let withSolid = 0;
    const rounds = 2000;
    for (let i = 0; i < rounds; i++) {
      clearGrid(session.grid);
      session.deal();
      const tray = session.tray.filter(p => p !== null);
      tray.forEach(piece => seen.add(key(piece)));
      if (tray.some(piece => isSatisfyingShape(piece.matrix))) withSolid++;
    }
    assert(withSolid / rounds > 0.85 && withSolid / rounds < 0.95, `share ${withSolid / rounds}`);
    assert.equal(seen.size, SHAPE_DEFINITIONS.length);
  });

  it('still guarantees a fitting first piece on a nearly full board', () => {
    const session = new GameSession({ random: seededRandom(11), helpDealer: noHelp });
    session.start();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) session.grid[r][c] = (r + c) % 2 ? 1 : null;
    for (let i = 0; i < 200; i++) {
      session.deal();
      assert(canFitAnywhere(session.grid, session.tray[0]!.matrix));
    }
  });
});

describe('board-clear search', () => {
  it('finds the single piece that completes every remaining line at once', () => {
    const cross = board([
      '...#....',
      '...#....',
      '...#....',
      '###.####',
      '...#....',
      '...#....',
      '...#....',
      '...#....',
    ]);
    assert.equal(key(finishingShape(cross, SHAPE_DEFINITIONS)!), key(dot));
    assert.equal(finishingShape(cross, SHAPE_DEFINITIONS.filter(def => key(def) !== key(dot))), null);
    assert(emptiesBoard(cross, [dot]));
  });

  it('matches multi-line gaps against the catalog, e.g. a 2x3 block finishing two rows', () => {
    const rows = board(['##...###', '##...###', '........', '........', '........', '........', '........', '........']);
    assert.equal(key(finishingShape(rows, SHAPE_DEFINITIONS)!), key({ matrix: [[1, 1, 1], [1, 1, 1]] }));
  });

  it('returns null when one piece cannot empty the board', () => {
    assert.equal(finishingShape(board(['#.......', '', '', '', '', '', '', '']), SHAPE_DEFINITIONS), null);
    assert.equal(finishingShape(Array(8).fill(0), SHAPE_DEFINITIONS), null);
  });

  it('plans two- and three-piece board clears that really empty the board', () => {
    const two = board(['#####...', '........', '........', '........', '........', '........', '........', '######..']);
    const twoPath = boardClearPath(two, SHAPE_DEFINITIONS, seededRandom(1))!;
    assert.equal(twoPath.length, 2);
    assert(emptiesBoard(two, twoPath));

    const three = board(['#####...', '........', '........', '#####...', '........', '........', '#####...', '........']);
    assert.equal(boardClearPath(three, SHAPE_DEFINITIONS, seededRandom(1), 2), null);
    const threePath = boardClearPath(three, SHAPE_DEFINITIONS, seededRandom(1))!;
    assert.equal(threePath.length, 3);
    assert(emptiesBoard(three, threePath));
  });

  it('does not touch the input rows', () => {
    const rows = board(['#####...', '', '', '', '', '', '', '######..']);
    const copy = rows.slice();
    boardClearPath(rows, SHAPE_DEFINITIONS, seededRandom(2));
    assert.deepEqual(rows, copy);
  });
});

describe('board-aware dealer', () => {
  const sparse = board(['#####...', '', '', '', '', '', '', '######..']);

  it('deals a board-clearing set on sparse boards below the chance boundary, even during cooldown', () => {
    const dealer = createHelpDealer(() => 0);
    for (let i = 0; i < 3; i++) {
      const path = dealer.deal(sparse, SHAPE_DEFINITIONS)!;
      assert(emptiesBoard(sparse, path));
    }
  });

  it('falls back to normal dealing above the chance boundary', () => {
    const rolls = [BOARD_CLEAR_CHANCE, 0.99];
    const dealer = createHelpDealer(() => rolls.shift() ?? 0.99);
    assert.equal(dealer.deal(sparse, SHAPE_DEFINITIONS), null);
  });

  it('sets up board clears regularly over many sparse rounds', () => {
    const dealer = createHelpDealer(seededRandom(5));
    let sweeps = 0;
    for (let i = 0; i < 200; i++) {
      const path = dealer.deal(sparse, SHAPE_DEFINITIONS);
      if (path && emptiesBoard(sparse, path)) sweeps++;
    }
    assert(sweeps > 90 && sweeps < 150, `sweeps ${sweeps}`);
  });

  it('skips the board-clear search on crowded boards', () => {
    const crowded = board(['#######.', '#######.', '#######.', '#######.', '#######.', '', '##......', '']);
    const path = createHelpDealer(() => 0).deal(crowded, SHAPE_DEFINITIONS);
    assert(path, 'line-clear help still applies');
    assert(!emptiesBoard(crowded, path!));
  });
});

describe('board-clear multiplier', () => {
  it('triples the first board clear and adds a step per further one, capped', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9].map(allClearMultiplier), [3, 4, 5, 6, 6, 6]);
    assert.equal(MAX_ALL_CLEAR_MULTIPLIER, 6);
    assert.equal(allClearBonus(100, 1), 300 + 200);
    assert.equal(allClearBonus(100, 2), 300 + 300);
  });
});
