import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMBO_HELP_CHANCE, HELP_CHANCE, createHelpDealer, helpfulDefinitions } from '../../src/ai/helpful-dealer.ts';
import { applyMove, moves } from '../../src/ai/solver.ts';

const catalog = [
  { matrix: [[1]], weight: 1 },
  { matrix: [[1, 1]], weight: 1 },
];
const rows = [254, 0, 0, 0, 0, 0, 0, 0];
// Too full for the board-clear search, so only the line-clear help applies.
const crowded = [254, 127, 127, 127, 127, 0, 0, 0];

describe('helpful dealer', () => {
  it('offers a legal clearing piece without touching the board', () => {
    const original = rows.slice();
    const path = createHelpDealer(() => 0).deal(rows, catalog);
    assert(path && path.length >= 1 && path.length <= 2);
    assert(moves(rows, [path[0]]).some(move => applyMove(rows, path[0], move).lines > 0));
    assert.deepEqual(rows, original);
  });

  it('cools down for one round after helping, and reset clears the cooldown', () => {
    const helper = createHelpDealer(() => 0);
    assert(helper.deal(crowded, catalog));
    assert.equal(helper.deal(crowded, catalog), null);
    assert(helper.deal(crowded, catalog));
    assert.equal(helper.deal(crowded, catalog), null);
    helper.reset();
    assert(helper.deal(crowded, catalog));
  });

  it('only helps below the chance boundary, which a running combo raises', () => {
    assert.equal(createHelpDealer(() => HELP_CHANCE).deal(crowded, catalog), null);
    assert(createHelpDealer(() => HELP_CHANCE).deal(crowded, catalog, { combo: 2 }));
    assert.equal(createHelpDealer(() => COMBO_HELP_CHANCE).deal(crowded, catalog, { combo: 2 }), null);
  });

  it('returns null when nothing can clear', () => {
    assert.equal(
      helpfulDefinitions(Array(8).fill(0), catalog, () => 0),
      null,
    );
  });
});
