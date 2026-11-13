// Reads the 3D logo's compact model file, kept free of WebGL so it can be unit tested.
//
// Layout (little-endian): "LGO1", vertex count u32, index count u32, then per vertex 12 bytes
// (position int16 ×3 in 1/16384 logo widths, normal int8 ×3, colour uint8 ×3), then the
// triangle indices as uint16, or uint32 when there are 65536 vertices or more.

export interface LogoModel {
  readonly vertices: Uint8Array;
  readonly indices: Uint16Array | Uint32Array;
}

export function parseLogoModel(buffer: ArrayBuffer): LogoModel {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (magic !== 'LGO1' || buffer.byteLength < 12) throw new Error('Not a logo model');
  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const wide = vertexCount >= 65536;
  const vertexBytes = vertexCount * 12;
  if (buffer.byteLength !== 12 + vertexBytes + indexCount * (wide ? 4 : 2) || indexCount % 3)
    throw new Error('Logo model is truncated');
  const vertices = new Uint8Array(buffer, 12, vertexBytes);
  const start = 12 + vertexBytes;
  // Copied so the indices are aligned whatever the vertex count.
  const raw = buffer.slice(start);
  const indices = wide ? new Uint32Array(raw) : new Uint16Array(raw);
  for (const i of indices) if (i >= vertexCount) throw new Error('Logo model index out of range');
  return { vertices, indices };
}
