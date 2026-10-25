import type { Matrix } from './board.ts';

export interface ShapeDefinition {
  readonly matrix: Matrix;
  readonly weight: number;
}

export type RandomSource = () => number;

/**
 * Polyomino catalog with relative spawn weights. Pieces never rotate.
 * Weights favour "satisfying" solid pieces (squares, rectangles, straight lines)
 * the way Block Blast does; awkward shapes still appear, just less often.
 */
export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  // 1x1 Dot
  { matrix: [[1]], weight: 4 },

  // 2x1 Domino
  { matrix: [[1, 1]], weight: 5 },
  { matrix: [[1], [1]], weight: 5 },

  // 3x1 Tromino
  { matrix: [[1, 1, 1]], weight: 9 },
  { matrix: [[1], [1], [1]], weight: 9 },

  // 4x1 Tetromino
  { matrix: [[1, 1, 1, 1]], weight: 8 },
  { matrix: [[1], [1], [1], [1]], weight: 8 },

  // 5x1 Pentomino (special line clearer)
  { matrix: [[1, 1, 1, 1, 1]], weight: 6 },
  { matrix: [[1], [1], [1], [1], [1]], weight: 6 },

  // 2x2 Square
  { matrix: [[1, 1], [1, 1]], weight: 12 },

  // 3x3 Square
  { matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], weight: 7 },

  // 2x3 Rectangles
  { matrix: [[1, 1, 1], [1, 1, 1]], weight: 7 },
  { matrix: [[1, 1], [1, 1], [1, 1]], weight: 7 },

  // Small corner 2x2 (3 blocks)
  { matrix: [[1, 0], [1, 1]], weight: 5 },
  { matrix: [[0, 1], [1, 1]], weight: 5 },
  { matrix: [[1, 1], [1, 0]], weight: 5 },
  { matrix: [[1, 1], [0, 1]], weight: 5 },

  // Big corner 3x3 (5 blocks)
  { matrix: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], weight: 4 },
  { matrix: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], weight: 4 },
  { matrix: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], weight: 4 },
  { matrix: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], weight: 4 },

  // L-shapes (3x2, 4 blocks)
  { matrix: [[1, 0], [1, 0], [1, 1]], weight: 4 },
  { matrix: [[0, 1], [0, 1], [1, 1]], weight: 4 },
  { matrix: [[1, 1], [1, 0], [1, 0]], weight: 4 },
  { matrix: [[1, 1], [0, 1], [0, 1]], weight: 4 },
  { matrix: [[1, 1, 1], [1, 0, 0]], weight: 4 },
  { matrix: [[1, 1, 1], [0, 0, 1]], weight: 4 },
  { matrix: [[1, 0, 0], [1, 1, 1]], weight: 4 },
  { matrix: [[0, 0, 1], [1, 1, 1]], weight: 4 },

  // T-shapes (3x2, 4 blocks)
  { matrix: [[1, 1, 1], [0, 1, 0]], weight: 4 },
  { matrix: [[0, 1, 0], [1, 1, 1]], weight: 4 },
  { matrix: [[1, 0], [1, 1], [1, 0]], weight: 4 },
  { matrix: [[0, 1], [1, 1], [0, 1]], weight: 4 },

  // Z and S shapes
  { matrix: [[1, 1, 0], [0, 1, 1]], weight: 3 },
  { matrix: [[0, 1, 1], [1, 1, 0]], weight: 3 },
  { matrix: [[1, 0], [1, 1], [0, 1]], weight: 3 },
  { matrix: [[0, 1], [1, 1], [1, 0]], weight: 3 },

  // Diagonal 2
  { matrix: [[1, 0], [0, 1]], weight: 1 },
  { matrix: [[0, 1], [1, 0]], weight: 1 },
];

/** Solid rectangles of three or more blocks: lines, 2x2, 2x3 and 3x3. */
export function isSatisfyingShape(matrix: Matrix): boolean {
  const cells = matrix.flat();
  return cells.length >= 3 && cells.every(cell => cell === 1);
}

export function pickWeightedShape(
  catalog: readonly ShapeDefinition[] = SHAPE_DEFINITIONS,
  random: RandomSource = Math.random,
): ShapeDefinition {
  const totalWeight = catalog.reduce((sum, def) => sum + def.weight, 0);
  let r = random() * totalWeight;
  for (const def of catalog) {
    if (r < def.weight) return def;
    r -= def.weight;
  }
  return catalog[0];
}
