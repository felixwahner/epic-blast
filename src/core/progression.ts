// Each level requires 100% more additional points than the preceding level.
// Cumulative thresholds: 0, 10,000, 30,000, 70,000, 150,000, ...
export const FIRST_LEVEL_POINTS = 10000;
export const levelStart = (level: number): number => Math.round(FIRST_LEVEL_POINTS * (2 ** (level - 1) - 1));

export interface LevelProgress {
  level: number;
  start: number;
  next: number;
  /** 0..1 within the current level. */
  progress: number;
}

export function progression(score: number): LevelProgress {
  let level = Math.max(1, Math.floor(Math.log1p(score / FIRST_LEVEL_POINTS) / Math.log(2)) + 1);
  while (score >= levelStart(level + 1)) level++;
  while (score < levelStart(level)) level--;
  const start = levelStart(level),
    next = levelStart(level + 1);
  return { level, start, next, progress: (score - start) / (next - start) };
}

export const LINES_PER_WORLD = 20;

// Worlds advance independently from score levels and revive rewards.
export function worldProgress(lines: number): { world: number; progress: number } {
  return { world: Math.floor(lines / LINES_PER_WORLD) + 1, progress: (lines % LINES_PER_WORLD) / LINES_PER_WORLD };
}
