import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roundedBoxData } from '../../src/render/rounded-box.ts';

describe('roundedBoxData', () => {
  const box = roundedBoxData(1, 0.4, 1, 0.1, 3);

  it('stays inside the requested size', () => {
    const p = box.positions;
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(Math.abs(p[i]) <= 0.5 + 1e-6);
      assert.ok(Math.abs(p[i + 1]) <= 0.2 + 1e-6);
      assert.ok(Math.abs(p[i + 2]) <= 0.5 + 1e-6);
    }
  });

  it('has unit normals that point outward', () => {
    const { positions: p, normals: n } = box;
    for (let i = 0; i < n.length; i += 3) {
      assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-5);
      assert.ok(p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2] > 0);
    }
  });

  it('winds every triangle front-facing along its normals', () => {
    const { positions: p, normals: n, indices } = box;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const e1 = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]);
      const e2 = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.hypot(...cross) < 1e-9) continue; // degenerate corner triangle
      const dot = [0, 1, 2].reduce((s, k) => s + cross[k] * (n[a * 3 + k] + n[b * 3 + k] + n[c * 3 + k]), 0);
      assert.ok(dot > 0, `triangle ${t / 3} faces inward`);
    }
  });

  it('fits 16-bit indices', () => {
    assert.ok(box.positions.length / 3 < 65536);
  });
});
