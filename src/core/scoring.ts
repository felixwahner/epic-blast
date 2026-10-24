// Approximation inferred from high-combo screenshots, not a verified original rule.
// Placement points are awarded separately by the caller.
export function clearScore(combo: number, lines: number): number {
  return lines * 8 * (10 * combo + 6);
}

/** Bonus for emptying the whole board with a clear. */
export const ALL_CLEAR_BONUS = 300;
