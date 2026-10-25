import type { HelpDealer } from '../../src/ai/helpful-dealer.ts';
import type { KeyValueStore } from '../../src/platform/storage.ts';

/** In-memory replacement for localStorage. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A dealer that never intervenes, so tests control every tray. */
export const noHelp: HelpDealer = { reset() {}, deal: () => null };

/** Builds a row-major grid from strings: '#' = block (color 0), '.' = empty. */
export function gridFrom(rows: string[]): (number | null)[][] {
  return rows.map(row => [...row].map(ch => (ch === '#' ? 0 : null)));
}
