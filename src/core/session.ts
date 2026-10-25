// The complete rules of a game, independent of rendering, audio and DOM.
// The Game orchestrator calls these methods and turns the returned outcomes
// into visuals and sound.
import {
  GRID_SIZE, canFitAnywhere, canPlace, clearGrid, createGrid, encodeGrid, findFullLines, isGridEmpty,
  lineCells, placeShape, shapeCells, shapeSize, type CellPosition, type Grid, type Matrix,
} from './board.ts';
import { progression } from './progression.ts';
import { allClearBonus, allClearMultiplier, clearScore, jewelBonus } from './scoring.ts';
import { SHAPE_DEFINITIONS, isSatisfyingShape, pickWeightedShape, type RandomSource, type ShapeDefinition } from './shapes.ts';
import { canRecoverStreak } from './streak-recovery.ts';
import { createHelpDealer, type HelpDealer } from '../ai/helpful-dealer.ts';
import { reviveDefinitions } from '../ai/revive.ts';
import { boardQuality, canPlaceAll, compare, moves, type RoundScore, type RowMasks, type SolverPiece } from '../ai/solver.ts';

export const TRAY_SLOTS = 3;
/** Attempts to find a first tray piece that fits before giving up. */
const FIRST_PIECE_ATTEMPTS = 20;
/** Chance that a random tray without any solid piece (line, 2x2, 2x3, 3x3) gets one swapped in. */
export const SATISFYING_ROUND_CHANCE = 0.5;
/** Re-deals of the random slots when a tray could not be placed completely. */
const FAIR_DEAL_ATTEMPTS = 12;
/** Chance that a randomly dealt piece carries a gold bonus jewel. */
export const JEWEL_CHANCE = 0.06;

export type CelebrationKind =
  | 'blockbuster' | 'triple' | 'clean' | 'escape' | 'room' | 'perfect' | 'brilliant'
  | 'fire' | 'unstoppable' | 'legendary' | 'finish' | 'record' | 'cross' | 'zone';

export interface TrayPiece {
  id: string;
  slot: number;
  matrix: Matrix;
  colorIdx: number;
  width: number;
  height: number;
  blockCount: number;
  /** Cell of the piece (relative to its top-left corner) that holds a gold bonus jewel. */
  jewel: CellPosition | null;
}

export interface LevelUp {
  level: number;
  gained: number;
}

export interface ScoreAward {
  points: number;
  kind: 'placement' | 'clear' | 'all-clear' | 'jewel';
  levelUp: LevelUp | null;
}

export type DealOutcome =
  | { kind: 'dealt'; roundId: number; pieces: TrayPiece[]; gameOver: boolean }
  | { kind: 'recovery-offer'; combo: number; revives: number };

export interface ClearedCell extends CellPosition {
  color: number;
  jewel: boolean;
}

export interface ClearOutcome {
  rows: number[];
  cols: number[];
  lines: number;
  combo: number;
  points: number;
  cells: ClearedCell[];
  allClear: boolean;
  /** Score multiplier of this board clear; 1 when the board was not emptied. */
  allClearMultiplier: number;
  /** Gold jewels destroyed by this clear, and the extra points they paid. */
  jewels: number;
  jewelPoints: number;
}

export interface PlacementOutcome {
  piece: TrayPiece;
  cells: CellPosition[];
  clear: ClearOutcome | null;
  awards: ScoreAward[];
  /** True the first time this game's score passes the stored best. */
  newRecord: boolean;
  events: CelebrationKind[];
  /** Set when the placement emptied the tray and a new round started (or was offered a recovery). */
  next: DealOutcome | null;
  /** True when no remaining piece fits (also true when `next` dealt an unplayable tray). */
  gameOver: boolean;
}

/** Board and tray of a scripted opening, e.g. the very first game's tutorial. */
export interface Opening {
  /** Palette index per cell, null for empty. */
  grid: readonly (readonly (number | null)[])[];
  pieces: readonly SolverPiece[];
}

/** Plain-data copy of a game in progress, for saving and resuming. */
export interface SessionSnapshot {
  version: 1;
  grid: (number | null)[][];
  jewels: number[];
  tray: ({ matrix: number[][]; colorIdx: number; jewel: CellPosition | null } | null)[];
  score: number;
  level: number;
  revives: number;
  combo: number;
  maxCombo: number;
  turnHasClear: boolean;
  isGameOver: boolean;
  recoveryPending: boolean;
  clearedLines: number;
  allClears: number;
  roundId: number;
  roundLines: number;
  roundPlacements: number;
  roundStreak: number;
  recordCelebrated: boolean;
}

