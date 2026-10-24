import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHelpDealer, helpfulDefinitions } from '../../src/ai/helpful-dealer.ts';
import { applyMove, moves } from '../../src/ai/solver.ts';

const catalog = [{ matrix: [[1]], weight: 1 }, { matrix: [[1, 1]], weight: 1 }];
const rows = [254, 0, 0, 0, 0, 0, 0, 0];

describe('helpful dealer', () => {
  it('offers a legal clearing piece without touching the board', () => {
    const original = rows.slice();
    const path = createHelpDealer(() => 0).deal(rows, catalog);
    assert(path && path.length >= 1 && path.length <= 2);
    assert(moves(rows, [path[0]]).some(move => applyMove(rows, path[0], move).lines > 0));
    assert.deepEqual(rows, original);
  });

  it('cools down for three rounds after helping, and reset clears the cooldown', () => {
    const helper = createHelpDealer(() => 0);
    assert(helper.deal(rows, catalog));
    for (let i = 0; i < 3; i++) assert.equal(helper.deal(rows, catalog), null);
    assert(helper.deal(rows, catalog));
    helper.reset();
    assert(helper.deal(rows, catalog));
  });

  it('only helps below the 15% chance boundary', () => {
    assert.equal(createHelpDealer(() => 0.15).deal(rows, catalog), null);
  });

  it('returns null when nothing can clear', () => {
    assert.equal(helpfulDefinitions(Array(8).fill(0), catalog, () => 0), null);
  });
});
