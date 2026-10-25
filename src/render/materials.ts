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
  else if (material === 'bolt') { g.lineStyle(3, palette.hi, 0.65); g.moveTo(s * 0.58, s * 0.18); g.lineTo(s * 0.36, s * 0.52); g.lineTo(s * 0.56, s * 0.48); g.lineTo(s * 0.42, s * 0.82); }
  else if (material === 'bubble') { g.drawCircle(s * 0.36, s * 0.64, s * 0.1); g.drawCircle(s * 0.6, s * 0.42, s * 0.06); g.drawCircle(s * 0.7, s * 0.24, s * 0.035); }
  else if (material === 'cloud') { g.moveTo(s * 0.26, s * 0.62); g.arc(s * 0.37, s * 0.58, s * 0.11, Math.PI * 0.9, Math.PI * 1.85); g.arc(s * 0.57, s * 0.55, s * 0.13, Math.PI * 1.15, Math.PI * 2.05); g.lineTo(s * 0.26, s * 0.62); }
  else if (material === 'pixel') { g.lineStyle(0); g.beginFill(palette.hi, 0.45); for (const [x, y] of [[0.25, 0.3], [0.45, 0.3], [0.35, 0.5], [0.6, 0.5], [0.5, 0.7]]) g.drawRect(s * x, s * y, s * 0.1, s * 0.1); g.endFill(); }
  else if (material === 'stud') { for (const x of [0.32, 0.68]) for (const y of [0.32, 0.68]) g.drawCircle(s * x, s * y, s * 0.1); }
  else if (material === 'gear') { g.drawCircle(s * 0.5, s * 0.5, s * 0.15); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(s * (0.5 + Math.cos(a) * 0.15), s * (0.5 + Math.sin(a) * 0.15)); g.lineTo(s * (0.5 + Math.cos(a) * 0.24), s * (0.5 + Math.sin(a) * 0.24)); } }
  else if (material === 'chip') { g.drawCircle(s * 0.5, s * 0.5, s * 0.26); g.drawCircle(s * 0.5, s * 0.5, s * 0.14); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.moveTo(s * (0.5 + Math.cos(a) * 0.18), s * (0.5 + Math.sin(a) * 0.18)); g.lineTo(s * (0.5 + Math.cos(a) * 0.26), s * (0.5 + Math.sin(a) * 0.26)); } }
  else if (material === 'sand') { for (const y of [0.35, 0.52, 0.69]) { g.moveTo(s * 0.2, s * y); g.quadraticCurveTo(s * 0.35, s * (y - 0.06), s * 0.5, s * y); g.quadraticCurveTo(s * 0.65, s * (y + 0.06), s * 0.8, s * y); } }
  else if (material === 'scribble') { for (let i = 0; i < 4; i++) { g.moveTo(s * (0.22 + i * 0.12), s * 0.76); g.lineTo(s * (0.38 + i * 0.12), s * 0.28); } }
  else if (material === 'brush') { g.lineStyle(5, palette.hi, 0.5); g.moveTo(s * 0.24, s * 0.72); g.quadraticCurveTo(s * 0.42, s * 0.26, s * 0.78, s * 0.34); }
  else { g.moveTo(s * 0.25, s * 0.7); g.lineTo(s * 0.25, s * 0.4); g.lineTo(s * 0.7, s * 0.4); g.drawCircle(s * 0.7, s * 0.4, 3); }
  g.lineStyle(0);
}
