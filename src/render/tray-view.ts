import { Container, Sprite } from 'pixi.js';
import type { TrayPiece } from '../core/session.ts';
import { GLOW_NAME, type BlockTextures } from './block-textures.ts';
import type { TrayPieceBounds } from './drag.ts';
import { createJewelMark } from './jewel-mark.ts';
import { BLOCK_TEXTURE_SIZE, slotCenter, type Layout } from './layout.ts';

export interface PieceView {
  piece: TrayPiece;
  container: Container;
  x: number;
  y: number;
  origX: number;
  origY: number;
  /** Current visual scale relative to board cells (animated towards targetScale). */
  scale: number;
  targetScale: number;
  inTray: boolean;
}

const SETTLE_RATE = 24;

/** Visual state of the three tray pieces, including the one being dragged. */
export class TrayView {
  readonly container = new Container();
  readonly views: (PieceView | null)[] = [null, null, null];
  private readonly textures: BlockTextures;

  constructor(textures: BlockTextures) {
    this.textures = textures;
  }

  setPieces(pieces: readonly TrayPiece[], layout: Layout): void {
    for (let slot = 0; slot < this.views.length; slot++) this.remove(slot);
    for (const piece of pieces) this.views[piece.slot] = this.createView(piece, layout);
    this.relayout(layout);
  }

  remove(slot: number): void {
    this.views[slot]?.container.destroy({ children: true });
    this.views[slot] = null;
  }

  get(slot: number): PieceView | null {
    return this.views[slot];
  }

  /** Rest positions for every slot; pieces in the tray snap there immediately. */
  relayout(layout: Layout): void {
    for (const view of this.views) {
      if (!view) continue;
      if (view.inTray) view.scale = view.targetScale = layout.trayScale;
      const center = slotCenter(layout, view.piece.slot);
      view.origX = center.x - view.piece.width * layout.cellSize * view.scale / 2;
      view.origY = center.y - view.piece.height * layout.cellSize * view.scale / 2;
      if (view.inTray) {
        view.x = view.origX;
        view.y = view.origY;
        this.applyTransform(view, layout);
      }
    }
  }

  /** Eases scale for all pieces and position for pieces returning to the tray. */
  update(dt: number, layout: Layout): void {
    const blend = 1 - Math.exp(-SETTLE_RATE * dt);
    for (const view of this.views) {
      if (!view) continue;
      view.scale += (view.targetScale - view.scale) * blend;
      if (view.inTray) {
        view.x += (view.origX - view.x) * blend;
        view.y += (view.origY - view.y) * blend;
        this.applyTransform(view, layout);
      }
    }
  }

  bounds(layout: Layout): TrayPieceBounds[] {
    return this.views.filter((v): v is PieceView => v !== null).map(view => ({
      slot: view.piece.slot,
      x: view.x,
      y: view.y,
      width: view.piece.width * layout.cellSize * view.scale,
      height: view.piece.height * layout.cellSize * view.scale,
    }));
  }

  /** Lifts a piece out of the tray into the drag layer, growing to board size. */
  beginDrag(slot: number, dragLayer: Container): PieceView | null {
    const view = this.views[slot];
    if (!view) return null;
    view.inTray = false;
    view.targetScale = 1;
    dragLayer.addChild(view.container);
    return view;
  }

  moveDragged(view: PieceView, x: number, y: number, layout: Layout): void {
    view.x = x;
    view.y = y;
    this.applyTransform(view, layout);
  }

  returnToTray(view: PieceView, layout: Layout): void {
    view.inTray = true;
    view.targetScale = layout.trayScale;
    this.container.addChild(view.container);
  }

  setFits(slot: number, fits: boolean): void {
    const view = this.views[slot];
    if (view) view.container.alpha = fits ? 1 : 0.35;
  }

  /** Revived pieces pop in from a tiny scale with a staggered drop. */
  playEntrance(layout: Layout, reduced: boolean): void {
    this.views.forEach((view, index) => {
      if (!view) return;
      view.scale = reduced ? layout.trayScale : 0.05;
      view.y += index * 24;
    });
  }

  retexture(): void {
    for (const view of this.views) {
      if (!view) continue;
      for (const child of view.container.children) {
        if (!(child instanceof Sprite) || child.name === GLOW_NAME) continue;
        child.texture = this.textures.blocks[view.piece.colorIdx];
        this.textures.syncGlow(child, view.piece.colorIdx);
      }
    }
  }

  private createView(piece: TrayPiece, layout: Layout): PieceView {
    const container = new Container();
    piece.matrix.forEach((cells, r) => cells.forEach((cell, c) => {
      if (cell !== 1) return;
      const sprite = new Sprite(this.textures.blocks[piece.colorIdx]);
      sprite.position.set(c * BLOCK_TEXTURE_SIZE, r * BLOCK_TEXTURE_SIZE);
      container.addChild(sprite);
      this.textures.syncGlow(sprite, piece.colorIdx);
    }));
    if (piece.jewel) {
      const mark = createJewelMark();
      mark.position.set(piece.jewel.col * BLOCK_TEXTURE_SIZE, piece.jewel.row * BLOCK_TEXTURE_SIZE);
      container.addChild(mark);
    }
    this.container.addChild(container);
    return {
      piece, container, x: 0, y: 0, origX: 0, origY: 0,
      scale: layout.trayScale, targetScale: layout.trayScale, inTray: true,
    };
  }

  private applyTransform(view: PieceView, layout: Layout): void {
    view.container.position.set(view.x, view.y);
    view.container.scale.set((layout.cellSize / BLOCK_TEXTURE_SIZE) * view.scale);
  }
}
