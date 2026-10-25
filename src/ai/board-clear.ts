// Finds short piece sequences that empty the whole board. Used by the dealer to
// occasionally hand out a "clean sweep" when the board is sparse enough.
import type { Matrix } from '../core/board.ts';
import type { RandomSource, ShapeDefinition } from '../core/shapes.ts';
import { applyMove, moves, type RowMasks } from './solver.ts';

/** Largest number of cells a single piece can fill (3x3 square). */
const MAX_PIECE_CELLS = 9;
/** Three-piece sweeps are only searched on boards with at most this many blocks. */
const THREE_PIECE_MAX_CELLS = 20;
/** First moves explored for three-piece sweeps, best (emptiest) first. */
const THREE_PIECE_FIRST_MOVES = 24;
/** Upper bound on finisher checks for three-piece sweeps, to keep dealing responsive. */
const THREE_PIECE_BUDGET = 2500;

const bitCount = (mask: number): number => {
  let n = 0;
  while (mask) {
    mask &= mask - 1;
    n++;
  }
  return n;
};

export const filledCells = (rows: RowMasks): number => rows.reduce((sum, mask) => sum + bitCount(mask), 0);

/** Translation-independent key of a cell set given as eight row masks. */
function cellsKey(rows: readonly number[]): string {
  const used = rows.map((mask, y) => (mask ? y : -1)).filter(y => y >= 0);
  if (!used.length) return '';
  const all = rows.reduce((or, mask) => or | mask, 0);
  const shift = Math.log2(all & -all);
  return rows
    .slice(used[0], used.at(-1)! + 1)
    .map(mask => mask >> shift)
    .join(',');
}

const matrixKey = (matrix: Matrix): string =>
  cellsKey(matrix.map(row => row.reduce((mask, cell, x) => mask | (cell ? 1 << x : 0), 0)));

const indexCache = new WeakMap<readonly ShapeDefinition[], Map<string, ShapeDefinition>>();

function shapeIndex(catalog: readonly ShapeDefinition[]): Map<string, ShapeDefinition> {
  let index = indexCache.get(catalog);
  if (!index) {
    index = new Map();
    for (const def of catalog) if (!index.has(matrixKey(def.matrix))) index.set(matrixKey(def.matrix), def);
    indexCache.set(catalog, index);
  }
  return index;
}

/**
 * Returns a catalog piece that empties the board in a single placement, or null.
 * Instead of trying every position, this enumerates which rows and columns would
 * be cleared: the piece must then be exactly the empty cells of those lines, and
 * every occupied cell must lie on one of them.
 */
export function finishingShape(rows: RowMasks, catalog: readonly ShapeDefinition[]): ShapeDefinition | null {
  if (!filledCells(rows)) return null;
  const index = shapeIndex(catalog);
  const colCounts = Array.from({ length: 8 }, (_, x) => rows.reduce((n, mask) => n + ((mask >> x) & 1), 0));
  // A line can only be completed by one piece when at most five of its cells are empty.
  const rowCandidates = [0, 1, 2, 3, 4, 5, 6, 7].filter(y => bitCount(rows[y]) >= 3);
  const colMask = colCounts.reduce((mask, n, x) => mask | (n >= 3 ? 1 << x : 0), 0);
  // Fast reject: every occupied cell needs a candidate row or column.
  for (let y = 0; y < 8; y++) if (!rowCandidates.includes(y) && rows[y] & ~colMask) return null;

  for (let subset = 0; subset < 1 << rowCandidates.length; subset++) {
    let rowSel = 0,
      rowGap = 0;
    rowCandidates.forEach((y, i) => {
      if (subset & (1 << i)) {
        rowSel |= 1 << y;
        rowGap += 8 - bitCount(rows[y]);
      }
    });
    if (rowGap > MAX_PIECE_CELLS) continue;
    // Occupied cells outside the chosen rows must be cleared by their columns.
    let required = 0;
    for (let y = 0; y < 8; y++) if (!(rowSel & (1 << y))) required |= rows[y];
    if (required & ~colMask) continue;
    const optional = colMask & ~required;
    // Iterate every superset of `required` within the candidate columns.
    for (let extra = optional; ; extra = (extra - 1) & optional) {
      const colSel = required | extra;
      const gap = rows.map((mask, y) => (rowSel & (1 << y) ? 255 : colSel) & ~mask);
      const size = filledCells(gap);
      if (size > 0 && size <= MAX_PIECE_CELLS) {
        const def = index.get(cellsKey(gap));
        if (def) return def;
      }
      if (extra === 0) break;
    }
  }
  return null;
}

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  return items
    .map(item => ({ item, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map(x => x.item);
}

/**
 * Searches for up to `maxPieces` catalog pieces that, placed in order, leave the
 * board completely empty. Returns them in placement order, or null.
 */
export function boardClearPath(
  rows: RowMasks,
  catalog: readonly ShapeDefinition[],
  random: RandomSource = Math.random,
  maxPieces = 3,
): ShapeDefinition[] | null {
  const single = finishingShape(rows, catalog);
  if (single) return [single];
  if (maxPieces < 2 || !filledCells(rows)) return null;

  const ordered = shuffled(catalog, random);
  const firsts: { def: ShapeDefinition; rows: number[]; cells: number }[] = [];
  for (const def of ordered)
    for (const move of moves(rows, [def])) {
      const next = applyMove(rows, def, move);
      const finisher = finishingShape(next.rows, catalog);
      if (finisher) return [def, finisher];
      firsts.push({ def, rows: next.rows, cells: filledCells(next.rows) });
    }
  if (maxPieces < 3 || filledCells(rows) > THREE_PIECE_MAX_CELLS) return null;

  let budget = THREE_PIECE_BUDGET;
  firsts.sort((a, b) => a.cells - b.cells);
  for (const first of firsts.slice(0, THREE_PIECE_FIRST_MOVES)) {
    for (const def of ordered)
      for (const move of moves(first.rows, [def])) {
        const finisher = finishingShape(applyMove(first.rows, def, move).rows, catalog);
        if (finisher) return [first.def, def, finisher];
        if (--budget <= 0) return null;
      }
  }
  return null;
}
