// The complete rules of a game, independent of rendering, audio and DOM.
// The Game orchestrator calls these methods and turns the returned outcomes
// into visuals and sound.
import {
  canFitAnywhere, canPlace, clearGrid, createGrid, encodeGrid, findFullLines, isGridEmpty,
  lineCells, placeShape, shapeSize, type CellPosition, type Grid, type Matrix,
} from './board.ts';
import { progression } from './progression.ts';
import { ALL_CLEAR_BONUS, clearScore } from './scoring.ts';
import { SHAPE_DEFINITIONS, pickWeightedShape, type RandomSource, type ShapeDefinition } from './shapes.ts';
import { canRecoverStreak } from './streak-recovery.ts';
import { createHelpDealer, type HelpDealer } from '../ai/helpful-dealer.ts';
import { reviveDefinitions } from '../ai/revive.ts';
import { boardQuality, compare, moves, type RoundScore, type RowMasks, type SolverPiece } from '../ai/solver.ts';

export const TRAY_SLOTS = 3;
/** Attempts to find a first tray piece that fits before giving up. */
const FIRST_PIECE_ATTEMPTS = 20;

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
}

export interface LevelUp {
  level: number;
  gained: number;
}

export interface ScoreAward {
  points: number;
  kind: 'placement' | 'clear' | 'all-clear';
  levelUp: LevelUp | null;
}

export type DealOutcome =
  | { kind: 'dealt'; roundId: number; pieces: TrayPiece[]; gameOver: boolean }
  | { kind: 'recovery-offer'; combo: number; revives: number };

export interface ClearedCell extends CellPosition {
  color: number;
}

export interface ClearOutcome {
  rows: number[];
  cols: number[];
  lines: number;
  combo: number;
  points: number;
  cells: ClearedCell[];
  allClear: boolean;
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
    this.bestScore = options.bestScore ?? 0;
  }

  /** Resets everything except the best score and deals the first round. */
  start(): DealOutcome {
    clearGrid(this.grid);
    this.tray = Array<TrayPiece | null>(TRAY_SLOTS).fill(null);
    this.score = 0;
    this.level = 1;
    this.revives = 1;
    this.combo = 0;
    this.turnHasClear = false;
    this.isGameOver = false;
    this.recoveryPending = false;
    this.clearedLines = 0;
    this.roundLines = 0;
    this.roundPlacements = 0;
    this.roundStreak = 0;
    this.recordCelebrated = false;
    this.helpDealer.reset();
    return this.deal();
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

    const helpful = definitions ? null : this.helpDealer.deal(this.encodedGrid(), this.catalog);
    for (let slot = 0; slot < TRAY_SLOTS; slot++) {
      const chosen = definitions?.[slot] ?? helpful?.[slot] ?? this.randomDefinition(slot === 0);
      this.tray[slot] = this.createPiece(chosen.matrix, slot);
    }

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
    if (this.combo === 3) this.events.push('fire');
    if (this.combo === 5) this.events.push('unstoppable');
    if (this.combo === 10) this.events.push('legendary');

    const points = clearScore(this.combo, lines);
    const cells = lineCells({ rows, cols }).map(cell => ({ ...cell, color: this.grid[cell.row][cell.col]! }));
    this.award(points, 'clear');
    for (const cell of cells) this.grid[cell.row][cell.col] = null;

    const allClear = isGridEmpty(this.grid);
    if (allClear) {
      this.events.push('clean');
      this.award(ALL_CLEAR_BONUS, 'all-clear');
    }
    return { rows, cols, lines, combo: this.combo, points, cells, allClear };
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
    }
    return pickWeightedShape(this.catalog, this.random);
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
    };
  }
}

