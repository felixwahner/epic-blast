import { BLEND_MODES, Graphics, MIPMAP_MODES, Rectangle, Sprite, Texture, type IRenderer } from 'pixi.js';
import type { Material, Palette } from '../theme/themes.ts';
import { jewelSurface } from './jewel-surface.ts';
import { BLOCK_TEXTURE_SIZE } from './layout.ts';
import { drawMaterial } from './materials.ts';

export const GLOW_NAME = 'stone-glow';
const GLOW_MARGIN = 12;

/** Draws the procedural fallback block used until the reference stone has loaded. */
function drawProceduralBlock(g: Graphics, p: Palette, material: Material): void {
  const s = BLOCK_TEXTURE_SIZE;
  // Opaque full-cell foundation keeps neighbouring blocks joined.
  g.beginFill(p.sh); g.drawRect(0, 0, s, s); g.endFill();
  g.beginFill(p.base, 0.65); g.drawRect(1, 1, s - 2, s - 2); g.endFill();
  // Soft colored halo inside the cell footprint; geometry remains aligned.
  for (let spread = 5; spread >= 1; spread--) {
    g.lineStyle(spread * 2, p.base, 0.035);
    g.drawRoundedRect(6, 6, s - 12, s - 12, 4);
  }
  g.lineStyle(0);
  // Offset dark extrusion and lower bevel give the blocks weight.
  g.beginFill(0x02030a, 0.8); g.drawRoundedRect(5, 8, s - 8, s - 10, 3); g.endFill();
  g.beginFill(p.sh); g.drawRoundedRect(4, 4, s - 10, s - 10, 3); g.endFill();
  g.beginFill(p.base); g.drawRoundedRect(6, 5, s - 15, s - 16, 2); g.endFill();
  // Glassy face: broad upper reflection fading into a darker lower face.
  for (let y = 9; y < s - 13; y++) {
    const t = (y - 9) / (s - 22);
    g.beginFill(t < 0.4 ? 0xffffff : p.sh, t < 0.4 ? 0.18 * (1 - t / 0.4) : 0.2 * (t - 0.4) / 0.6);
    g.drawRect(9, y, s - 23, 1); g.endFill();
  }
  g.beginFill(p.hi, 0.95);
  g.drawPolygon([5, 5, s - 7, 5, s - 13, 10, 10, 10, 10, s - 14, 5, s - 8]); g.endFill();
  g.beginFill(p.sh, 0.9);
  g.drawPolygon([s - 7, 6, s - 7, s - 7, 5, s - 7, 11, s - 13, s - 13, s - 13, s - 13, 12]); g.endFill();
  // Narrow white glints rather than a single flat square highlight.
  g.lineStyle(1.5, 0xffffff, 0.8); g.moveTo(8, 7); g.lineTo(s * 0.57, 7);
  g.lineStyle(1, 0xffffff, 0.4); g.moveTo(7, 9); g.lineTo(7, s * 0.45);
  g.lineStyle(0);
  drawMaterial(g, material, s, p);
}

/** One block texture and one additive glow texture per palette color. */
export class BlockTextures {
  blocks: Texture[] = [];
  glows: Texture[] = [];
  /** Device pixels per block texture edge; matched to the on-screen cell so blocks map 1:1. */
  pixelSize = BLOCK_TEXTURE_SIZE * 4;
  private readonly renderer: IRenderer;
  private readonly glowOf = new WeakMap<Sprite, Sprite>();

  constructor(renderer: IRenderer) {
    this.renderer = renderer;
  }

  /**
   * Regenerates all textures. Returns a disposer for the previous set, to be
   * called once every sprite has been switched to the new textures.
   */
  rebuild(palettes: readonly Palette[], material: Material, referenceStone: Texture | null, pixelSize = this.pixelSize): () => void {
    this.pixelSize = Math.max(16, Math.round(pixelSize));
    const oldBlocks = this.blocks, oldGlows = this.glows;
    this.blocks = palettes.map(p => this.createBlock(p, material, referenceStone));
    this.glows = palettes.map(p => this.createGlow(p));
    return () => {
      oldBlocks.forEach(texture => texture.destroy(true));
      oldGlows.forEach(texture => texture.destroy(true));
    };
  }

  /** Attaches (or updates) the additive glow sprite that sits behind a block sprite. */
  syncGlow(sprite: Sprite, colorIdx: number): void {
    const glow = this.glowOf.get(sprite);
    if (!sprite.parent) {
      if (glow) glow.visible = false;
      return;
    }
    let target = glow;
    if (!target) {
      target = new Sprite(this.glows[colorIdx]);
      target.name = GLOW_NAME;
      target.blendMode = BLEND_MODES.ADD;
      target.alpha = 0.65;
      sprite.parent.addChildAt(target, 0);
      this.glowOf.set(sprite, target);
    }
    target.texture = this.glows[colorIdx];
    target.position.set(sprite.x - GLOW_MARGIN * sprite.scale.x, sprite.y - GLOW_MARGIN * sprite.scale.y);
    target.scale.copyFrom(sprite.scale);
    target.visible = sprite.visible;
  }

  hideGlow(sprite: Sprite): void {
    const glow = this.glowOf.get(sprite);
    if (glow) glow.visible = false;
  }

  private createBlock(p: Palette, material: Material, referenceStone: Texture | null): Texture {
    const s = BLOCK_TEXTURE_SIZE;
    const resolution = this.pixelSize / s;
    if (referenceStone) {
      const source = (referenceStone.baseTexture.resource as unknown as { source: HTMLImageElement }).source;
      // Shade the jewel directly at display resolution: one high-quality downscale
      // from the source instead of several bilinear ones, which blurred the bevels.
      const surface = jewelSurface(source, p.base, this.pixelSize, material);
      return Texture.from(surface, { resolution, mipmap: MIPMAP_MODES.ON });
    }
    const g = new Graphics();
    drawProceduralBlock(g, p, material);
    const texture = this.renderer.generateTexture(g, { region: new Rectangle(0, 0, s, s), resolution });
    g.destroy(true);
    return texture;
  }

  private createGlow(p: Palette): Texture {
    const s = BLOCK_TEXTURE_SIZE;
    const halo = new Graphics();
    for (let spread = 12; spread >= 2; spread -= 2) {
      halo.lineStyle(spread * 2, p.base, 0.03);
      halo.drawRoundedRect(3, 3, s - 6, s - 6, s * 0.14);
    }
    const texture = this.renderer.generateTexture(halo, { region: new Rectangle(-GLOW_MARGIN, -GLOW_MARGIN, s + GLOW_MARGIN * 2, s + GLOW_MARGIN * 2) });
    halo.destroy(true);
    return texture;
  }
}
