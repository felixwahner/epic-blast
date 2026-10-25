import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { GRID_SIZE, type FullLines, type Grid, type Matrix } from '../core/board.ts';
import type { Palette, Theme } from '../theme/themes.ts';
import type { BlockTextures } from './block-textures.ts';
import { boardMaterialTiles, clearHighlightRects } from './board-geometry.ts';
import { BLOCK_TEXTURE_SIZE, type Layout } from './layout.ts';

const GHOST_POOL_SIZE = 9;

/** Board background, placed blocks, ghost preview and clear highlights. */
export class BoardView {
  readonly background = new Graphics();
  readonly materialLayer = new Container();
  readonly preview = new Graphics();
  readonly blocks = new Container();
  readonly ghosts = new Container();

  private readonly sprites: Sprite[][];
  private readonly ghostSprites: Sprite[] = [];
  private readonly textures: BlockTextures;

  constructor(textures: BlockTextures) {
    this.textures = textures;
    this.sprites = Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => {
      const sprite = new Sprite(textures.blocks[0]);
      sprite.visible = false;
      this.blocks.addChild(sprite);
      return sprite;
    }));
    // Pre-created pooled ghost sprites (zero allocation while dragging).
    for (let i = 0; i < GHOST_POOL_SIZE; i++) {
      const ghost = new Sprite(textures.blocks[0]);
      ghost.visible = false;
      ghost.alpha = 0.55;
      this.ghosts.addChild(ghost);
      this.ghostSprites.push(ghost);
    }
  }

  renderBackground(layout: Layout, palettes: readonly Palette[], theme: Theme, materialVariants: readonly Texture[] | undefined): void {
    const bg = this.background;
    bg.clear();
    for (const child of this.materialLayer.removeChildren()) child.destroy();
    if (materialVariants?.length) {
      this.renderMaterialBoard(layout, palettes, materialVariants);
      return;
    }
    this.renderSocketBoard(layout, palettes, theme);
  }

  syncBlocks(grid: Grid, layout: Layout): void {
    const cs = layout.cellSize;
    const scale = cs / BLOCK_TEXTURE_SIZE;
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
      const sprite = this.sprites[r][c];
      const cell = grid[r][c];
      if (cell !== null) {
        sprite.texture = this.textures.blocks[cell];
        sprite.position.set(layout.gridX + c * cs, layout.gridY + r * cs);
        sprite.scale.set(scale);
        sprite.visible = true;
        this.textures.syncGlow(sprite, cell);
      } else {
        sprite.visible = false;
        this.textures.hideGlow(sprite);
      }
    }
  }

  showGhost(matrix: Matrix, colorIdx: number, col: number, row: number, layout: Layout): void {
    this.clearGhost();
    const cs = layout.cellSize;
    let index = 0;
    matrix.forEach((cells, r) => cells.forEach((cell, c) => {
      if (cell !== 1 || index >= this.ghostSprites.length) return;
      const sprite = this.ghostSprites[index++];
      sprite.texture = this.textures.blocks[colorIdx];
      sprite.position.set(layout.gridX + (col + c) * cs, layout.gridY + (row + r) * cs);
      sprite.scale.set(cs / BLOCK_TEXTURE_SIZE);
      sprite.alpha = 0.55;
      sprite.visible = true;
    }));
  }

  clearGhost(): void {
    for (const sprite of this.ghostSprites) sprite.visible = false;
  }

  drawClearPreview(lines: FullLines, layout: Layout, color: number, intensity: number): void {
    this.preview.clear();
    this.preview.lineStyle(0);
    for (const rect of clearHighlightRects(lines, layout)) {
      this.preview.beginFill(color, intensity * 0.32);
      this.preview.drawRoundedRect(rect.x, rect.y, rect.width, rect.height, rect.radius);
      this.preview.endFill();
    }
  }

  clearPreview(): void {
    this.preview.clear();
  }

  retextureGhosts(): void {
    for (const sprite of this.ghostSprites) sprite.texture = this.textures.blocks[0];
  }

  private renderMaterialBoard(layout: Layout, palettes: readonly Palette[], variants: readonly Texture[]): void {
    const { gridX: x, gridY: y, gridWidth: size } = layout;
    // One dark board plane; empty sockets must never compete with playable blocks.
    this.background.beginFill(0x080e20, 0.97);
    this.background.drawRoundedRect(x, y, size, size, 5);
    this.background.endFill();
    for (const tile of boardMaterialTiles(layout, variants.length)) {
      const sprite = new Sprite(variants[tile.variant]);
      sprite.position.set(tile.x, tile.y);
      sprite.width = tile.size;
      sprite.height = tile.size;
      sprite.alpha = 0.8;
      // Whole sockets carry their own sculpted rims, so no drawn seams are needed.
      this.materialLayer.addChild(sprite);
    }
    const rim = new Graphics();
    // Dark chassis under the fine illuminated lip.
    rim.lineStyle(6, 0x070b17, 0.95);
    rim.drawRoundedRect(x - 3, y - 3, size + 6, size + 6, 6);
    for (let spread = 10; spread >= 2; spread -= 2) {
      rim.lineStyle(spread, palettes[0].base, 0.025);
      rim.drawRoundedRect(x - 2, y - 2, size + 4, size + 4, 5);
    }
    rim.lineStyle(1.5, palettes[0].hi, 0.65);
    rim.drawRoundedRect(x - 2, y - 2, size + 4, size + 4, 4);
    for (let spread = 9; spread >= 1; spread -= 2) {
      rim.lineStyle(spread, 0xccfaff, 0.055);
      rim.moveTo(x + 8, y - 2); rim.lineTo(x + size * 0.32, y - 2);
      rim.moveTo(x - 2, y + 8); rim.lineTo(x - 2, y + size * 0.22);
      rim.lineStyle(spread, palettes[1].hi, 0.045);
      rim.moveTo(x + size * 0.75, y + size + 2); rim.lineTo(x + size - 6, y + size + 2);
    }
    this.materialLayer.addChild(rim);
  }

  /** Fallback while the material atlas loads: drawn sockets with subtle world markings. */
  private renderSocketBoard(layout: Layout, palettes: readonly Palette[], theme: Theme): void {
    const g = this.background;
    const { gridX: gx, gridY: gy, cellSize: cs, gridWidth: gw } = layout;
    g.beginFill(palettes[0].sh, 0.97);
    g.drawRect(gx, gy, gw, gw);
    g.endFill();
    const cellGap = 2;
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
      const cx = gx + c * cs;
      const cy = gy + r * cs;
      g.lineStyle(1, palettes[0].hi, 0.12);
      g.beginFill(palettes[0].sh, 0.35);
      g.drawRoundedRect(cx + cellGap, cy + cellGap, cs - cellGap * 2, cs - cellGap * 2, 3);
      g.endFill();
      // Quiet material markings on empty sockets, matching each world.
      g.lineStyle(1, palettes[0].hi, 0.045);
      const x = cx + cs * 0.25, y = cy + cs * 0.25;
      if (theme.material === 'ice' || theme.material === 'lava') {
        g.moveTo(x, y); g.lineTo(x + cs * 0.3, y + cs * 0.25); g.lineTo(x + cs * 0.2, y + cs * 0.5);
      } else if (theme.material === 'rune') {
        g.drawPolygon([x + cs * 0.25, y, x + cs * 0.4, y + cs * 0.25, x + cs * 0.25, y + cs * 0.5, x + cs * 0.1, y + cs * 0.25]);
      } else if (theme.material === 'star') {
        g.drawCircle(x + cs * 0.2, y + cs * 0.15, 1);
      } else {
        g.moveTo(x, y + cs * 0.1); g.lineTo(x + cs * 0.5, y + cs * 0.3);
      }
      g.lineStyle(0);
      // Socket inner shadow
      g.beginFill(0x0a0b12, 0.22);
      g.drawRect(cx + cellGap, cy + cellGap, cs - cellGap * 2, 2);
      g.drawRect(cx + cellGap, cy + cellGap, 2, cs - cellGap * 2);
      g.endFill();
    }
  }
}