export interface SessionOptions {
  random?: RandomSource;
  catalog?: readonly ShapeDefinition[];
  paletteCount?: number;
  helpDealer?: HelpDealer;
  bestScore?: number;
  reviveFor?: (rows: RowMasks, catalog: readonly ShapeDefinition[], random: RandomSource) => SolverPiece[];
}

export class GameSession {
  readonly grid: Grid = createGrid();
  tray: (TrayPiece | null)[] = Array<TrayPiece | null>(TRAY_SLOTS).fill(null);

  score = 0;
  bestScore: number;
  level = 1;
  revives = 1;
  combo = 0;
  /** Whether the current round (three pieces) has cleared at least one line. */
  turnHasClear = false;
  isGameOver = false;
  recoveryPending = false;
  /** Lines cleared this game; drives world progression. */
  clearedLines = 0;
  /** Board clears this game; each one raises the next board clear's multiplier. */
  allClears = 0;
  /** Highest combo of this game. */
  maxCombo = 0;
  /** Board cells (row * 8 + col) holding a gold bonus jewel. */
  readonly jewels = new Set<number>();

  roundId = 0;
  roundLines = 0;
  roundPlacements = 0;
  /** Consecutive completed rounds that contained a clear. */
  roundStreak = 0;
  /** Optimal outcome of the current round, as computed by the solver. */
  roundBest: RoundScore | null = null;
  recordCelebrated = false;

  private readonly random: RandomSource;
  private readonly catalog: readonly ShapeDefinition[];
  private readonly paletteCount: number;
  private readonly helpDealer: HelpDealer;
  private readonly reviveFor: NonNullable<SessionOptions['reviveFor']>;
  private readonly satisfying: readonly ShapeDefinition[];
  private pieceCounter = 0;
  private events: CelebrationKind[] = [];
  private awards: ScoreAward[] = [];
  private newRecord = false;

  constructor(options: SessionOptions = {}) {
    this.random = options.random ?? Math.random;
    this.catalog = options.catalog ?? SHAPE_DEFINITIONS;
    this.paletteCount = options.paletteCount ?? 8;
    this.helpDealer = options.helpDealer ?? createHelpDealer(this.random);
    this.reviveFor = options.reviveFor ?? reviveDefinitions;
    this.satisfying = this.catalog.filter(def => isSatisfyingShape(def.matrix));
    this.bestScore = options.bestScore ?? 0;
  }

  /** Resets everything except the best score and deals the first round, or the given opening. */
  start(opening: Opening | null = null): DealOutcome {
    clearGrid(this.grid);
    this.jewels.clear();
    this.tray = Array<TrayPiece | null>(TRAY_SLOTS).fill(null);
    this.score = 0;
    this.level = 1;
    this.revives = 1;
    this.combo = 0;
    this.turnHasClear = false;
    this.isGameOver = false;
    this.recoveryPending = false;
    this.clearedLines = 0;
    this.allClears = 0;
    this.maxCombo = 0;
    this.roundId = 0;
    this.roundLines = 0;
    this.roundPlacements = 0;
    this.roundStreak = 0;
    this.recordCelebrated = false;
    this.helpDealer.reset();
    opening?.grid.forEach((cells, row) => cells.forEach((cell, col) => { this.grid[row][col] = cell; }));
    return this.deal(opening?.pieces ?? null);
  }

  snapshot(): SessionSnapshot {
    return {
      version: 1,
      grid: this.grid.map(row => [...row]),
      jewels: [...this.jewels],
      tray: this.tray.map(piece => piece && { matrix: piece.matrix.map(row => [...row]), colorIdx: piece.colorIdx, jewel: piece.jewel }),
      score: this.score, level: this.level, revives: this.revives, combo: this.combo, maxCombo: this.maxCombo,
      turnHasClear: this.turnHasClear, isGameOver: this.isGameOver, recoveryPending: this.recoveryPending,
      clearedLines: this.clearedLines, allClears: this.allClears, roundId: this.roundId, roundLines: this.roundLines,
      roundPlacements: this.roundPlacements, roundStreak: this.roundStreak, recordCelebrated: this.recordCelebrated,
    };
  }

