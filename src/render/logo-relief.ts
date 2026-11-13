// Pure helpers for the 3D logo, kept free of WebGL so they can be unit tested.

/**
 * Normal map (RGBA bytes) for a rounded front edge `bevel` pixels wide around the opaque
 * parts of an RGBA image. Normals point out of the screen with y up; flat areas are (0, 0, 1).
 */
export function bevelNormals(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bevel: number,
): Uint8ClampedArray<ArrayBuffer> {
  const dist = insideDistance(rgba, width, height, bevel + 1);
  const heightAt = (x: number, y: number): number => {
    const d = dist[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
    const t = 1 - Math.min(1, Math.max(0, d - 0.5) / bevel);
    return bevel * Math.sqrt(1 - t * t);
  };
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let nx = 0;
      let ny = 0;
      if (dist[y * width + x] > 0) {
        nx = -(heightAt(x + 1, y) - heightAt(x - 1, y)) / 2;
        ny = (heightAt(x, y + 1) - heightAt(x, y - 1)) / 2;
      }
      const len = Math.hypot(nx, ny, 1);
      out[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  return out;
}

/** Chamfer distance from each opaque pixel to the nearest see-through one, capped at `cap`; 0 outside. */
export function insideDistance(rgba: Uint8ClampedArray, width: number, height: number, cap: number): Float32Array {
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = rgba[i * 4 + 3] >= 128 ? cap : 0;
  const D = Math.SQRT2;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : d[y * width + x]);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
    }
  return d;
}
