import type { Graphics } from 'pixi.js';
import type { Material, Palette } from '../theme/themes.ts';

/** Engraves the world's material motif onto a block texture. */
export function drawMaterial(g: Graphics, material: Material, size: number, palette: Palette): void {
  const s = size;
  g.lineStyle(2, palette.hi, 0.55);
  if (material === 'ice') { g.moveTo(s * 0.25, s * 0.2); g.lineTo(s * 0.6, s * 0.55); g.lineTo(s * 0.45, s * 0.8); g.moveTo(s * 0.6, s * 0.55); g.lineTo(s * 0.8, s * 0.4); }
  else if (material === 'candy') { for (let x = 16; x < s - 10; x += 12) { g.moveTo(x, 12); g.lineTo(x - 5, s - 12); } }
  else if (material === 'wood') { for (let y = 18; y < s - 10; y += 10) { g.moveTo(12, y); g.lineTo(s * 0.5, y + 3); g.lineTo(s - 12, y); } }
  else if (material === 'leaf') { g.moveTo(s * 0.3, s * 0.7); g.lineTo(s * 0.7, s * 0.3); g.lineTo(s * 0.55, s * 0.6); g.lineTo(s * 0.3, s * 0.7); }
  else if (material === 'rune') { g.drawPolygon([s * 0.5, s * 0.25, s * 0.7, s * 0.5, s * 0.5, s * 0.75, s * 0.3, s * 0.5]); }
  else if (material === 'lava') { g.lineStyle(3, 0xffcc66, 0.85); g.moveTo(s * 0.3, 12); g.lineTo(s * 0.55, s * 0.4); g.lineTo(s * 0.4, s * 0.6); g.lineTo(s * 0.7, s - 12); }
  else if (material === 'star') { g.drawCircle(s * 0.65, s * 0.3, 2); g.drawCircle(s * 0.35, s * 0.6, 3); g.moveTo(s * 0.55, s * 0.65); g.lineTo(s * 0.75, s * 0.65); }
  else { g.moveTo(s * 0.25, s * 0.7); g.lineTo(s * 0.25, s * 0.4); g.lineTo(s * 0.7, s * 0.4); g.drawCircle(s * 0.7, s * 0.4, 3); }
  g.lineStyle(0);
}
