// Defensive localStorage access: private windows, iframes and blocked site
// data must never break the game.

export const STORAGE_KEYS = {
  bestScore: 'pixel_blast_best_score',
  muted: 'pixel_blast_muted',
  vibration: 'pixel_blast_vibration',
  effects: 'pixel_blast_effects',
  music: 'epic_blast_music',
  installDismissed: 'epic_blast_install_dismissed',
} as const;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A store backed by `globalThis.localStorage` that swallows access errors. */
export const safeStorage: KeyValueStore = {
  getItem(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  setItem(key, value) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* Storage unavailable. */ }
  },
};

export function readNumber(store: KeyValueStore, key: string, fallback = 0): number {
  const value = parseInt(store.getItem(key) ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}
