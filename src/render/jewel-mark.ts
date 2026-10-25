// Gold bonus jewel drawn on top of a block, in block texture units.
import { Graphics } from 'pixi.js';
import { BLOCK_TEXTURE_SIZE } from './layout.ts';

export const JEWEL_MARK_NAME = 'jewel-mark';

export function createJewelMark(): Graphics {
  const g = new Graphics();
  g.name = JEWEL_MARK_NAME;
  const c = BLOCK_TEXTURE_SIZE / 2;
  const r = BLOCK_TEXTURE_SIZE * 0.27;
  // Soft halo, faceted gold body, bright upper facet and a sparkle.
  for (let spread = 4; spread >= 1; spread--) {
    g.beginFill(0xffd23f, 0.08);
    g.drawCircle(c, c, r + spread * 3);
    g.endFill();
  }
  g.lineStyle(2, 0x5a3a00, 0.9);
  g.beginFill(0xffc21a);
  g.drawPolygon([c, c - r, c + r, c, c, c + r, c - r, c]);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xfff3b0);
  g.drawPolygon([c, c - r, c + r * 0.55, c - r * 0.1, c, c, c - r * 0.55, c - r * 0.1]);
  g.endFill();
  g.beginFill(0xb87800, 0.75);
  g.drawPolygon([c, c, c + r * 0.55, c - r * 0.1, c + r, c, c, c + r]);
  g.endFill();
  g.beginFill(0xffffff, 0.95);
  g.drawCircle(c - r * 0.3, c - r * 0.45, 1.8);
  g.endFill();
  return g;
}
