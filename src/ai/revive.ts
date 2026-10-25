import type { RandomSource } from '../core/shapes.ts';
import { applyMove, moves, type RowMasks, type SolverPiece } from './solver.ts';

/**
 * Find three pieces that complete a line without changing the board, followed
 * by a board on which at least one catalog piece still fits.
 */
export function reviveDefinitions<T extends SolverPiece>(
  rows: RowMasks,
  catalog: readonly T[],
  random: RandomSource = Math.random,
): SolverPiece[] {
  const ordered = catalog
    .map(def => ({ def, rank: random() }))
    .sort((a, b) => a.rank - b.rank)
    .map(x => x.def);

  function finish(board: RowMasks, path: SolverPiece[]): SolverPiece[] | null {
    if (path.length === 3) return moves(board, catalog).length ? path : null;
    for (const def of ordered)
      for (const move of moves(board, [def])) {
        const next = applyMove(board, def, move);
        const result = finish(next.rows, [...path, def]);
        if (result) return result;
      }
    return null;
  }

  for (let axis = 0; axis < 2; axis++)
    for (let line = 0; line < 8; line++) {
      const target = Array.from({ length: 8 }, (_, i) => (axis ? [i, line] : [line, i]));
      const holes = target.filter(([y, x]) => !(rows[y] & (1 << x)));
      if (!holes.length) continue;
      const search = (board: RowMasks, path: SolverPiece[]): SolverPiece[] | null => {
        if (path.length === 3) return null;
        for (const def of ordered)
          for (const move of moves(board, [def])) {
            const fillsOnlyHoles = def.matrix.every((row, dy) =>
              row.every((cell, dx) => !cell || holes.some(([y, x]) => y === move.y + dy && x === move.x + dx)),
            );
            if (!fillsOnlyHoles) continue;
            const next = applyMove(board, def, move);
            if (next.lines) {
              const completed = finish(next.rows, [...path, def]);
              if (completed) return completed;
            }
            const found = search(next.rows, [...path, def]);
            if (found) return found;
          }
        return null;
      };
      const path = search(rows, []);
      if (path) return path;
    }

  // Disconnected gaps can require more than three ordinary pieces. A rescue
  // piece matching one line's gaps guarantees a clear even on such boards.
  const y = rows.findIndex(mask => mask !== 255);
  if (y < 0) throw new Error('Revive requires an uncleared board');
  const cells = Array.from({ length: 8 }, (_, x) => (rows[y] & (1 << x) ? 0 : 1));
  const first = cells.indexOf(1),
    last = cells.lastIndexOf(1);
  const rescue: SolverPiece = { matrix: [cells.slice(first, last + 1)] };
  const next = applyMove(rows, rescue, { x: first, y });
  const completed = finish(next.rows, [rescue]);
  if (!completed) throw new Error('No playable revive continuation');
  return completed;
}
