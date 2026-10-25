import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HELP_CHANCE,
  OPENING_HELP_CHANCE,
  OPENING_ROUNDS,
  TIGHT_BOARD_CELLS,
  TIGHT_HELP_CHANCE,
  createHelpDealer,
  helpChance,
} from '../../src/ai/helpful-dealer.ts';
import { canPlaceAll } from '../../src/ai/solver.ts';
import { isGridEmpty } from '../../src/core/board.ts';
import { TUTORIAL_OPENING, TUTORIAL_TARGET } from '../../src/core/opening.ts';
import { jewelBonus, JEWEL_MIN_POINTS } from '../../src/core/scoring.ts';
import { GameSession } from '../../src/core/session.ts';
import { SHAPE_DEFINITIONS } from '../../src/core/shapes.ts';
import { noHelp, seededRandom } from '../helpers/fakes.ts';

const dot = { matrix: [[1]], weight: 1 };
const bar5 = { matrix: [[1, 1, 1, 1, 1]], weight: 1 };
const square3 = {
  matrix: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  weight: 1,
};
const crowded = [254, 127, 127, 127, 127, 0, 0, 0];
const tight = [254, 127, 127, 127, 127, 15, 0, 0];

describe('dynamic dealer', () => {
  it('helps more in the opening rounds and on tight boards', () => {
    assert.equal(helpChance({ combo: 0, round: 1 }, 10), OPENING_HELP_CHANCE);
    assert.equal(helpChance({ combo: 0, round: OPENING_ROUNDS + 1 }, 10), HELP_CHANCE);
    assert.equal(helpChance({ combo: 0, round: 20 }, TIGHT_BOARD_CELLS), TIGHT_HELP_CHANCE);
    assert(OPENING_HELP_CHANCE > HELP_CHANCE && TIGHT_HELP_CHANCE > HELP_CHANCE);
  });

  it('skips the help cooldown on tight boards only', () => {
    const catalog = [dot, { matrix: [[1, 1]], weight: 1 }];
    const helper = createHelpDealer(() => 0);
    assert(helper.deal(crowded, catalog, { combo: 0, round: 10 }));
    assert.equal(helper.deal(crowded, catalog, { combo: 0, round: 10 }), null);
    assert(helper.deal(tight, catalog, { combo: 0, round: 10 }));
    assert(helper.deal(tight, catalog, { combo: 0, round: 10 }));
  });
});

describe('fair deals', () => {
  it('knows when a whole tray can be placed', () => {
    const empty = Array(8).fill(0);
    assert(canPlaceAll(empty, [square3, square3, square3]));
    // One free row: a five-bar fits, then clears, so a second one fits too.
    const oneRow = [255, 255, 255, 255, 255, 255, 255, 0];
    assert(canPlaceAll(oneRow, [bar5, bar5]));
    assert(!canPlaceAll(oneRow, [square3]));
  });

  it('re-deals random trays until all three pieces fit', () => {
    const session = new GameSession({ random: seededRandom(11), helpDealer: noHelp, catalog: [dot, square3] });
    session.start();
    let fair = 0;
    for (let i = 0; i < 200; i++) {
      // Room for one 3x3 block only, then dots.
      session.grid.forEach((row, r) =>
        row.forEach((_, c) => {
          row[c] = r < 3 && c < 3 ? null : r === 7 && c === 7 ? null : 1;
        }),
      );
      session.deal();
      if (canPlaceAll(session.encodedGrid(), session.tray)) fair++;
    }
    assert.equal(fair, 200);
  });
});

describe('gold jewels', () => {
  it('pays each jewel the clear points again, with a minimum', () => {
    assert.equal(jewelBonus(1000, 1), 1000);
    assert.equal(jewelBonus(1000, 2), 2000);
    assert.equal(jewelBonus(10, 1), JEWEL_MIN_POINTS);
  });

  it('marks the jewel cell on placement and pays it out when its line clears', () => {
    const session = new GameSession({ random: seededRandom(2), helpDealer: noHelp, catalog: [dot] });
    session.start();
    for (let c = 1; c < 8; c++) session.grid[0][c] = 3;
    session.tray[0] = { ...session.tray[0]!, jewel: { row: 0, col: 0 } };
    const outcome = session.place(0, 0, 0)!;
    assert.equal(outcome.clear!.jewels, 1);
    assert.equal(outcome.clear!.jewelPoints, jewelBonus(outcome.clear!.points, 1));
    assert(outcome.awards.some(award => award.kind === 'jewel'));
    assert.equal(session.jewels.size, 0);
  });

  it('appears on a small share of random pieces', () => {
    const session = new GameSession({ random: seededRandom(5), helpDealer: noHelp });
    session.start();
    let jewels = 0,
      pieces = 0;
    for (let i = 0; i < 1000; i++) {
      session.grid.forEach(row => row.fill(null));
      session.deal();
      for (const piece of session.tray) {
        pieces++;
        if (piece?.jewel) jewels++;
      }
    }
    assert(jewels / pieces > 0.03 && jewels / pieces < 0.09, `share ${jewels / pieces}`);
  });
});

describe('tutorial opening', () => {
  it('lets the first piece clear two lines and empty the board', () => {
    const session = new GameSession({ random: seededRandom(1), helpDealer: noHelp });
    session.start(TUTORIAL_OPENING);
    assert.equal(session.roundId, 1);
    const outcome = session.place(TUTORIAL_TARGET.slot, TUTORIAL_TARGET.col, TUTORIAL_TARGET.row)!;
    assert.equal(outcome.clear!.lines, 2);
    assert(outcome.clear!.allClear);
    assert(isGridEmpty(session.grid));
  });
});

describe('saving and resuming', () => {
  it('restores a game exactly, including jewels and the tray', () => {
    const session = new GameSession({ random: seededRandom(9), helpDealer: noHelp });
    session.start();
    session.place(0, 0, 0);
    session.jewels.add(0);
    session.grid[0][0] ??= 1;
    session.score = 4321;
    const snapshot = JSON.parse(JSON.stringify(session.snapshot()));

    const resumed = new GameSession({ random: seededRandom(1), helpDealer: noHelp });
    assert(resumed.restore(snapshot));
    assert.deepEqual(resumed.snapshot(), session.snapshot());
    assert.deepEqual(
      resumed.tray.map(p => p?.matrix ?? null),
      session.tray.map(p => p?.matrix ?? null),
    );
    assert.equal(resumed.bestScore, 4321);
  });

  it('rejects broken saves without touching the game', () => {
    const session = new GameSession({ random: seededRandom(3), helpDealer: noHelp });
    session.start();
    const before = session.snapshot();
    for (const bad of [
      null,
      {},
      { ...before, version: 2 },
      { ...before, grid: [[1]] },
      { ...before, score: -1 },
      { ...before, tray: [{ matrix: [[2]], colorIdx: 0, jewel: null }, null, null] },
    ]) {
      assert.equal(session.restore(bad), false);
    }
    assert.deepEqual(session.snapshot(), before);
  });

  it('covers every shape of the catalog in saved trays', () => {
    const session = new GameSession({ random: seededRandom(3), helpDealer: noHelp });
    session.start();
    for (const def of SHAPE_DEFINITIONS) {
      session.tray[1] = { ...session.tray[1]!, matrix: def.matrix };
      assert(new GameSession().restore(JSON.parse(JSON.stringify(session.snapshot()))));
    }
  });
});
