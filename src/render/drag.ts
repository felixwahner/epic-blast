// Pure drag & drop geometry: finger offset, tray hit testing and snapping.
import type { Layout } from './layout.ts';

/** Keep the bottom edge above the finger, even for tall pieces. */
export function dragLift(height: number, cellSize: number): number {
  return Math.max(72, (height * cellSize) / 2 + 32);
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TrayPieceBounds {
  slot: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HIT_PADDING = 18;

/** Hit area for a tray piece. Touch input gets the full slot column. */
export function trayHitArea(layout: Layout, piece: TrayPieceBounds, touch: boolean): Rect {
  if (touch) {
    // Exclusive right edges avoid overlapping targets between neighbouring slots.
    const left = layout.gridX + layout.slotWidth * piece.slot;
    return {
      left,
      right: left + layout.slotWidth,
      top: Math.min(layout.trayY, piece.y - HIT_PADDING),
      bottom: Math.max(layout.trayY + layout.trayHeight, piece.y + piece.height + HIT_PADDING),
    };
  }
  return {
    left: piece.x - HIT_PADDING,
    right: piece.x + piece.width + HIT_PADDING,
    top: piece.y - HIT_PADDING,
    bottom: piece.y + piece.height + HIT_PADDING,
  };
}

/** Returns the slot of the first piece under the pointer, or null. */
export function hitTestTray(
  layout: Layout,
  pieces: readonly TrayPieceBounds[],
  point: Point,
  touch: boolean,
): number | null {
  for (const piece of pieces) {
    const area = trayHitArea(layout, piece, touch);
    if (point.x >= area.left && point.x < area.right && point.y >= area.top && point.y <= area.bottom)
      return piece.slot;
  }
  return null;
}

export interface DragPlacement {
  /** Top-left of the piece at full board scale (the snapping anchor). */
  anchor: Point;
  /** Top-left of the piece drawn at its current (animated) scale. */
  visual: Point;
  col: number;
  row: number;
}

/**
 * Positions a dragged piece above the pointer and snaps it to the nearest grid
 * cell. `scale` is the piece's current visual scale (1 = board size).
 */
export function dragPlacement(
  layout: Layout,
  pointer: Point,
  widthCells: number,
  heightCells: number,
  scale: number,
): DragPlacement {
  const fullWidth = widthCells * layout.cellSize;
  const fullHeight = heightCells * layout.cellSize;
  const anchor = {
    x: pointer.x - fullWidth / 2,
    y: pointer.y - fullHeight / 2 - dragLift(heightCells, layout.cellSize),
  };
  const visualWidth = widthCells * layout.cellSize * scale;
  const visualHeight = heightCells * layout.cellSize * scale;
  return {
    anchor,
    visual: { x: anchor.x + (fullWidth - visualWidth) / 2, y: anchor.y + (fullHeight - visualHeight) / 2 },
    col: Math.round((anchor.x - layout.gridX) / layout.cellSize),
    row: Math.round((anchor.y - layout.gridY) / layout.cellSize),
  };
}
