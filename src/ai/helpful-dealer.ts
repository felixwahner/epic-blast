import type { RandomSource, ShapeDefinition } from '../core/shapes.ts';
import { applyMove, boardQuality, moves, type RowMasks } from './solver.ts';

/** Chance that a round is dealt with a deliberately helpful piece. */
export const HELP_CHANCE = 0.15;
/** Rounds without help after a helpful deal. */
export const HELP_COOLDOWN = 3;

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  return items.map(item => ({ item, rank: random() })).sort((a, b) => a.rank - b.rank).map(x => x.item);
}

// A bounded one/two-move search. Never modifies ordinary random selections.
export function helpfulDefinitions(rows: RowMasks, catalog: readonly ShapeDefinition[], random: RandomSource = Math.random): ShapeDefinition[] | null {
  const roll = random();
  const depth = roll < 0.7 ? 1 : 2;
  const wantMultiple = roll >= 0.95;
  const ordered = shuffled(catalog, random);
  const options: { def: ShapeDefinition; next: { rows: number[]; lines: number } }[] = [];
  for (const def of ordered) for (const move of moves(rows, [def])) {
    options.push({ def, next: applyMove(rows, def, move) });
  }
  let best: { path: ShapeDefinition[]; quality: number } | null = null;
  const consider = (path: ShapeDefinition[], result: { rows: number[]; lines: number }) => {
    if (result.lines < (wantMultiple ? 2 : 1)) return;
    const quality = boardQuality(result.rows);
    if (!best || quality > best.quality) best = { path, quality };
  };
  for (const option of options) consider([option.def], option.next);
  if (depth === 2 && !best) {
    // Prefer promising first moves; cap work to avoid blocking mobile input.
    const candidates = options.sort((a, b) => boardQuality(b.next.rows) - boardQuality(a.next.rows)).slice(0, 24);
    for (const first of candidates) for (const def of ordered) for (const move of moves(first.next.rows, [def])) {
      const next = applyMove(first.next.rows, def, move);
      consider([first.def, def], { rows: next.rows, lines: first.next.lines + next.lines });
    }
  }
  return (best as { path: ShapeDefinition[] } | null)?.path ?? null;
}

export interface HelpDealer {
  reset(): void;
  deal(rows: RowMasks, catalog: readonly ShapeDefinition[]): ShapeDefinition[] | null;
}

export function createHelpDealer(random: RandomSource = Math.random): HelpDealer {
  let cooldown = 0;
  return {
    reset() { cooldown = 0; },
    deal(rows, catalog) {
      if (cooldown > 0) { cooldown--; return null; }
      if (random() >= HELP_CHANCE) return null;
      const path = helpfulDefinitions(rows, catalog, random);
      if (path) cooldown = HELP_COOLDOWN;
      return path;
    },
  };
}
