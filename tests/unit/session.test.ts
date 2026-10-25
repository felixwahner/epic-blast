import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { boardQuality } from '../../src/ai/solver.ts';
import { encodeGrid, isGridEmpty } from '../../src/core/board.ts';
import { levelStart } from '../../src/core/progression.ts';
import { allClearBonus, clearScore, comboClearScore } from '../../src/core/scoring.ts';
import { GameSession, type DealOutcome, type SessionOptions } from '../../src/core/session.ts';
import { noHelp, seededRandom } from '../helpers/fakes.ts';

const dot = { matrix: [[1]], weight: 1 };
const domino = { matrix: [[1, 1]], weight: 1 };
const square = {
  matrix: [
    [1, 1],
    [1, 1],
  ],
  weight: 1,
};
const bar3 = { matrix: [[1], [1], [1]], weight: 1 };
const bar4 = { matrix: [[1], [1], [1], [1]], weight: 1 };

function newSession(options: SessionOptions = {}): GameSession {
  const session = new GameSession({
    random: seededRandom(7),
    catalog: [dot],
    helpDealer: noHelp,
    reviveFor: () => [dot, dot, dot],
    ...options,
  });
  session.start();
  return session;
}

/** Fills cells given as [row, col] pairs. */
function fill(session: GameSession, cells: [number, number][], color = 2): void {
  for (const [r, c] of cells) session.grid[r][c] = color;
}

const row = (r: number, cols: number[]): [number, number][] => cols.map(c => [r, c]);
const col = (c: number, rows: number[]): [number, number][] => rows.map(r => [r, c]);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function dealt(outcome: DealOutcome | null): Extract<DealOutcome, { kind: 'dealt' }> {
  assert(outcome && outcome.kind === 'dealt', `expected a dealt tray, got ${outcome?.kind}`);
  return outcome;
}

describe('GameSession: starting and dealing', () => {
  it('starts with an empty board, three pieces and one revive', () => {
    const session = newSession();
    assert(isGridEmpty(session.grid));
    assert.equal(session.tray.filter(Boolean).length, 3);
    assert.deepEqual([session.score, session.level, session.revives, session.combo], [0, 1, 1, 0]);
    assert.equal(session.roundId, 1);
    assert.equal(session.isGameOver, false);
  });

  it('keeps the best score across restarts', () => {
    const session = newSession({ bestScore: 500 });
    session.score = 900;
    session.bestScore = 900;
    session.start();
    assert.equal(session.score, 0);
    assert.equal(session.bestScore, 900);
  });

  it('retries the first tray piece until it fits the board', () => {
    const big = {
      matrix: [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      weight: 1,
    };
    const script = [0.1, 0.9]; // big (does not fit), then dot (fits)
    let index = 0;
    const session = newSession({ catalog: [big, dot], random: () => script[index++] ?? 0.5 });
    // Leave only isolated single holes on the board.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) session.grid[r][c] = (r + c) % 2 ? null : 1;
    index = 0;
    const outcome = dealt(session.deal());
    assert.deepEqual(outcome.pieces[0].matrix, dot.matrix);
  });

  it('uses the helpful dealer when it offers pieces', () => {
    const session = newSession({ catalog: [dot, square], helpDealer: { reset() {}, deal: () => [domino] } });
    const outcome = dealt(session.deal());
    assert.deepEqual(outcome.pieces[0].matrix, domino.matrix);
    assert.equal(outcome.pieces.length, 3);
  });

  it('reports game over when no dealt piece fits', () => {
    const session = newSession({ catalog: [square] });
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) session.grid[r][c] = (r + c) % 2 ? null : 1;
    const outcome = dealt(session.deal());
    assert.equal(outcome.gameOver, true);
    assert.equal(session.isGameOver, true);
    assert.equal(session.place(0, 0, 0), null, 'no moves after game over');
  });
});