  /** Continues a saved game. Returns false, changing nothing, when the snapshot is unusable. */
  restore(data: unknown): boolean {
    if (!isSnapshot(data)) return false;
    data.grid.forEach((cells, row) => cells.forEach((cell, col) => { this.grid[row][col] = cell; }));
    this.jewels.clear();
    for (const index of data.jewels) if (this.grid[Math.floor(index / 8)][index % 8] !== null) this.jewels.add(index);
    this.tray = data.tray.map((piece, slot) => piece && { ...this.createPiece(piece.matrix, slot), colorIdx: piece.colorIdx, jewel: piece.jewel });
    ({
      score: this.score, level: this.level, revives: this.revives, combo: this.combo, maxCombo: this.maxCombo,
      turnHasClear: this.turnHasClear, isGameOver: this.isGameOver, recoveryPending: this.recoveryPending,
      clearedLines: this.clearedLines, allClears: this.allClears, roundId: this.roundId, roundLines: this.roundLines,
      roundPlacements: this.roundPlacements, roundStreak: this.roundStreak, recordCelebrated: this.recordCelebrated,
    } = data);
    this.roundBest = null;
    this.helpDealer.reset();
    if (this.score > this.bestScore) this.bestScore = this.score;
    return true;
  }

  encodedGrid(): number[] {
    return encodeGrid(this.grid);
  }

  canPlace(slot: number, col: number, row: number): boolean {
    const piece = this.tray[slot];
    return Boolean(piece) && canPlace(this.grid, piece!.matrix, col, row);
  }

  pieceFits(slot: number): boolean {
    const piece = this.tray[slot];
    return Boolean(piece) && canFitAnywhere(this.grid, piece!.matrix);
  }

  setRoundBest(roundId: number, best: RoundScore): void {
    if (roundId === this.roundId) this.roundBest = best;
  }

  /**
   * Deals the next three pieces. Without explicit definitions this evaluates the
   * completed round first: a round without a clear resets the combo, unless a
   * long combo qualifies for a recovery offer, in which case nothing is dealt
   * until {@link resolveRecovery} is called.
   */
  deal(definitions: readonly SolverPiece[] | null = null): DealOutcome {
    if (!definitions && !this.recoveryPending && canRecoverStreak(this.combo, this.turnHasClear, this.revives)) {
      this.recoveryPending = true;
      return { kind: 'recovery-offer', combo: this.combo, revives: this.revives };
    }
    if (!definitions && !this.turnHasClear) this.combo = 0;
    this.turnHasClear = false;

    const rows = this.encodedGrid();
    const helpful = definitions ? null : this.helpDealer.deal(rows, this.catalog, { combo: this.combo, round: this.roundId + 1 });
    const fixed = helpful?.length ?? 0;
    const chosen: SolverPiece[] = [];
    for (let slot = 0; slot < TRAY_SLOTS; slot++) {
      chosen.push(definitions?.[slot] ?? helpful?.[slot] ?? this.randomDefinition(slot === 0));
    }
    if (!definitions) {
      this.addSatisfyingPiece(chosen, fixed);
      // Fair deals: re-roll the random slots until all three pieces can be placed.
      for (let attempt = 0; attempt < FAIR_DEAL_ATTEMPTS && !canPlaceAll(rows, chosen); attempt++) {
        for (let slot = fixed; slot < TRAY_SLOTS; slot++) chosen[slot] = this.randomDefinition(slot === 0);
        this.addSatisfyingPiece(chosen, fixed);
      }
    }
    chosen.forEach((def, slot) => {
      const piece = this.createPiece(def.matrix, slot);
      if (!definitions && slot >= fixed && this.random() < JEWEL_CHANCE) piece.jewel = this.pickJewelCell(def.matrix);
      this.tray[slot] = piece;
    });

    this.roundLines = 0;
    this.roundPlacements = 0;
    this.roundId++;
    this.roundBest = null;
    const gameOver = !this.anyPieceFits();
    if (gameOver) this.isGameOver = true;
    return { kind: 'dealt', roundId: this.roundId, pieces: this.tray.filter(p => p !== null), gameOver };
  }

