// Procedural jewel shading applied to the reference stone image.
import type { Material } from '../theme/themes.ts';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Tint midtones while preserving neutral specular light and deep bevel shadows. */
export function jewelColor(luminance: number, color: number, specular = 0): [number, number, number] {
  const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const l = clamp01(luminance);
  const shade = Math.min(1, 0.08 + 0.92 * Math.pow(l, 1.25) + 0.14 * Math.sin(Math.PI * l) ** 2);
  const [r, g, b] = channels.map(channel => Math.round(channel * shade * (1 - specular) + 255 * specular));
  return [r, g, b];
}

export function jewelSurface(image: CanvasImageSource & { width: number; height: number }, color: number, size = 256, material: Material = 'ice'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Retain complete rounded outline and all four bevels of the source jewel.
  ctx.drawImage(image, image.width * 0.085, image.height * 0.085, image.width * 0.82, image.height * 0.82, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  const neon = material === 'circuit';
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] > 240) pixels.data[i + 3] = 255;
    // Preserve the original cyan tile's soft shading, and only whiten real highlights.
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
    const x = (i / 4 % size) / size, y = Math.floor(i / 4 / size) / size;
    const rawLight = (g * 0.6 + b * 0.4) / 255;
    // The face emits clean color; deep shading belongs only to the bevels.
    const faceX = clamp01((x - 0.11) / 0.09) * clamp01((0.9 - x) / 0.09);
    const faceY = clamp01((y - 0.12) / 0.09) * clamp01((0.87 - y) / 0.09);
    const face = faceX * faceY;
    // Opaque emissive resin in the neon world, versus translucent jewels elsewhere.
    const light = rawLight * (1 - face) + (neon ? 0.94 : Math.max(0.91, rawLight)) * face;
    const white = Math.pow(r / Math.max(1, r, g, b), 3) * (neon ? 0.45 : 1);
    // A broad soft top-facet reflection, not a sharp drawn inner outline.
    const upper = 0.62 * Math.exp(-Math.pow((y - 0.065) / 0.045, 2)) * (0.75 + 0.25 * (1 - x));
    // Broad translucent reflection across the face gives depth to the material.
    const faceMask = clamp01((x - 0.14) * 12) * clamp01((0.86 - x) * 12) * clamp01((y - 0.16) * 12) * clamp01((0.84 - y) * 12);
    const reflection = 0.14 * Math.exp(-Math.pow((y - (0.28 + 0.18 * x)) / 0.18, 2)) * faceMask;
    const rgb = jewelColor(light, color, Math.min(neon ? 0.65 : 0.9, white + upper + (neon ? 0 : reflection)));
    // Preserve a contact shadow instead of allowing neighboring glows to fuse.
    const lower = 1 - 0.25 * Math.exp(-Math.pow((y - 0.96) / 0.035, 2));
    const right = 1 - 0.16 * Math.exp(-Math.pow((x - 0.97) / 0.03, 2));
    for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = Math.round(rgb[channel] * lower * right);
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