describe('GameSession: placing pieces', () => {
  it('rejects illegal placements without changing state', () => {
    const session = newSession();
    fill(session, [[0, 0]]);
    assert.equal(session.place(0, 0, 0), null, 'occupied');
    assert.equal(session.place(0, 8, 0), null, 'out of bounds');
    session.tray[1] = null;
    assert.equal(session.place(1, 3, 3), null, 'empty slot');
    assert.equal(session.score, 0);
    assert.equal(session.roundPlacements, 0);
  });

  it('awards one point per block and empties the slot', () => {
    const session = newSession();
    session.deal([square, dot, dot]);
    const outcome = session.place(0, 2, 3)!;
    assert.deepEqual(outcome.cells, [
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 4, col: 2 },
      { row: 4, col: 3 },
    ]);
    assert.deepEqual(
      outcome.awards.map(a => [a.kind, a.points]),
      [['placement', 4]],
    );
    assert.equal(session.score, 4);
    assert.equal(session.tray[0], null);
    assert.equal(outcome.clear, null);
    assert.equal(outcome.next, null);
    assert.equal(session.grid[4][3], outcome.piece.colorIdx);
  });

  it('clears a completed row, starts a combo and scores it', () => {
    const session = newSession();
    fill(session, row(0, range(0, 6)), 5);
    fill(session, [[5, 5]]);
    const outcome = session.place(0, 7, 0)!;
    assert(outcome.clear);
    assert.deepEqual([outcome.clear.rows, outcome.clear.cols], [[0], []]);
    assert.equal(outcome.clear.combo, 1);
    assert.equal(outcome.clear.points, clearScore(1, 1));
    assert.equal(outcome.clear.cells.length, 8);
    assert.equal(outcome.clear.cells[0].color, 5);
    assert.equal(session.score, 1 + clearScore(1, 1));
    assert(session.grid[0].every(cell => cell === null));
    assert.equal(outcome.clear.allClear, false);
    assert.equal(session.clearedLines, 1);
    assert.equal(session.turnHasClear, true);
  });

  it('clears crossing lines at once and reports a cross strike', () => {
    const session = newSession();
    fill(session, [...row(0, range(1, 7)), ...col(0, range(1, 7)), [4, 4]]);
    const outcome = session.place(0, 0, 0)!;
    assert.deepEqual([outcome.clear!.rows, outcome.clear!.cols], [[0], [0]]);
    assert.equal(outcome.clear!.cells.length, 15);
    assert(outcome.events.includes('cross'));
    assert.equal(session.grid[4][4], 2, 'unrelated blocks stay');
  });

  it('gives an all-clear bonus when the board empties', () => {
    const session = newSession();
    fill(session, row(3, range(0, 6)));
    const outcome = session.place(0, 7, 3)!;
    assert.equal(outcome.clear!.allClear, true);
    assert(outcome.events.includes('clean'));
    assert.deepEqual(
      outcome.awards.map(a => a.kind),
      ['placement', 'clear', 'all-clear'],
    );
    assert.equal(outcome.clear!.allClearMultiplier, 3);
    assert.equal(outcome.awards[2].points, allClearBonus(clearScore(1, 1), 1));
    assert.equal(outcome.awards[1].points + outcome.awards[2].points, 300 + 3 * clearScore(1, 1));
  });

  it('raises the board-clear multiplier with every further board clear in a game', () => {
    const session = newSession();
    fill(session, row(3, range(0, 6)));
    assert.equal(session.place(0, 7, 3)!.clear!.allClearMultiplier, 3);
    fill(session, row(5, range(1, 7)));
    const second = session.place(1, 0, 5)!;
    assert.equal(second.clear!.allClearMultiplier, 4);
    assert.equal(second.awards[2].points, allClearBonus(clearScore(2, 1), 2));
    session.start();
    fill(session, row(0, range(1, 7)));
    assert.equal(session.place(0, 0, 0)!.clear!.allClearMultiplier, 3, 'a new game starts over');
  });

  it('labels triple and four-line clears', () => {
    const triple = newSession();
    triple.deal([bar3, dot, dot]);
    fill(
      triple,
      [0, 1, 2].flatMap(r => row(r, range(1, 7))),
    );
    assert(triple.place(0, 0, 0)!.events.includes('triple'));

    const four = newSession();
    four.deal([bar4, dot, dot]);
    fill(
      four,
      [0, 1, 2, 3].flatMap(r => row(r, range(1, 7))),
    );
    const events = four.place(0, 0, 0)!.events;
    assert(events.includes('blockbuster'));
    assert(!events.includes('triple'));
  });

  it('raises the combo by one per cleared line', () => {
    const session = newSession();
    session.combo = 2;
    fill(session, [...row(0, range(0, 6)), ...row(1, range(0, 6)), ...row(2, range(0, 6))]);
    fill(session, [[5, 5]]);
    session.deal([bar3, dot, dot]);
    const outcome = session.place(0, 7, 0)!;
    assert.equal(outcome.clear!.lines, 3);
    assert.equal(outcome.clear!.combo, 5);
    assert.equal(session.combo, 5);
    assert.equal(session.maxCombo, 5);
    assert.equal(outcome.clear!.points, comboClearScore(2, 3));
    assert(outcome.events.includes('unstoppable'), 'a jump from 2 to 5 still reaches the milestone');
    assert(!outcome.events.includes('fire'), 'only the highest milestone of a move is celebrated');
  });

  it('announces combo milestones at 3, 5 and 10', () => {
    for (const [combo, event] of [
      [2, 'fire'],
      [4, 'unstoppable'],
      [9, 'legendary'],
    ] as const) {
      const session = newSession();
      session.combo = combo;
      fill(session, row(0, range(0, 6)));
      const outcome = session.place(0, 7, 0)!;
      assert.equal(outcome.clear!.combo, combo + 1);
      assert(outcome.events.includes(event), `${event} at combo ${combo + 1}`);
    }
  });

  it('awards a revive per level gained', () => {
    const session = newSession();
    session.score = levelStart(2) - 1;
    const outcome = session.place(0, 0, 0)!;
    assert.deepEqual(outcome.awards[0].levelUp, { level: 2, gained: 1 });
    assert.equal(session.level, 2);
    assert.equal(session.revives, 2);
  });

  it('celebrates a new personal best only once per game', () => {
    const session = newSession({ bestScore: 1 });
    assert.equal(session.place(0, 0, 0)!.newRecord, false, 'equal to best is not a record');
    const second = session.place(1, 2, 0)!;
    assert.equal(second.newRecord, true);
    assert(second.events.includes('record'));
    assert.equal(session.bestScore, 2);
    const third = session.place(2, 4, 0)!;
    assert.equal(third.newRecord, false);
    assert.equal(session.bestScore, 3);
  });
});

