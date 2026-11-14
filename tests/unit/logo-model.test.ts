import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VERTEX_BYTES, parseLogoModel } from '../../src/render/logo-model.ts';

const file = readFileSync(new URL('../../src/assets/branding/epic-blast-logo.bin', import.meta.url));
const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

test('the shipped logo model parses into whole triangles', () => {
  const model = parseLogoModel(buffer);
  assert.ok(model.indices.length > 1000);
  assert.ok(Math.max(...model.indices) < model.vertices.length / VERTEX_BYTES);
  assert.equal(model.indices.length % 3, 0);
  assert.equal(model.vertices.length % VERTEX_BYTES, 0);
});

test('a truncated or foreign file is refused', () => {
  assert.throws(() => parseLogoModel(buffer.slice(0, buffer.byteLength - 2)));
  assert.throws(() => parseLogoModel(new TextEncoder().encode('GIF89a......').buffer));
});