  /** Places the tray piece in `slot` with its top-left cell at (col, row). Returns null for illegal moves. */
  place(slot: number, col: number, row: number): PlacementOutcome | null {
    if (this.isGameOver || this.recoveryPending) return null;
    const piece = this.tray[slot];
    if (!piece || !canPlace(this.grid, piece.matrix, col, row)) return null;

    this.events = [];
    this.awards = [];
    this.newRecord = false;
    const legalBefore = moves(this.encodedGrid(), this.tray).length;
    const previousLines = this.roundLines;
    this.roundPlacements++;

    const cells = placeShape(this.grid, piece.matrix, col, row, piece.colorIdx);
    if (piece.jewel) this.jewels.add((row + piece.jewel.row) * 8 + col + piece.jewel.col);
    this.award(piece.blockCount, 'placement');
    this.tray[slot] = null;

    const clear = this.resolveClears();
    const cleared = this.roundLines - previousLines;
    if (cleared && legalBefore === 1) this.events.push('escape');
    if (cleared && legalBefore <= 3 && moves(this.encodedGrid(), this.tray).length >= 12) this.events.push('room');

    let next: DealOutcome | null = null;
    let gameOver: boolean;
    if (this.tray.every(p => p === null)) {
      this.roundStreak = this.turnHasClear ? this.roundStreak + 1 : 0;
      if (this.roundStreak > 0 && this.roundStreak % 5 === 0) this.events.push('zone');
      if (this.roundPlacements === 3 && isGridEmpty(this.grid)) this.events.push('perfect');
      if (this.roundPlacements === 3 && previousLines === 0 && cleared >= 2) this.events.push('finish');
      const actual = { placed: this.roundPlacements, lines: this.roundLines, quality: boardQuality(this.encodedGrid()) };
      if (this.roundBest && this.roundPlacements === 3 && compare(actual, this.roundBest) === 0) this.events.push('brilliant');
      next = this.deal();
      gameOver = next.kind === 'dealt' && next.gameOver;
    } else {
      gameOver = !this.anyPieceFits();
      if (gameOver) this.isGameOver = true;
    }

    return { piece, cells, clear, awards: this.awards, newRecord: this.newRecord, events: this.events, next, gameOver };
  }

  /** Spends a revive after game over and deals three pieces that guarantee a clear. */
  revive(): DealOutcome | null {
    if (!this.isGameOver || this.revives <= 0) return null;
    this.isGameOver = false;
    const definitions = this.reviveFor(this.encodedGrid(), this.catalog, this.random);
    // Preserve the combo while replacing the exhausted tray.
    const outcome = this.deal(definitions);
    this.revives--;
    return outcome;
  }

  /** Answers a pending recovery offer; accepting spends a revive and keeps the combo. */
  resolveRecovery(accepted: boolean): { saved: boolean; outcome: DealOutcome } | null {
    if (!this.recoveryPending) return null;
    let saved = false;
    if (accepted && this.revives > 0) {
      this.revives--;
      this.turnHasClear = true;
      saved = true;
    }
    // Keep the guard set while dealing so declining cannot reopen the offer.
    const outcome = this.deal();
    this.recoveryPending = false;
    return { saved, outcome };
  }

  private resolveClears(): ClearOutcome | null {
    const { rows, cols } = findFullLines(this.grid);
    const lines = rows.length + cols.length;
    this.roundLines += lines;
    if (lines === 0) return null;

    this.clearedLines += lines;
    if (lines >= 4) this.events.push('blockbuster');
    else if (lines === 3) this.events.push('triple');
    if (rows.length && cols.length) this.events.push('cross');

    this.turnHasClear = true;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (this.combo === 3) this.events.push('fire');
    if (this.combo === 5) this.events.push('unstoppable');
    if (this.combo === 10) this.events.push('legendary');

    const points = clearScore(this.combo, lines);
    const cells = lineCells({ rows, cols }).map(cell => ({
      ...cell, color: this.grid[cell.row][cell.col]!, jewel: this.jewels.has(cell.row * 8 + cell.col),
    }));
    this.award(points, 'clear');
    const jewels = cells.filter(cell => cell.jewel).length;
    const jewelPoints = jewels ? jewelBonus(points, jewels) : 0;
    if (jewels) this.award(jewelPoints, 'jewel');
    for (const cell of cells) {
      this.grid[cell.row][cell.col] = null;
      this.jewels.delete(cell.row * 8 + cell.col);
    }

    const allClear = isGridEmpty(this.grid);
    let multiplier = 1;
    if (allClear) {
      this.allClears++;
      multiplier = allClearMultiplier(this.allClears);
      this.events.push('clean');
      this.award(allClearBonus(points, this.allClears), 'all-clear');
    }
    return { rows, cols, lines, combo: this.combo, points, cells, allClear, allClearMultiplier: multiplier, jewels, jewelPoints };
  }

