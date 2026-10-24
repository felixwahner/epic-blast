// Pure world/palette model. DOM application lives in ui/theme-dom.ts and
// Pixi material decoration in render/materials.ts.

export type Material = 'circuit' | 'candy' | 'leaf' | 'ice' | 'wood' | 'rune' | 'star' | 'lava';

export interface Palette {
  base: number;
  hi: number;
  sh: number;
  hex: string;
}

export interface Theme {
  index: number;
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
];

export const PALETTE_COUNT = 8;

export function mixColor(a: string, b: string, t: number): number {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  return [16, 8, 0].reduce((out, shift) => out | (Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t) << shift), 0);
}

export function themeFor(level: number, progress = 0): Theme {
  const index = (level - 1) % WORLDS.length;
  const [name, firstColor, secondColor, material] = WORLDS[index];
  const cycle = Math.floor((level - 1) / WORLDS.length);
  const primary = cycle % 2 ? secondColor : firstColor;
  const secondary = cycle % 2 ? firstColor : secondColor;
  const stage = Math.min(3, Math.floor(progress * 4));
  const hues = [primary, secondary, '#ffca08', '#168bff', '#ff168f', '#9020ff', '#16f58a', '#ff6814'];
  const palettes = hues.map((color): Palette => {
    const raw = parseInt(color.slice(1), 16);
    const channels = [16, 8, 0].map(shift => (raw >> shift) & 255);
    const max = Math.max(...channels), min = Math.min(...channels);
    // Preserve hue while enforcing a luminous, saturated neon body, not pastel.
    const neon = channels.map(channel => Math.round(18 + (channel - min) / Math.max(1, max - min) * 237));
    const base = (neon[0] << 16) | (neon[1] << 8) | neon[2];
    const hex = '#' + base.toString(16).padStart(6, '0');
    return { base, hi: mixColor(hex, '#ffffff', 0.28), sh: mixColor(hex, '#000000', 0.55), hex };
  });
  return { index, key: `${level}:${stage}`, name: name + (cycle ? ` · ECLIPSE ${cycle}` : ''), primary, secondary, material, stage, palettes };
}
