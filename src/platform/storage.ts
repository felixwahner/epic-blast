// Defensive localStorage access: private windows, iframes and blocked site
// data must never break the game.

export const STORAGE_KEYS = {
  bestScore: 'epic_blast_best_score',
  muted: 'epic_blast_muted',
  vibration: 'epic_blast_vibration',
  effects: 'epic_blast_effects',
  music: 'epic_blast_music',
  soundWorld: 'epic_blast_sound_world',
  installDismissed: 'epic_blast_install_dismissed',
  worlds: 'epic_blast_worlds',
  savedGame: 'epic_blast_saved_game',
  tutorialDone: 'epic_blast_tutorial_done',
} as const;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A store backed by `globalThis.localStorage` that swallows access errors. */
export const safeStorage: KeyValueStore = {
  getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* Storage unavailable. */
    }
  },
};

export function readNumber(store: KeyValueStore, key: string, fallback = 0): number {
  const value = parseInt(store.getItem(key) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Merges this window's best score with the stored one and returns the higher.
 * Another window of the game (the installed app next to a browser tab) may have
 * stored a higher record in the meantime; a lower stored value is overwritten.
 */
export function syncBestScore(store: KeyValueStore, best: number): number {
  const stored = readNumber(store, STORAGE_KEYS.bestScore);
  if (best > stored) store.setItem(STORAGE_KEYS.bestScore, String(best));
  return Math.max(best, stored);
}
