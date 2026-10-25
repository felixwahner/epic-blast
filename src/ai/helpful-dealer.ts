import type { RandomSource, ShapeDefinition } from '../core/shapes.ts';
import { boardClearPath, filledCells } from './board-clear.ts';
import { applyMove, boardQuality, moves, type RowMasks } from './solver.ts';

/** Chance that a round is dealt with a deliberately helpful (line-clearing) piece. */
export const HELP_CHANCE = 0.3;
/** Higher chance while a combo is running, so streaks feel rewarding instead of random. */
export const COMBO_HELP_CHANCE = 0.5;
/** Rounds without help after a helpful deal. */
export const HELP_COOLDOWN = 1;
/** Boards with at most this many blocks are searched for a full board clear. */
export const BOARD_CLEAR_MAX_CELLS = 28;
/** Chance to deal a board-clearing set when one exists. Ignores the help cooldown. */
export const BOARD_CLEAR_CHANCE = 0.6;
/** The first rounds of a game are dealt generously, so combos start early. */
export const OPENING_ROUNDS = 4;
export const OPENING_HELP_CHANCE = 0.6;
/** Boards with at least this many blocks are tight: help comes more often and skips the cooldown. */
export const TIGHT_BOARD_CELLS = 36;
export const TIGHT_HELP_CHANCE = 0.6;

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  return items.map(item => ({ item, rank: random() })).sort((a, b) => a.rank - b.rank).map(x => x.item);
}

// A bounded one/two-move search. Never modifies ordinary random selections.
export function helpfulDefinitions(rows: RowMasks, catalog: readonly ShapeDefinition[], random: RandomSource = Math.random): ShapeDefinition[] | null {
  const roll = random();
  const depth = roll < 0.7 ? 1 : 2;
  const wantMultiple = roll >= 0.95;
  const ordered = shuffled(catalog, random);
  // Each board's quality is scored once, not again in every sort comparison.
  const options: { def: ShapeDefinition; next: { rows: number[]; lines: number }; quality: number }[] = [];
  for (const def of ordered) for (const move of moves(rows, [def])) {
    const next = applyMove(rows, def, move);
    options.push({ def, next, quality: boardQuality(next.rows) });
  }
  let best: { path: ShapeDefinition[]; quality: number } | null = null;
  const consider = (path: ShapeDefinition[], result: { rows: number[]; lines: number }, quality?: number) => {
    if (result.lines < (wantMultiple ? 2 : 1)) return;
    quality ??= boardQuality(result.rows);
    if (!best || quality > best.quality) best = { path, quality };
  };
  for (const option of options) consider([option.def], option.next, option.quality);
  if (depth === 2 && !best) {
    // Prefer promising first moves; cap work to avoid blocking mobile input.
    const candidates = options.sort((a, b) => b.quality - a.quality).slice(0, 24);
    for (const first of candidates) for (const def of ordered) for (const move of moves(first.next.rows, [def])) {
      const next = applyMove(first.next.rows, def, move);
      consider([first.def, def], { rows: next.rows, lines: first.next.lines + next.lines });
    }
  }
  return (best as { path: ShapeDefinition[] } | null)?.path ?? null;
}

export interface DealContext {
  /** Current combo; a running combo raises the help chance. */
  combo: number;
  /** 1-based number of the round being dealt; the opening rounds get more help. */
  round?: number;
}

/**
 * Help chance for the game's phase: generous in the opening and on tight boards,
 * leaner in between so the middle of a game builds tension.
 */
export function helpChance(context: DealContext, filled: number): number {
  if (filled >= TIGHT_BOARD_CELLS) return TIGHT_HELP_CHANCE;
  if ((context.round ?? Infinity) <= OPENING_ROUNDS) return OPENING_HELP_CHANCE;
  return context.combo > 0 ? COMBO_HELP_CHANCE : HELP_CHANCE;
}

export interface HelpDealer {
  reset(): void;
  deal(rows: RowMasks, catalog: readonly ShapeDefinition[], context?: DealContext): ShapeDefinition[] | null;
}

export function createHelpDealer(random: RandomSource = Math.random): HelpDealer {
  let cooldown = 0;
  return {
    reset() { cooldown = 0; },
    deal(rows, catalog, context = { combo: 0 }) {
      const filled = filledCells(rows);
      if (filled > 0 && filled <= BOARD_CLEAR_MAX_CELLS && random() < BOARD_CLEAR_CHANCE) {
        const sweep = boardClearPath(rows, catalog, random);
        if (sweep) { cooldown = HELP_COOLDOWN; return sweep; }
      }
      if (cooldown > 0 && filled < TIGHT_BOARD_CELLS) { cooldown--; return null; }
      if (random() >= helpChance(context, filled)) return null;
      const path = helpfulDefinitions(rows, catalog, random);
      if (path) cooldown = HELP_COOLDOWN;
      return path;
    },
  };
}
