// Worlds the player has unlocked across all games. A world unlocks when a game
// reaches it, or once enough lines have been cleared in total: the n-th world of
// the list needs n × LINES_PER_UNLOCK lines. Pure: storage lives in the caller.

export const LINES_PER_UNLOCK = 40;

export interface WorldCollection {
  /** Lines cleared in all games together. */
  lines: number;
  /** World indices reached in a game. */
  seen: number[];
  /** World index that opens every new game. */
  start: number;
  /** Unlocked worlds the player has not looked at in the gallery yet. */
  fresh: number[];
}

export const emptyCollection = (): WorldCollection => ({ lines: 0, seen: [0], start: 0, fresh: [] });

/** Lines needed in total to unlock world `index` without reaching it in a game. */
export const unlockLines = (index: number): number => index * LINES_PER_UNLOCK;

export const isUnlocked = (collection: WorldCollection, index: number): boolean =>
  collection.seen.includes(index) || collection.lines >= unlockLines(index);

export function unlockedWorlds(collection: WorldCollection, worldCount: number): number[] {
  return Array.from({ length: worldCount }, (_, index) => index).filter(index => isUnlocked(collection, index));
}

/** The next world that clearing lines will unlock, with the lines still missing. */
export function nextUnlock(collection: WorldCollection, worldCount: number): { index: number; remaining: number } | null {
  for (let index = 0; index < worldCount; index++) {
    if (!isUnlocked(collection, index)) return { index, remaining: unlockLines(index) - collection.lines };
  }
  return null;
}

/** Adds cleared lines and returns the worlds this newly unlocked, in list order. */
export function addLines(collection: WorldCollection, lines: number, worldCount: number): number[] {
  const before = unlockedWorlds(collection, worldCount);
  collection.lines += lines;
  const unlocked = unlockedWorlds(collection, worldCount).filter(index => !before.includes(index));
  collection.fresh.push(...unlocked);
  return unlocked;
}

/** Records that a game reached a world; returns true when that unlocked it. */
export function markSeen(collection: WorldCollection, index: number): boolean {
  if (collection.seen.includes(index)) return false;
  const wasUnlocked = isUnlocked(collection, index);
  collection.seen.push(index);
  if (!wasUnlocked) collection.fresh.push(index);
  return !wasUnlocked;
}

/** Sets the opening world of new games; only unlocked worlds can be chosen. */
export function chooseStart(collection: WorldCollection, index: number): boolean {
  if (!isUnlocked(collection, index)) return false;
  collection.start = index;
  return true;
}

/** Reads saved data defensively; anything unusable falls back to a fresh collection. */
export function parseCollection(raw: string | null, worldCount: number): WorldCollection {
  const fallback = emptyCollection();
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Partial<WorldCollection>;
    const validIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < worldCount;
    const indices = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.filter(validIndex))] : []);
    const collection: WorldCollection = {
      lines: Number.isInteger(data.lines) && data.lines! > 0 ? data.lines! : 0,
      seen: indices(data.seen),
      start: validIndex(data.start) ? data.start : 0,
      fresh: indices(data.fresh),
    };
    if (!collection.seen.includes(0)) collection.seen.unshift(0);
    if (!isUnlocked(collection, collection.start)) collection.start = 0;
    return collection;
  } catch {
    return fallback;
  }
}
