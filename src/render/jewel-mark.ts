// Gold bonus jewel drawn on top of a block, in block texture units.
import { Graphics } from 'pixi.js';
import { BLOCK_TEXTURE_SIZE } from './layout.ts';

export const JEWEL_MARK_NAME = 'jewel-mark';

export function createJewelMark(): Graphics {
  const g = new Graphics();
  g.label = JEWEL_MARK_NAME;
  const c = BLOCK_TEXTURE_SIZE / 2;
  const r = BLOCK_TEXTURE_SIZE * 0.27;
  // Soft halo, faceted gold body, bright upper facet and a sparkle.
  for (let spread = 4; spread >= 1; spread--) {
    g.circle(c, c, r + spread * 3).fill({ color: 0xffd23f, alpha: 0.08 });
  }
  g.poly([c, c - r, c + r, c, c, c + r, c - r, c])
    .fill(0xffc21a)
    .stroke({ width: 2, color: 0x5a3a00, alpha: 0.9 });
  g.poly([c, c - r, c + r * 0.55, c - r * 0.1, c, c, c - r * 0.55, c - r * 0.1]).fill(0xfff3b0);
  g.poly([c, c, c + r * 0.55, c - r * 0.1, c + r, c, c, c + r]).fill({ color: 0xb87800, alpha: 0.75 });
  g.circle(c - r * 0.3, c - r * 0.45, 1.8).fill({ color: 0xffffff, alpha: 0.95 });
  return g;
}
