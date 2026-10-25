// Pure 8x8 board model. No DOM, no Pixi: safe to use from tests and workers.

export const GRID_SIZE = 8;

/** A board cell holds the palette index of its block, or null when empty. */
export type Cell = number | null;
export type Grid = Cell[][];
export type Matrix = readonly (readonly number[])[];

export interface CellPosition {
  row: number;
  col: number;
}

export interface FullLines {
  rows: number[];
  cols: number[];
}

export function createGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array<Cell>(GRID_SIZE).fill(null));
}

export function clearGrid(grid: Grid): void {
  for (const row of grid) row.fill(null);
}

export function shapeSize(matrix: Matrix): { width: number; height: number; blockCount: number } {
  let blockCount = 0;
  for (const row of matrix) for (const cell of row) if (cell === 1) blockCount++;
  return { width: matrix[0].length, height: matrix.length, blockCount };
}

/** Occupied cells of a shape relative to its top-left corner, row by row. */
export function shapeCells(matrix: Matrix): CellPosition[] {
  const cells: CellPosition[] = [];
  matrix.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell === 1) cells.push({ row: r, col: c });
    }),
  );
  return cells;
}

export function canPlace(grid: Grid, matrix: Matrix, col: number, row: number): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c] !== 1) continue;
      const br = row + r;
      const bc = col + c;
      if (br < 0 || br >= GRID_SIZE || bc < 0 || bc >= GRID_SIZE) return false;
      if (grid[br][bc] !== null) return false;
    }
  }
  return true;
}

export function canFitAnywhere(grid: Grid, matrix: Matrix): boolean {
  for (let r = 0; r <= GRID_SIZE - matrix.length; r++) {
    for (let c = 0; c <= GRID_SIZE - matrix[0].length; c++) {
      if (canPlace(grid, matrix, c, r)) return true;
    }
  }
  return false;
}

/** Writes the shape into the grid and returns the absolute cells it occupies. */
export function placeShape(grid: Grid, matrix: Matrix, col: number, row: number, color: number): CellPosition[] {
  return shapeCells(matrix).map(cell => {
    const position = { row: row + cell.row, col: col + cell.col };
    grid[position.row][position.col] = color;
    return position;
  });
}

export function findFullLines(grid: Grid): FullLines {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) if (grid[r].every(v => v !== null)) rows.push(r);
  for (let c = 0; c < GRID_SIZE; c++) if (grid.every(row => row[c] !== null)) cols.push(c);
  return { rows, cols };
}

/** Lines that would be completed if the shape were dropped at (col, row). */
export function predictClears(grid: Grid, matrix: Matrix, col: number, row: number): FullLines {
  const simulated = grid.map(r => [...r]);
  placeShape(simulated, matrix, col, row, 0);
  return findFullLines(simulated);
}

/** Distinct cells covered by the given rows and columns: rows first, then columns. */
export function lineCells({ rows, cols }: FullLines): CellPosition[] {
  const seen = new Set<string>();
  const cells: CellPosition[] = [];
  const add = (row: number, col: number) => {
    const key = `${row},${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ row, col });
  };
  rows.forEach(r => {
    for (let c = 0; c < GRID_SIZE; c++) add(r, c);
  });
  cols.forEach(c => {
    for (let r = 0; r < GRID_SIZE; r++) add(r, c);
  });
  return cells;
}

export function isGridEmpty(grid: Grid): boolean {
  return grid.every(row => row.every(cell => cell === null));
}

/** Compact bitmask form used by the solver: one 8-bit mask per row. */
export function encodeGrid(grid: Grid): number[] {
  return grid.map(row => row.reduce<number>((mask, value, col) => mask | (value !== null ? 1 << col : 0), 0));
}