  private award(points: number, kind: ScoreAward['kind']): void {
    this.score += points;
    let levelUp: LevelUp | null = null;
    const nextLevel = progression(this.score).level;
    if (nextLevel > this.level) {
      const gained = nextLevel - this.level;
      this.revives += gained;
      this.level = nextLevel;
      levelUp = { level: nextLevel, gained };
    }
    if (this.score > this.bestScore) {
      if (!this.recordCelebrated) {
        this.events.push('record');
        this.newRecord = true;
        this.recordCelebrated = true;
      }
      this.bestScore = this.score;
    }
    this.awards.push({ points, kind, levelUp });
  }

  private anyPieceFits(): boolean {
    return this.tray.some(piece => piece !== null && canFitAnywhere(this.grid, piece.matrix));
  }

  private randomDefinition(mustFit: boolean): ShapeDefinition {
    if (mustFit) {
      for (let attempt = 0; attempt < FIRST_PIECE_ATTEMPTS; attempt++) {
        const def = pickWeightedShape(this.catalog, this.random);
        if (canFitAnywhere(this.grid, def.matrix)) return def;
      }
      // Tight boards: fall back to the shapes that still fit instead of giving up.
      const fitting = this.catalog.filter(def => canFitAnywhere(this.grid, def.matrix));
      if (fitting.length) return pickWeightedShape(fitting, this.random);
    }
    return pickWeightedShape(this.catalog, this.random);
  }

  /**
   * Block Blast trays regularly contain a chunky solid piece. When the randomly
   * drawn slots have none, sometimes swap the last one for a solid piece that fits.
   */
  private addSatisfyingPiece(chosen: SolverPiece[], fixedSlots: number): void {
    const slot = TRAY_SLOTS - 1;
    if (fixedSlots > slot || !this.satisfying.length) return;
    if (chosen.some(def => isSatisfyingShape(def.matrix))) return;
    if (this.random() >= SATISFYING_ROUND_CHANCE) return;
    const fitting = this.satisfying.filter(def => canFitAnywhere(this.grid, def.matrix));
    if (fitting.length) chosen[slot] = pickWeightedShape(fitting, this.random);
  }

  private createPiece(matrix: Matrix, slot: number): TrayPiece {
    const { width, height, blockCount } = shapeSize(matrix);
    return {
      id: `piece-${++this.pieceCounter}`,
      slot,
      matrix,
      colorIdx: Math.floor(this.random() * this.paletteCount),
      width,
      height,
      blockCount,
      jewel: null,
    };
  }

  private pickJewelCell(matrix: Matrix): CellPosition {
    const cells = shapeCells(matrix);
    return cells[Math.floor(this.random() * cells.length)];
  }
}

const isInt = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

function isMatrix(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length > 0 && value.length <= 5 && value.every(row =>
    Array.isArray(row) && row.length === (value[0] as unknown[]).length && row.length <= 5 && row.every(cell => cell === 0 || cell === 1))
    && value.flat().includes(1);
}

/** Structural check of saved data, so a corrupt or outdated save starts a fresh game instead. */
function isSnapshot(data: unknown): data is SessionSnapshot {
  const d = data as Partial<SessionSnapshot> | null;
  if (!d || d.version !== 1) return false;
  const counters = [d.score, d.level, d.revives, d.combo, d.maxCombo, d.clearedLines, d.allClears, d.roundId, d.roundLines, d.roundPlacements, d.roundStreak];
  if (!counters.every(value => isInt(value, 0)) || !isInt(d.level, 1)) return false;
  if (![d.turnHasClear, d.isGameOver, d.recoveryPending, d.recordCelebrated].every(value => typeof value === 'boolean')) return false;
  if (!Array.isArray(d.grid) || d.grid.length !== GRID_SIZE) return false;
  if (!d.grid.every(row => Array.isArray(row) && row.length === GRID_SIZE && row.every(cell => cell === null || isInt(cell, 0, 63)))) return false;
  if (!Array.isArray(d.jewels) || !d.jewels.every(index => isInt(index, 0, GRID_SIZE * GRID_SIZE - 1))) return false;
  if (!Array.isArray(d.tray) || d.tray.length !== TRAY_SLOTS) return false;
  return d.tray.every(piece => piece === null || (isMatrix(piece.matrix) && isInt(piece.colorIdx, 0, 63) && (
    piece.jewel === null || (isInt(piece.jewel?.row, 0, 4) && isInt(piece.jewel?.col, 0, 4) && piece.matrix[piece.jewel.row]?.[piece.jewel.col] === 1))));
}

