// Pure mesh math for a box with rounded edges, kept free of Pixi so it can be unit tested.

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

/**
 * A rounded box centred on the origin: a subdivided cube whose points are pushed
 * out from a shrunken core by `radius`, which gives smooth normals on the rim.
 * `rimSegments` sets how many rows each rounded edge gets.
 */
export function roundedBoxData(
  width: number,
  height: number,
  depth: number,
  radius: number,
  rimSegments = 4,
): MeshData {
  const half = [width / 2, height / 2, depth / 2];
  const inner = half.map(v => Math.max(0, v - radius));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // [axis the face looks along, u axis, v axis, sign]
  const faces: [number, number, number, number][] = [
    [0, 1, 2, 1],
    [0, 1, 2, -1],
    [1, 2, 0, 1],
    [1, 2, 0, -1],
    [2, 0, 1, 1],
    [2, 0, 1, -1],
  ];
  const seg = rimSegments;
  const n = seg * 2 + 2;
  // Spend most rows on the rounded rim and few on the flat middle.
  const remap = (t: number, axis: number): number => {
    const edge = Math.min(1, radius / half[axis]);
    const k = t * n;
    if (k <= seg) return -1 + (k / seg) * edge;
    if (k >= n - seg) return 1 - ((n - k) / seg) * edge;
    return -1 + edge + ((k - seg) / (n - 2 * seg)) * (2 - 2 * edge);
  };
  for (const [axis, u, v, sign] of faces) {
    const start = positions.length / 3;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[u] = remap(i / n, u) * half[u];
        p[v] = remap(j / n, v) * half[v];
        const core = p.map((x, a) => Math.max(-inner[a], Math.min(inner[a], x)));
        const d = p.map((x, a) => x - core[a]);
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        for (let a = 0; a < 3; a++) {
          positions.push(core[a] + (d[a] / len) * radius);
          normals.push(d[a] / len);
        }
        uvs.push(i / n, j / n);
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = start + j * (n + 1) + i;
        const b = a + n + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // Wind every triangle so its front faces along its vertex normals.
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const e1 = [0, 1, 2].map(k => positions[b * 3 + k] - positions[a * 3 + k]);
    const e2 = [0, 1, 2].map(k => positions[c * 3 + k] - positions[a * 3 + k]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    let dot = 0;
    for (let k = 0; k < 3; k++) dot += cross[k] * (normals[a * 3 + k] + normals[b * 3 + k] + normals[c * 3 + k]);
    if (dot < 0) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}
