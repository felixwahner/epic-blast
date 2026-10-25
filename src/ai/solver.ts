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

/** True when every piece can be placed in some order, with clears resolved in between. */
export function canPlaceAll(rows: RowMasks, pieces: readonly (SolverPiece | null)[]): boolean {
  const rest = pieces.filter((piece): piece is SolverPiece => piece !== null);
  if (!rest.length) return true;
  const tried = new Set<string>();
  return rest.some((piece, index) => {
    // Identical shapes lead to the same positions; try each one once.
    const key = JSON.stringify(piece.matrix);
    if (tried.has(key)) return false;
    tried.add(key);
    const others = rest.filter((_, other) => other !== index);
    return moves(rows, [piece]).some(move => canPlaceAll(applyMove(rows, piece, move).rows, others));
  });
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

/** Search node: a result whose path is a linked list, so candidates allocate no arrays. */
interface SearchResult {
  placed: number;
  lines: number;
  quality: number;
  move: Move | null;
  tail: SearchResult | null;
}

/** Row masks of a piece's cells, plus its size. */
interface PieceMask {
  rows: number[];
  width: number;
  height: number;
}

const pieceMask = ({ matrix }: SolverPiece): PieceMask => ({
  rows: matrix.map(row => row.reduce((mask, cell, x) => mask | (cell ? 1 << x : 0), 0)),
  width: matrix[0].length,
  height: matrix.length,
});

/** Exhaustive search over every position and order of the remaining pieces. */
export function solve(rows: RowMasks, pieces: readonly (SolverPiece | null)[]): SolveResult {
  const masks = pieces.map(piece => (piece ? pieceMask(piece) : null));
  // Memo keyed by numbers instead of strings: rows 0-3 and the remaining pieces in
  // the outer key, rows 4-7 in the inner one.
  const memo = new Map<number, Map<number, SearchResult>>();
  const board = new Array<number>(8);

  function search(remaining: number): SearchResult {
    const high = ((board[0] | board[1] << 8 | board[2] << 16) + board[3] * 2 ** 24) * 2 ** pieces.length + remaining;
    const low = (board[4] | board[5] << 8 | board[6] << 16) + board[7] * 2 ** 24;
    let level = memo.get(high);
    const cached = level?.get(low);
    if (cached) return cached;
    let best: SearchResult = { placed: 0, lines: 0, quality: boardQuality(board), move: null, tail: null };
    const saved = board.slice();
    for (let slot = 0; slot < masks.length; slot++) {
      const piece = masks[slot];
      if (!piece || !(remaining & (1 << slot))) continue;
      for (let y = 0; y <= 8 - piece.height; y++) {
        for (let x = 0; x <= 8 - piece.width; x++) {
          let fits = true;
          for (let dy = 0; dy < piece.height && fits; dy++) fits = !(saved[y + dy] & (piece.rows[dy] << x));
          if (!fits) continue;
          // Place, then clear full rows and columns together.
          for (let dy = 0; dy < piece.height; dy++) board[y + dy] = saved[y + dy] | (piece.rows[dy] << x);
          let columns = FULL_ROW, fullRows = 0;
          for (let i = 0; i < 8; i++) {
            columns &= board[i];
            if (board[i] === FULL_ROW) fullRows |= 1 << i;
          }
          for (let i = 0; i < 8; i++) board[i] = fullRows & (1 << i) ? 0 : board[i] & ~columns;
          const lines = bitCount(fullRows) + bitCount(columns);
          const tail = search(remaining & ~(1 << slot));
          for (let i = 0; i < 8; i++) board[i] = saved[i];
          const placed = tail.placed + 1, total = tail.lines + lines;
          if ((placed - best.placed || total - best.lines || tail.quality - best.quality) > 0) {
            best = { placed, lines: total, quality: tail.quality, move: { slot, x, y }, tail };
          }
        }
      }
    }
    if (!level) memo.set(high, level = new Map());
    level.set(low, best);
    return best;
  }

  for (let i = 0; i < 8; i++) board[i] = rows[i];
  const all = pieces.reduce((mask, piece, slot) => (piece ? mask | (1 << slot) : mask), 0);
  const result = search(all);
  const path: Move[] = [];
  for (let node: SearchResult | null = result; node?.move; node = node.tail) path.push(node.move);
  return { placed: result.placed, lines: result.lines, quality: result.quality, path };
}
