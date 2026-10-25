import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHAPE_DEFINITIONS, pickWeightedShape } from '../../src/core/shapes.ts';

describe('shape catalog', () => {
  it('contains only rectangular, non-empty matrices of 0/1 that fit the board', () => {
    for (const { matrix, weight } of SHAPE_DEFINITIONS) {
      assert(weight > 0);
      assert(matrix.length >= 1 && matrix.length <= 5);
      assert(matrix.every(row => row.length === matrix[0].length && row.length <= 5));
      assert(matrix.flat().every(cell => cell === 0 || cell === 1));
      assert(matrix.flat().includes(1));
      assert(matrix[0].includes(1) && matrix.at(-1)!.includes(1), 'no empty border rows');
      assert(matrix.some(row => row[0] === 1) && matrix.some(row => row.at(-1) === 1), 'no empty border columns');
    }
  });

  it('has no duplicate shapes', () => {
    const keys = SHAPE_DEFINITIONS.map(def => JSON.stringify(def.matrix));
    assert.equal(new Set(keys).size, keys.length);
  });

  it('picks shapes proportionally to their weight', () => {
    const catalog = [
      { matrix: [[1]], weight: 1 },
      { matrix: [[1, 1]], weight: 3 },
    ];
    assert.equal(
      pickWeightedShape(catalog, () => 0),
      catalog[0],
    );
    assert.equal(
      pickWeightedShape(catalog, () => 0.249),
      catalog[0],
    );
    assert.equal(
      pickWeightedShape(catalog, () => 0.25),
      catalog[1],
    );
    assert.equal(
      pickWeightedShape(catalog, () => 0.999),
      catalog[1],
    );
  });
});