describe('GameSession: rounds and combo', () => {
  it('deals a new round after the third piece', () => {
    const session = newSession();
    session.place(0, 0, 0);
    session.place(1, 2, 0);
    const outcome = session.place(2, 4, 0)!;
    const next = dealt(outcome.next);
    assert.equal(next.roundId, 2);
    assert.equal(session.tray.filter(Boolean).length, 3);
  });

  it('keeps the combo after a round with a clear and resets it after a round without', () => {
    const session = newSession();
    session.combo = 4;
    session.turnHasClear = true;
    session.deal();
    assert.equal(session.combo, 4, 'a round with a clear preserves the combo');
    assert.equal(session.turnHasClear, false, 'the new round starts without a clear');
    session.deal();
    assert.equal(session.combo, 0, 'the following round without a clear resets the combo');
  });

  it('keeps the combo when pieces are dealt explicitly (revive)', () => {
    const session = newSession();
    session.combo = 7;
    session.turnHasClear = false;
    session.deal([dot, dot, dot]);
    assert.equal(session.combo, 7);
  });

  it('offers to rescue a long combo and keeps it when accepted', () => {
    const session = newSession();
    session.combo = 25;
    session.turnHasClear = false;
    const offer = session.deal();
    assert.deepEqual(offer, { kind: 'recovery-offer', combo: 25, revives: 1 });
    assert.equal(session.recoveryPending, true);
    assert.equal(session.place(0, 0, 0), null, 'no moves while the offer is open');

    const result = session.resolveRecovery(true)!;
    assert.equal(result.saved, true);
    dealt(result.outcome);
    assert.equal(session.combo, 25);
    assert.equal(session.revives, 0);
    assert.equal(session.turnHasClear, false);
    assert.equal(session.recoveryPending, false);
    assert.equal(session.resolveRecovery(true), null, 'nothing to resolve twice');
  });

  it('resets the combo without spending a revive when the rescue is declined', () => {
    const session = newSession();
    session.combo = 30;
    session.turnHasClear = false;
    assert.equal(session.deal().kind, 'recovery-offer');
    const result = session.resolveRecovery(false)!;
    assert.equal(result.saved, false);
    assert.equal(session.combo, 0);
    assert.equal(session.revives, 1);
  });

  it('offers the rescue when the last piece of a clear-less round is placed', () => {
    const session = newSession();
    session.combo = 25;
    session.place(0, 0, 0);
    session.place(1, 2, 0);
    const outcome = session.place(2, 4, 0)!;
    assert.equal(outcome.next?.kind, 'recovery-offer');
  });
});

