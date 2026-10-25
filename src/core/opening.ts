// The very first game starts on a prepared board: the first piece clears two
// lines and empties the board, so a new player sees a big clear within seconds.
import type { Opening } from './session.ts';

const _ = null;

/** Bottom two rows are full except a 3x2 gap that the first piece fills exactly. */
export const TUTORIAL_OPENING: Opening = {
  grid: [
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _],
    [2, 2, 4, _, _, _, 6, 6],
    [3, 3, 4, _, _, _, 7, 6],
  ],
  pieces: [
    {
      matrix: [
        [1, 1, 1],
        [1, 1, 1],
      ],
    },
    {
      matrix: [
        [1, 1],
        [1, 1],
      ],
    },
    { matrix: [[1, 1, 1]] },
  ],
};

/** Where the tutorial's first piece goes (top-left cell) and which tray slot it is in. */
export const TUTORIAL_TARGET = { slot: 0, col: 3, row: 6 } as const;
