// Approximation inferred from high-combo screenshots, not a verified original rule.
// Placement points are awarded separately by the caller.
export function clearScore(combo: number, lines: number): number {
  return lines * 8 * (10 * combo + 6);
}

/** Points for `lines` cleared at once: each line is its own combo step after `previousCombo`. */
export function comboClearScore(previousCombo: number, lines: number): number {
  let points = 0;
  for (let step = 1; step <= lines; step++) points += clearScore(previousCombo + step, 1);
  return points;
}

/** Combo announcer milestone (5, then every 10) reached when the combo jumps from `from` to `to`. */
export function comboMilestone(from: number, to: number): number | null {
  const tens = Math.floor(to / 10) * 10;
  if (tens >= 10 && from < tens) return tens;
  return from < 5 && to >= 5 ? 5 : null;
}

/** Flat bonus for emptying the whole board with a clear. */
export const ALL_CLEAR_BONUS = 300;
/** A board clear multiplies the points of the clearing move... */
export const ALL_CLEAR_MULTIPLIER = 3;
/** ...and each further board clear in the same game adds one step, up to this cap. */
export const MAX_ALL_CLEAR_MULTIPLIER = 6;

/** Multiplier for the `count`-th board clear of a game (1-based). */
export const allClearMultiplier = (count: number): number =>
  Math.min(MAX_ALL_CLEAR_MULTIPLIER, ALL_CLEAR_MULTIPLIER + Math.max(0, count - 1));

/** Extra points on top of `clearPoints`, so the whole clear is worth `multiplier` times as much. */
export const allClearBonus = (clearPoints: number, count: number): number =>
  ALL_CLEAR_BONUS + clearPoints * (allClearMultiplier(count) - 1);

/** Minimum payout of one gold bonus jewel. */
export const JEWEL_MIN_POINTS = 250;

/** Extra points for gold jewels in a clear: each one pays the clear's points again. */
export const jewelBonus = (clearPoints: number, jewels: number): number =>
  jewels * Math.max(JEWEL_MIN_POINTS, clearPoints);
