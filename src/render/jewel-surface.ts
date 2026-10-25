// Procedural jewel shading applied to the reference stone image.
import type { Material } from '../theme/themes.ts';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Tint midtones while preserving neutral specular light and deep bevel shadows. */
export function jewelColor(luminance: number, color: number, specular = 0): [number, number, number] {
  const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const shade = jewelShade(luminance);
  const [r, g, b] = channels.map(channel => Math.round(channel * shade * (1 - specular) + 255 * specular));
  return [r, g, b];
}

function jewelShade(luminance: number): number {
  const l = clamp01(luminance);
  return Math.min(1, 0.08 + 0.92 * Math.pow(l, 1.25) + 0.14 * Math.sin(Math.PI * l) ** 2);
}

/**
 * Colour-independent shading of one jewel size: every block colour shares the same
 * source pixels, light and highlights, so only the final tint runs per colour.
 */
interface JewelShading {
  alpha: Uint8ClampedArray;
  /** Per pixel: body shade, the share left after specular light, added white and contact shadows. */
  shade: Float64Array;
  keep: Float64Array;
  white: Float64Array;
  lower: Float64Array;
  right: Float64Array;
}

const shadingCache = new WeakMap<object, Map<string, JewelShading>>();
/** Sizes kept per source image; resizing only ever needs the current and the previous one. */
const SHADING_CACHE_SIZES = 4;

function jewelShading(
  image: CanvasImageSource & { width: number; height: number },
  size: number,
  neon: boolean,
): JewelShading {
  let sizes = shadingCache.get(image);
  if (!sizes) shadingCache.set(image, (sizes = new Map()));
  const key = `${size}:${neon}`;
  const cached = sizes.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  // Retain complete rounded outline and all four bevels of the source jewel.
  ctx.drawImage(
    image,
    image.width * 0.085,
    image.height * 0.085,
    image.width * 0.82,
    image.height * 0.82,
    0,
    0,
    size,
    size,
  );
  const data = ctx.getImageData(0, 0, size, size).data;
  const count = size * size;
  const shading: JewelShading = {
    alpha: new Uint8ClampedArray(count),
    shade: new Float64Array(count),
    keep: new Float64Array(count),
    white: new Float64Array(count),
    lower: new Float64Array(count),
    right: new Float64Array(count),
  };
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    shading.alpha[p] = data[i + 3] > 240 ? 255 : data[i + 3];
    // Preserve the original cyan tile's soft shading, and only whiten real highlights.
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const x = (p % size) / size,
      y = Math.floor(p / size) / size;
    // Stretch the source's soft bevel shading so lit and shadowed facets read crisply.
    const rawLight = clamp01(0.5 + ((g * 0.6 + b * 0.4) / 255 - 0.5) * 1.6);
    // The face emits clean color; deep shading belongs only to the bevels.
    // A narrow transition keeps the facet edge sharp at small cell sizes.
    const faceX = clamp01((x - 0.13) / 0.04) * clamp01((0.88 - x) / 0.04);
    const faceY = clamp01((y - 0.14) / 0.04) * clamp01((0.85 - y) / 0.04);
    const face = faceX * faceY;
    // Opaque emissive resin in the neon world lit from the upper left, versus translucent jewels elsewhere.
    const neonFace = 1 - 0.16 * clamp01((x + y - 0.3) / 1.4);
    const light = rawLight * (1 - face) + (neon ? neonFace : Math.max(0.91, rawLight)) * face;
    const white = Math.pow(r / Math.max(1, r, g, b), 3) * (neon ? 0.8 : 1);
    // A broad soft top-facet reflection, not a sharp drawn inner outline.
    const upper = 0.62 * Math.exp(-Math.pow((y - 0.065) / 0.045, 2)) * (0.75 + 0.25 * (1 - x));
    // Broad translucent reflection across the face gives depth to the material.
    const faceMask =
      clamp01((x - 0.14) * 12) * clamp01((0.86 - x) * 12) * clamp01((y - 0.16) * 12) * clamp01((0.84 - y) * 12);
    const reflection = 0.14 * Math.exp(-Math.pow((y - (0.28 + 0.18 * x)) / 0.18, 2)) * faceMask;
    const specular = Math.min(neon ? 0.8 : 0.9, white + upper + (neon ? 0 : reflection));
    // The terms of jewelColor() that do not depend on the colour.
    shading.shade[p] = jewelShade(light);
    shading.keep[p] = 1 - specular;
    shading.white[p] = 255 * specular;
    // Preserve a contact shadow instead of allowing neighboring glows to fuse.
    shading.lower[p] = 1 - 0.25 * Math.exp(-Math.pow((y - 0.96) / 0.035, 2));
    shading.right[p] = 1 - 0.16 * Math.exp(-Math.pow((x - 0.97) / 0.03, 2));
  }
  if (sizes.size >= SHADING_CACHE_SIZES) sizes.delete(sizes.keys().next().value!);
  sizes.set(key, shading);
  return shading;
}

export function jewelSurface(
  image: CanvasImageSource & { width: number; height: number },
  color: number,
  size = 256,
  material: Material = 'ice',
): HTMLCanvasElement {
  const shading = jewelShading(image, size, material === 'circuit');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(size, size);
  const out = pixels.data;
  const red = (color >> 16) & 255,
    green = (color >> 8) & 255,
    blue = color & 255;
  const { alpha, shade, keep, white, lower, right } = shading;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const k = shade[p],
      s = keep[p],
      w = white[p],
      l = lower[p],
      r = right[p];
    out[i] = Math.round(Math.round(red * k * s + w) * l * r);
    out[i + 1] = Math.round(Math.round(green * k * s + w) * l * r);
    out[i + 2] = Math.round(Math.round(blue * k * s + w) * l * r);
    out[i + 3] = alpha[p];
  }
  ctx.putImageData(pixels, 0, 0);
  // Explicit silhouette, independent of tiny source-image corner radii.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  ctx.roundRect(size * 0.008, size * 0.008, size * 0.984, size * 0.984, size * 0.14);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