describe('GameSession: celebrations that depend on the round', () => {
  it('detects a narrow escape: the only legal move clears', () => {
    const session = newSession();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (r || c) session.grid[r][c] = 1;
    session.tray[1] = session.tray[2] = null;
    const outcome = session.place(0, 0, 0)!;
    assert(outcome.events.includes('escape'));
  });

  it('detects a perfect round: three pieces, empty board', () => {
    const session = newSession();
    fill(session, row(0, range(0, 4)));
    session.place(0, 5, 0);
    session.place(1, 6, 0);
    const outcome = session.place(2, 7, 0)!;
    assert(outcome.events.includes('perfect'));
    assert(outcome.events.includes('clean'));
    assert(!outcome.events.includes('finish'), 'only one line on the last piece');
  });

  it('detects a finish: the last piece clears two lines in an otherwise clear-less round', () => {
    const session = newSession();
    fill(session, [...row(0, range(1, 7)), ...col(0, range(1, 7)), [5, 5]]);
    session.place(1, 3, 3);
    session.place(2, 6, 6);
    const outcome = session.place(0, 0, 0)!;
    assert(outcome.events.includes('finish'));
  });

  it('enters the zone after five consecutive rounds with clears', () => {
    const session = newSession();
    session.roundStreak = 4;
    fill(session, row(0, range(0, 6)));
    session.place(1, 2, 4);
    session.place(2, 4, 4);
    const outcome = session.place(0, 7, 0)!;
    assert.equal(session.roundStreak, 5);
    assert(outcome.events.includes('zone'));
  });

  it('awards a brilliant move when the round matches the solver optimum', () => {
    const session = newSession();
    session.setRoundBest(session.roundId - 1, { placed: 0, lines: 0, quality: 0 });
    assert.equal(session.roundBest, null, 'results for an older round are ignored');
    session.place(0, 0, 0);
    session.place(1, 2, 0);
    const preview = session.grid.map(r => [...r]);
    preview[0][4] = 0;
    session.setRoundBest(session.roundId, { placed: 3, lines: 0, quality: boardQuality(encodeGrid(preview)) });
    assert(session.place(2, 4, 0)!.events.includes('brilliant'));
  });
});

describe('GameSession: game over and revive', () => {
  let session: GameSession;
  beforeEach(() => {
    session = newSession({ catalog: [square] });
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) session.grid[r][c] = (r + c) % 2 ? null : 1;
    session.deal();
  });

  it('revives with pieces from the revive planner and spends a revive', () => {
    assert.equal(session.isGameOver, true);
    session.combo = 6;
    const outcome = dealt(session.revive());
    assert.equal(outcome.gameOver, false);
    assert.equal(session.isGameOver, false);
    assert.equal(session.revives, 0);
    assert.equal(session.combo, 6, 'the combo survives a revive');
    assert(outcome.pieces.every(p => p.blockCount === 1));
  });

  it('refuses to revive without revives or outside game over', () => {
    session.revives = 0;
    assert.equal(session.revive(), null);
    session.revives = 1;
    session.revive();
    assert.equal(session.revive(), null, 'not game over any more');
  });

  it('detects game over mid-round when the remaining pieces no longer fit', () => {
    const s = newSession({ catalog: [dot] });
    s.deal([dot, square, square]);
    // Leave exactly one hole that the dot fills; the squares then have no room.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s.grid[r][c] = (r + c) % 2 ? null : 1;
    const outcome = s.place(0, 1, 0)!;
    assert.equal(outcome.gameOver, true);
    assert.equal(s.isGameOver, true);
  });
});
