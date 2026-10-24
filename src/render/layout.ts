// Pure responsive layout math shared by rendering, input and browser tests.
import { GRID_SIZE } from '../core/board.ts';

export const TRAY_LABEL_HEIGHT = 24;
export const BLOCK_TEXTURE_SIZE = 48;
const H_PADDING = 26;

export interface Layout {
  viewWidth: number;
  viewHeight: number;
  cellSize: number;
  gridWidth: number;
  gridX: number;
  gridY: number;
  trayY: number;
  trayHeight: number;
  slotWidth: number;
  /** Scale of pieces resting in the tray relative to board cells. */
  trayScale: number;
}

export const emptyLayout = (): Layout => ({
  viewWidth: 0, viewHeight: 0, cellSize: 0, gridWidth: 0, gridX: 0, gridY: 0,
  trayY: 0, trayHeight: 0, slotWidth: 0, trayScale: 0.56,
});

export function computeLayout(width: number, height: number): Layout {
  const w = Math.floor(width);
  const h = Math.floor(height);
  const maxGridByWidth = w - H_PADDING * 2;
  const maxGridByHeight = Math.min(h - 134, (h - 44) / 1.375);
  const cellSize = Math.floor(Math.min(maxGridByWidth, maxGridByHeight) / GRID_SIZE);
  const gridWidth = cellSize * GRID_SIZE;
  const gridX = Math.floor((w - gridWidth) / 2);
  const trayHeight = Math.max(90, cellSize * 3.0);
  const verticalRemainder = h - (gridWidth + 24 + trayHeight);
  const gridY = Math.max(12, Math.floor(verticalRemainder * 0.35));
  const trayY = gridY + gridWidth + 20;
  const slotWidth = gridWidth / 3;
  // Fit even five-cell shapes inside a slot with room at both edges.
  const trayScale = Math.min(0.56,
    (slotWidth - 16) / (5 * cellSize),
    (trayHeight - TRAY_LABEL_HEIGHT - 12) / (5 * cellSize));
  return { viewWidth: w, viewHeight: h, cellSize, gridWidth, gridX, gridY, trayY, trayHeight, slotWidth, trayScale };
}

/** Center of a board cell in view coordinates. */
export function cellCenter(layout: Layout, row: number, col: number): { x: number; y: number } {
  return {
    x: layout.gridX + (col + 0.5) * layout.cellSize,
    y: layout.gridY + (row + 0.5) * layout.cellSize,
  };
}

/** Average center of a set of cells, e.g. the epicenter of a line clear. */
export function cellsCentroid(layout: Layout, cells: readonly { row: number; col: number }[]): { x: number; y: number } {
  const row = cells.reduce((sum, c) => sum + c.row, 0) / cells.length;
  const col = cells.reduce((sum, c) => sum + c.col, 0) / cells.length;
  return cellCenter(layout, row, col);
}

/** Center of a tray slot, below the combo label. */
export function slotCenter(layout: Layout, slot: number): { x: number; y: number } {
  return {
    x: layout.gridX + layout.slotWidth * slot + layout.slotWidth / 2,
    y: layout.trayY + (layout.trayHeight + TRAY_LABEL_HEIGHT) / 2,
  };
}
