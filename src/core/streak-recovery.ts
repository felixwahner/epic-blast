/** Minimum combo that may be rescued with a revive after a round without clears. */
export const RECOVERABLE_COMBO = 10;

export const canRecoverStreak = (combo: number, hasClear: boolean, revives: number): boolean =>
  !hasClear && combo >= RECOVERABLE_COMBO && revives > 0;
