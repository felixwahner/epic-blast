import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bevelNormals, insideDistance } from '../../src/render/logo-relief.ts';

/** A w×h RGBA image, opaque where `solid(x, y)` holds. */
function image(w: number, h: number, solid: (x: number, y: number) => boolean): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[(y * w + x) * 4 + 3] = solid(x, y) ? 255 : 0;
  return px;
}

const square = image(20, 20, (x, y) => x >= 4 && x < 16 && y >= 4 && y < 16);

test('inside distance is 0 outside, grows inward and stops at the cap', () => {
  const d = insideDistance(square, 20, 20, 4);
  assert.equal(d[0], 0);
  assert.equal(d[4 * 20 + 10], 1);
  assert.equal(d[5 * 20 + 10], 2);
  assert.equal(d[10 * 20 + 10], 4);
});

test('bevel normals are flat inside and outside and tilt outward at the edge', () => {
  const n = bevelNormals(square, 20, 20, 3);
  const at = (x: number, y: number) =>
    Array.from(n.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3)).map(v => v / 127.5 - 1);
  for (const [x, y] of [
    [0, 0],
    [10, 10],
  ]) {
    const [nx, ny, nz] = at(x, y);
    assert.ok(Math.abs(nx) < 0.01 && Math.abs(ny) < 0.01 && nz > 0.99);
  }
  // Left edge leans left, top edge leans up (y is up in the normal map).
  assert.ok(at(4, 10)[0] < -0.3);
  assert.ok(at(15, 10)[0] > 0.3);
  assert.ok(at(10, 4)[1] > 0.3);
  assert.ok(at(10, 15)[1] < -0.3);
});
