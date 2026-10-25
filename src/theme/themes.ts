// Pure world/palette model. DOM application lives in ui/theme-dom.ts and
// Pixi material decoration in render/materials.ts.

export type Material =
  | 'circuit'
  | 'candy'
  | 'leaf'
  | 'ice'
  | 'wood'
  | 'rune'
  | 'star'
  | 'lava'
  | 'bolt'
  | 'bubble'
  | 'cloud'
  | 'pixel'
  | 'stud'
  | 'gear'
  | 'chip'
  | 'sand'
  | 'scribble'
  | 'brush';

export interface Palette {
  base: number;
  hi: number;
  sh: number;
  hex: string;
}

export interface Theme {
  index: number;
  /** Folder of the world's scenery and board material under assets/images/worlds. */
  slug: string;
  key: string;
  name: string;
  primary: string;
  secondary: string;
  material: Material;
  stage: number;
  palettes: Palette[];
}

export const WORLDS: readonly (readonly [name: string, primary: string, secondary: string, material: Material])[] = [
  ['NEON ARCADE', '#00f5ff', '#ff36d9', 'circuit'],
  ['CANDY REACTOR', '#ff72b6', '#71ffdf', 'candy'],
  ['SPRING BLOOM', '#8eecb6', '#d09bff', 'leaf'],
  ['SUMMER SPLASH', '#27dcff', '#ff9471', 'ice'],
  ['AUTUMN EMBER', '#ed9949', '#ae4268', 'wood'],
  ['FROZEN AURORA', '#9bebff', '#a395ff', 'ice'],
  ['DUNGEON LOOT', '#48e6a0', '#ffd16b', 'rune'],
  ['COSMIC OVERDRIVE', '#b18cff', '#67caff', 'star'],
  ['VOLCANIC CORE', '#ff773e', '#ff3c64', 'lava'],
  ['STORM CITADEL', '#a9c8ff', '#ffe14d', 'bolt'],
  ['DEEP SEA ABYSS', '#2d6bff', '#c6ff3d', 'bubble'],
  ['SKY KINGDOM', '#ffde59', '#ff8ad8', 'cloud'],
  ['GLITCH DIMENSION', '#39ff14', '#ff1f1f', 'pixel'],
  ['TOY BOX', '#ff2d2d', '#ffd21f', 'stud'],
  ['STEAM FOUNDRY', '#ffb347', '#4ee6d2', 'gear'],
  ['JACKPOT PALACE', '#ffd700', '#e0102f', 'chip'],
  ['DESERT MIRAGE', '#ff5a36', '#7a5cff', 'sand'],
  ['SKETCHBOOK', '#2f6bff', '#f5ff3d', 'scribble'],
  ['MOONLIT DOJO', '#ff3b2f', '#4b3cff', 'brush'],
];

/** Folder name of a world's art, e.g. 'NEON ARCADE' -> 'neon-arcade'. */
export const worldSlug = (index: number): string => WORLDS[index][0].toLowerCase().replace(/\s+/g, '-');

/**
 * Appends shuffled rounds of every world until the order covers `length` worlds.
 * `first` (Neon Arcade by default) opens a game; each later round visits every
 * world once and never repeats the world that ended the previous round.
 */
export function extendWorldOrder(
  order: readonly number[],
  length: number,
  random: () => number = Math.random,
  first = 0,
): number[] {
  const out = [...order];
  while (out.length < length) {
    const round = WORLDS.map((_, index) => index);
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    const lead = out.length === 0 ? first : out[out.length - 1];
    const at = round.indexOf(lead);
    // The first round starts at the opening world; later rounds push the repeat out of the first slot.
    if (out.length === 0) [round[0], round[at]] = [round[at], round[0]];
    else if (at === 0) [round[0], round[1]] = [round[1], round[0]];
    out.push(...round);
  }
  return out;
}

export const PALETTE_COUNT = 8;

export function mixColor(a: string, b: string, t: number): number {
  const x = parseInt(a.slice(1), 16),
    y = parseInt(b.slice(1), 16);
  return [16, 8, 0].reduce(
    (out, shift) => out | (Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t) << shift),
    0,
  );
}

/** Below this CIELAB distance two stone colours read as the same colour. */
const SAME_COLOR_DELTA_E = 12;
/** Replacements for a fixed hue that collides with a world colour. */
const SPARE_HUES = ['#a8ff12', '#12ffd8', '#12c8ff', '#ff12f0', '#ff1830'];

const labCurve = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function lab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const x = labCurve((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = labCurve(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = labCurve((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIELAB distance between two hex colours. */
export const deltaE = (a: string, b: string): number => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

/** Preserves hue while enforcing a luminous, saturated neon body, not pastel. */
const neonHex = (color: string): string => {
  const raw = parseInt(color.slice(1), 16);
  const channels = [16, 8, 0].map(shift => (raw >> shift) & 255);
  const max = Math.max(...channels),
    min = Math.min(...channels);
  const neon = channels.map(channel => Math.round(18 + ((channel - min) / Math.max(1, max - min)) * 237));
  return '#' + ((neon[0] << 16) | (neon[1] << 8) | neon[2]).toString(16).padStart(6, '0');
};

/** Brightness stage (0..3) of a world from its progress (0..1). */
const stageOf = (progress: number): number => Math.min(3, Math.floor(progress * 4));

/** Key of `themeFor(world, progress)`, cheap enough to compare every frame. */
export const themeKey = (world: number, progress: number): string => `${world}:${stageOf(progress)}`;

/**
 * Theme of the `world`-th world of a game (1-based). `order` maps that position to a
 * world; without one the worlds follow their listed order.
 */
export function themeFor(world: number, progress = 0, order: readonly number[] = []): Theme {
  const index = order[world - 1] ?? (world - 1) % WORLDS.length;
  const [name, firstColor, secondColor, material] = WORLDS[index];
  const cycle = Math.floor((world - 1) / WORLDS.length);
  const primary = cycle % 2 ? secondColor : firstColor;
  const secondary = cycle % 2 ? firstColor : secondColor;
  const stage = stageOf(progress);
  const hues = [primary, secondary, '#ffca08', '#168bff', '#ff168f', '#9020ff', '#16f58a', '#ff6814'].map(neonHex);
  // A fixed hue that nearly matches a world colour would give two look-alike stones: swap in a spare.
  for (let i = 2; i < hues.length; i++) {
    if (Math.min(deltaE(hues[i], hues[0]), deltaE(hues[i], hues[1])) >= SAME_COLOR_DELTA_E) continue;
    const others = hues.filter((_, j) => j !== i);
    const spread = (spare: string) => Math.min(...others.map(o => deltaE(spare, o)));
    hues[i] = SPARE_HUES.map(neonHex).reduce((best, spare) => (spread(spare) > spread(best) ? spare : best));
  }
  const palettes = hues.map((hex): Palette => {
    const base = parseInt(hex.slice(1), 16);
    return { base, hi: mixColor(hex, '#ffffff', 0.28), sh: mixColor(hex, '#000000', 0.55), hex };
  });
  return {
    index,
    slug: worldSlug(index),
    key: themeKey(world, progress),
    name: name + (cycle ? ` · ECLIPSE ${cycle}` : ''),
    primary,
    secondary,
    material,
    stage,
    palettes,
  };
}
