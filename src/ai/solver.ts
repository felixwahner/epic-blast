// Bitmask board model shared by the background solver and gameplay feedback.
// A board is eight row masks; bit `x` of `rows[y]` is set when (x, y) is occupied.
import type { Matrix } from '../core/board.ts';

export type RowMasks = readonly number[];

export interface SolverPiece {
  readonly matrix: Matrix;
}

export interface Move {
  slot: number;
  x: number;
  y: number;
}

export interface SolveResult {
  placed: number;
  lines: number;
  quality: number;
  path: Move[];
}

export type RoundScore = Pick<SolveResult, 'placed' | 'lines' | 'quality'>;

const FULL_ROW = 255;

export function moves(rows: RowMasks, pieces: readonly (SolverPiece | null)[]): Move[] {
  const result: Move[] = [];
  pieces.forEach((piece, slot) => {
    if (!piece) return;
    const matrix = piece.matrix;
    for (let y = 0; y <= 8 - matrix.length; y++) {
      for (let x = 0; x <= 8 - matrix[0].length; x++) {
        if (matrix.every((row, dy) => row.every((cell, dx) => !cell || !(rows[y + dy] & (1 << (x + dx)))))) {
          result.push({ slot, x, y });
        }
      }
    }
  });
  return result;
}

const bitCount = (mask: number): number => {
  let n = 0;
  while (mask) { mask &= mask - 1; n++; }
  return n;
};

/** Places a piece and resolves simultaneous row/column clears. Never mutates `rows`. */
export function applyMove(rows: RowMasks, piece: SolverPiece, move: Pick<Move, 'x' | 'y'>): { rows: number[]; lines: number } {
  const next = rows.slice();
  piece.matrix.forEach((row, dy) => row.forEach((cell, dx) => {
    if (cell) next[move.y + dy] |= 1 << (move.x + dx);
  }));
  const fullRows = next.map((mask, i) => (mask === FULL_ROW ? i : -1)).filter(i => i >= 0);
  let columns = FULL_ROW;
  next.forEach(mask => { columns &= mask; });
  for (let y = 0; y < 8; y++) next[y] = fullRows.includes(y) ? 0 : next[y] & ~columns;
  return { rows: next, lines: fullRows.length + bitCount(columns) };
}

/** Heuristic for future room: empty cells first, then adjacent empty pairs. */
export function boardQuality(rows: RowMasks): number {
  let empty = 0, space = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (rows[y] & (1 << x)) continue;
    empty++;
    if (x < 7 && !(rows[y] & (1 << (x + 1)))) space++;
    if (y < 7 && !(rows[y + 1] & (1 << x))) space++;
  }
  return empty * 128 + space;
}

export function compare(a: RoundScore, b: RoundScore): number {
  return a.placed - b.placed || a.lines - b.lines || a.quality - b.quality;
}

/** Exhaustive search over every position and order of the remaining pieces. */
export function solve(rows: RowMasks, pieces: readonly (SolverPiece | null)[]): SolveResult {
  const memo = new Map<string, SolveResult>();
  function search(board: RowMasks, remaining: readonly (SolverPiece | null)[]): SolveResult {
    const key = board.join(',') + ':' + remaining.map(p => (p ? 1 : 0)).join('');
    const cached = memo.get(key);
    if (cached) return cached;
    let best: SolveResult = { placed: 0, lines: 0, quality: boardQuality(board), path: [] };
    for (const move of moves(board, remaining)) {
      const next = applyMove(board, remaining[move.slot]!, move);
      const rest = remaining.slice();
      rest[move.slot] = null;
      const tail = search(next.rows, rest);
      const candidate = { placed: tail.placed + 1, lines: tail.lines + next.lines, quality: tail.quality, path: [move, ...tail.path] };
      if (compare(candidate, best) > 0) best = candidate;
    }
    memo.set(key, best);
    return best;
  }
  return search(rows, pieces);
}
