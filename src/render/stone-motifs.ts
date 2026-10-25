import { mixColor } from '../theme/themes.ts';

// Small motif per world, carved into every jewel of that world.
// Paths are SVG path data in a 0..100 box; the jewel face spans roughly 14..86.

const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
const square = (x: number, y: number, s: number) => `M${x} ${y} h${s} v${s} h${-s} Z`;

export interface StoneMotif {
  path: string;
  /** Filled shapes are carved as areas, the rest as lines. */
  fill?: boolean;
}

export const STONE_MOTIFS: Record<string, StoneMotif> = {
  'neon-arcade': { path: `M30 64 H46 L58 50 V38 M46 64 H70 ${circle(58, 34, 4)} ${circle(28, 64, 4)}` },
  'candy-reactor': {
    path: 'M50 50 m0 -4 a4 4 0 0 1 4 4 a8 8 0 0 1 -8 8 a12 12 0 0 1 -12 -12 a16 16 0 0 1 16 -16 a20 20 0 0 1 20 20',
  },
  'spring-bloom': {
    path:
      [0, 72, 144, 216, 288]
        .map(a =>
          circle(50 + Math.cos(((a - 90) * Math.PI) / 180) * 11, 50 + Math.sin(((a - 90) * Math.PI) / 180) * 11, 7),
        )
        .join(' ') + circle(50, 50, 4),
    fill: true,
  },
  'summer-splash': { path: 'M28 44 q5.5 -8 11 0 t11 0 t11 0 t11 0 M28 58 q5.5 -8 11 0 t11 0 t11 0 t11 0' },
  'autumn-ember': { path: 'M50 27 C66 38 68 56 50 73 C32 56 34 38 50 27 Z M50 36 V76 M50 50 L58 43 M50 60 L42 53' },
  'frozen-aurora': { path: 'M50 27 V73 M30 38.5 L70 61.5 M30 61.5 L70 38.5 M44 30 L50 36 L56 30 M44 70 L50 64 L56 70' },
  'dungeon-loot': { path: 'M50 27 L67 50 L50 73 L33 50 Z M50 38 V62 M42 50 H58' },
  'cosmic-overdrive': { path: 'M50 25 Q53 47 75 50 Q53 53 50 75 Q47 53 25 50 Q47 47 50 25 Z', fill: true },
  'volcanic-core': {
    path: 'M50 25 C60 38 70 48 65 61 C61 72 39 72 35 61 C31 51 41 45 44 37 C47 45 50 48 52 50 C55 43 53 33 50 25 Z',
    fill: true,
  },
  'storm-citadel': { path: 'M59 22 L34 54 H49 L41 78 L68 44 H53 Z', fill: true },
  'deep-sea-abyss': { path: `${circle(42, 58, 11)} ${circle(60, 40, 7)} ${circle(68, 26, 4)}` },
  'sky-kingdom': { path: 'M33 62 H67 A9 9 0 0 0 65 45 A12 12 0 0 0 43 41 A10 10 0 0 0 33 62 Z' },
  'glitch-dimension': {
    path: [square(30, 32, 10), square(46, 32, 10), square(38, 46, 10), square(58, 46, 10), square(48, 60, 10)].join(
      ' ',
    ),
    fill: true,
  },
  'toy-box': {
    path: [circle(36, 36, 8), circle(64, 36, 8), circle(36, 64, 8), circle(64, 64, 8)].join(' '),
    fill: true,
  },
  'steam-foundry': {
    path:
      `${circle(50, 50, 13)} ${circle(50, 50, 4)} ` +
      Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return `M${50 + Math.cos(a) * 13} ${50 + Math.sin(a) * 13} L${50 + Math.cos(a) * 21} ${50 + Math.sin(a) * 21}`;
      }).join(' '),
  },
  'jackpot-palace': { path: `${circle(50, 50, 21)} M50 36 L60 50 L50 64 L40 50 Z` },
  'desert-mirage': { path: `${circle(60, 37, 7)} M28 60 Q39 51 50 60 T72 60 M32 71 Q43 63 54 71 T72 69` },
  sketchbook: { path: 'M50 27 L56 43 L73 44 L60 55 L65 72 L50 62 L35 72 L40 55 L27 44 L44 43 Z' },
  'moonlit-dojo': { path: 'M57 26 A24 24 0 1 0 74 58 A18 18 0 1 1 57 26 Z', fill: true },
};

/** Motif shape as an opaque mask on a canvas of the jewel's size. */
function motifMask(size: number, motif: StoneMotif): HTMLCanvasElement {
  const mask = document.createElement('canvas');
  mask.width = mask.height = size;
  const ctx = mask.getContext('2d')!;
  const scale = size / 100;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;
  const path = new Path2D(motif.path);
  // CanvasRenderingContext2D.fill, not Array.prototype.fill.
  // oxlint-disable-next-line unicorn/no-array-fill-with-reference-type
  if (motif.fill) ctx.fill(path, 'evenodd');
  else ctx.stroke(path);
  return mask;
}

/**
 * Soft inner shadow of the motif: the inverse of the motif casts a blurred, offset
 * shadow into its own hole, which is then kept only inside the motif. Blurred
 * edges avoid the slivers a hard offset leaves at sharp points.
 */
function innerShadow(
  size: number,
  motif: StoneMotif,
  dx: number,
  dy: number,
  blur: number,
  color: string,
): HTMLCanvasElement {
  const scale = size / 100;
  const inverse = document.createElement('canvas');
  inverse.width = inverse.height = size;
  const inv = inverse.getContext('2d')!;
  inv.fillRect(0, 0, size, size);
  inv.globalCompositeOperation = 'destination-out';
  inv.drawImage(motifMask(size, motif), 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d')!;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetX = dx * scale;
  ctx.shadowOffsetY = dy * scale;
  ctx.drawImage(inverse, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(motifMask(size, motif), 0, 0);
  return out;
}

const tinted = (mask: HTMLCanvasElement, color: string): HTMLCanvasElement => {
  const ctx = mask.getContext('2d')!;
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, mask.width, mask.height);
  return mask;
};

/**
 * Carves a motif into a jewel canvas, in the jewel's own colour: a slightly darker
 * recessed floor with a soft shadow under its upper-left rim and a soft light along
 * its lower-right rim, matching the jewel's light from the upper left.
 */
export function drawStoneMotif(canvas: HTMLCanvasElement, motif: StoneMotif, color: string): void {
  const size = canvas.width;
  const ctx = canvas.getContext('2d')!;
  const tone = (t: number, target: string) => '#' + mixColor(color, target, t).toString(16).padStart(6, '0');
  ctx.save();
  // Multiplying by a light tint of the stone's own colour deepens it without greying it.
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.85;
  ctx.drawImage(tinted(motifMask(size, motif), tone(0.62, '#ffffff')), 0, 0);
  ctx.drawImage(innerShadow(size, motif, 1.4, 1.8, 2.4, tone(0.45, '#000000')), 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(innerShadow(size, motif, -1, -1.3, 1.8, tone(0.5, '#ffffff')), 0, 0);
  ctx.restore();
}
