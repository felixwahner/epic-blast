// Reads the 3D logo's compact model file, kept free of WebGL so it can be unit tested.
//
// Layout (little-endian): "LGO2", vertex count u32, index count u32, then per vertex 16 bytes
// (position int16 ×3 in 1/16384 logo widths, normal int8 ×3, a kind byte (0 body, 1 raised part), the art position
// as uint16 ×2 in 1/65535 of the art, two pad bytes), then the triangle indices as uint16,
// or uint32 when there are 65536 vertices or more.

/** Bytes per vertex. */
export const VERTEX_BYTES = 16;

export interface LogoModel {
  readonly vertices: Uint8Array;
  readonly indices: Uint16Array | Uint32Array;
}

export function parseLogoModel(buffer: ArrayBuffer): LogoModel {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (magic !== 'LGO2' || buffer.byteLength < 12) throw new Error('Not a logo model');
  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const wide = vertexCount >= 65536;
  const vertexBytes = vertexCount * VERTEX_BYTES;
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
