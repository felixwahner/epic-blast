import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GRID_SIZE, canFitAnywhere, canPlace, createGrid, encodeGrid, findFullLines, isGridEmpty,
  lineCells, placeShape, predictClears, shapeSize,
} from '../../src/core/board.ts';
import { gridFrom } from '../helpers/fakes.ts';

const square = [[1, 1], [1, 1]];

describe('board', () => {
  it('creates an empty 8x8 grid', () => {
    const grid = createGrid();
    assert.equal(grid.length, GRID_SIZE);
    assert(grid.every(row => row.length === GRID_SIZE));
    assert(isGridEmpty(grid));
  });

  it('accepts placements inside the grid and rejects out of bounds', () => {
    const grid = createGrid();
    assert.equal(canPlace(grid, square, 0, 0), true);
    assert.equal(canPlace(grid, square, 6, 6), true);
    assert.equal(canPlace(grid, square, 7, 7), false);
    assert.equal(canPlace(grid, square, -1, 0), false);
  });

  it('rejects placements on occupied cells but ignores holes in the shape', () => {
    const grid = createGrid();
    grid[1][1] = 3;
    assert.equal(canPlace(grid, square, 0, 0), false);
    assert.equal(canPlace(grid, [[1, 0], [0, 1]], 1, 0), true, 'diagonal shape skips the occupied cell');
  });

  it('detects full rows and columns independently', () => {
    const grid = createGrid();
    for (let c = 0; c < 8; c++) grid[2][c] = 1;
    for (let r = 0; r < 8; r++) grid[r][5] = 1;
    assert.deepEqual(findFullLines(grid), { rows: [2], cols: [5] });
  });

  it('predicts clears without mutating the grid', () => {
    const grid = gridFrom(['#######.', ...Array(7).fill('........')]);
    const before = JSON.stringify(grid);
    assert.deepEqual(predictClears(grid, [[1]], 7, 0), { rows: [0], cols: [] });
    assert.equal(JSON.stringify(grid), before);
  });

  it('places a shape and reports its absolute cells', () => {
    const grid = createGrid();
    const cells = placeShape(grid, [[1, 0], [1, 1]], 3, 4, 7);
    assert.deepEqual(cells, [{ row: 4, col: 3 }, { row: 5, col: 3 }, { row: 5, col: 4 }]);
    assert.equal(grid[5][4], 7);
    assert.equal(grid[4][4], null);
  });

  it('counts each crossing cell once', () => {
    assert.equal(lineCells({ rows: [2], cols: [4] }).length, 15);
    assert.equal(lineCells({ rows: [0, 1], cols: [0, 1] }).length, 28);
  });

  it('knows when a shape fits nowhere', () => {
    const grid = gridFrom(Array(8).fill('#.#.#.#.'));
    assert.equal(canFitAnywhere(grid, [[1]]), true);
    assert.equal(canFitAnywhere(grid, [[1, 1]]), false);
  });

  it('encodes rows as bitmasks for the solver', () => {
    const grid = gridFrom(['#.......', '.......#', '########', ...Array(5).fill('........')]);
    assert.deepEqual(encodeGrid(grid).slice(0, 4), [1, 128, 255, 0]);
  });

  it('measures shapes', () => {
    assert.deepEqual(shapeSize([[1, 1, 1], [0, 1, 0]]), { width: 3, height: 2, blockCount: 4 });
  });
});
