// Pure board geometry used by the Pixi board view (kept Pixi-free for tests).
import { GRID_SIZE, lineCells, type FullLines } from '../core/board.ts';
import type { Layout } from './layout.ts';

export interface MaterialTile {
  row: number;
  col: number;
  x: number;
  y: number;
  size: number;
  variant: number;
}

/** Deterministic placement of the 64 board material samples. */
export function boardMaterialTiles(layout: Layout, variantCount: number): MaterialTile[] {
  const tiles: MaterialTile[] = [];
  for (let row = 0; row < GRID_SIZE; row++)
    for (let col = 0; col < GRID_SIZE; col++) {
      tiles.push({
        row,
        col,
        x: layout.gridX + col * layout.cellSize + 1,
        y: layout.gridY + row * layout.cellSize + 1,
        size: layout.cellSize - 2,
        variant: (row * 11 + col * 7 + row * col * 3) % variantCount,
      });
    }
  return tiles;
}

export interface RoundedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

const HALO_SPREADS = [9, 7, 5, 3, 1];

/** Layered translucent halos behind each cell of a predicted clear; no enclosing rectangle. */
export function clearHighlightRects(lines: FullLines, layout: Layout): RoundedRect[] {
  const { cellSize: cs, gridX: gx, gridY: gy } = layout;
  return lineCells(lines).flatMap(({ row, col }) =>
    HALO_SPREADS.map(spread => ({
      x: gx + col * cs + 2 - spread,
      y: gy + row * cs + 2 - spread,
      width: cs - 4 + spread * 2,
      height: cs - 4 + spread * 2,
      radius: 4 + spread,
    })),
  );
}
