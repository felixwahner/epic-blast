// Wires the pure GameSession to Pixi rendering, audio, haptics and the DOM HUD.
// Rules live in core/session.ts; this file only turns their outcomes into feedback.
import { Application, Assets, Container, Graphics, Rectangle, Texture, type FederatedPointerEvent } from 'pixi.js';
// 512px is ample: the jewel is shaded at the on-screen cell size (about 100-200 device pixels).
import stoneReferenceURL from '../assets/images/neon-jewel-512.png?url';
import { RoundPredictor } from '../ai/round-predictor.ts';
import { MILLION, isNearRecord } from '../audio/announcer.ts';
import type { AudioEngine } from '../audio/audio-engine.ts';
import { BackgroundMusic } from '../audio/music.ts';
import { predictClears, type FullLines } from '../core/board.ts';
import {
  addLines,
  chooseStart,
  markSeen,
  nextUnlock,
  parseCollection,
  unlockedWorlds,
  type WorldCollection,
} from '../core/collection.ts';
import { TUTORIAL_OPENING, TUTORIAL_TARGET } from '../core/opening.ts';
import { LINES_PER_WORLD, progression, worldProgress } from '../core/progression.ts';
import { comboMilestone } from '../core/scoring.ts';
import { GameSession, type DealOutcome, type PlacementOutcome } from '../core/session.ts';
import { formatNumber, t } from '../i18n/index.ts';
import { Haptics } from '../platform/haptics.ts';
import { STORAGE_KEYS, readNumber, safeStorage, syncBestScore, type KeyValueStore } from '../platform/storage.ts';
import { BlockTextures } from '../render/block-textures.ts';
import { BoardFlash } from '../render/board-flash.ts';
import { BoardView } from '../render/board-view.ts';
import { CHARGE_TIME } from '../render/clear-animation.ts';
import { dragLift, dragPlacement, hitTestTray, type Point } from '../render/drag.ts';
import { FloatingTexts } from '../render/floating-text.ts';
import { cellCenter, cellsCentroid, computeLayout, emptyLayout, slotCenter, type Layout } from '../render/layout.ts';
import { ParticleSystem } from '../render/particles.ts';
import { ScreenShake } from '../render/screen-shake.ts';
import { TrayView, type PieceView } from '../render/tray-view.ts';
import { WORLDS, extendWorldOrder, themeFor, themeKey, type Theme } from '../theme/themes.ts';
import { boardURL } from '../theme/world-art.ts';
import { Celebrations } from '../ui/celebrations.ts';
import { VisualEffects, pulse } from '../ui/effects.ts';
import { Hud } from '../ui/hud.ts';
import { OptionsMenu } from '../ui/options-menu.ts';
import { RestartConfirm } from '../ui/restart-confirm.ts';
import { createScoreAnimator, type ScoreAnimator } from '../ui/score-animator.ts';
import { applyTheme } from '../ui/theme-dom.ts';
import { TutorialHand } from '../ui/tutorial-hand.ts';
import { WorldGallery } from '../ui/world-gallery.ts';

/** Delay before the world theme may change after a clear, so the explosion reads first. */
const THEME_CHANGE_DELAY_MS = 1100;
const NO_LINES: FullLines = { rows: [], cols: [] };
/** The game over screen points at the record when the score got at least this close. */
const RECORD_HINT_SHARE = 0.6;
/** ...and at the next level once this share of the way there. */
const LEVEL_HINT_PROGRESS = 0.6;

/** Canvas backing-store density; capped so 3x phones don't pay for 9x the fill rate. */
const canvasResolution = () => Math.min(window.devicePixelRatio || 1, 2);

/** Same world look: the block textures and board background can stay as they are. */
const sameLook = (a: Theme, b: Theme): boolean =>
  a.slug === b.slug && a.material === b.material && a.palettes.every((p, i) => p.hex === b.palettes[i].hex);

interface DragState {
  slot: number;
  view: PieceView;
  pointer: Point;
  target: { col: number; row: number } | null;
  preview: FullLines;
  /** Grid cell the piece was last evaluated at; moves within it skip the board checks. */
  cell: string;
}

export interface GameOptions {
  audio: AudioEngine;
  storage?: KeyValueStore;
}

export class Game {
  private readonly audio: AudioEngine;
  private readonly storage: KeyValueStore;
  private readonly hud = new Hud();
  private readonly effects: VisualEffects;
  private readonly haptics: Haptics;
  private readonly session: GameSession;
  private readonly celebrations: Celebrations;
  private readonly scoreAnimator: ScoreAnimator;
  private readonly predictor = new RoundPredictor();
  private readonly shake = new ScreenShake();
  private readonly flash = new BoardFlash();
  private readonly reduced = () => this.effects.reduced;

  private readonly app: Application<HTMLCanvasElement>;
  private readonly root = new Container();
  private readonly trayBackdrop = new Graphics();
  private readonly dragLayer = new Container();
  private readonly textures: BlockTextures;
  private readonly board: BoardView;
  private readonly tray: TrayView;
  private readonly particles: ParticleSystem;
  private readonly texts: FloatingTexts;

  private layout: Layout = emptyLayout();
  private theme: Theme = themeFor(1);
  private themeApplied = false;
  private themeChangeAt = 0;
  private referenceStone: Texture | null = null;
  /** Shuffled world sequence of the current game; grows a full round at a time. */
  private worldOrder: number[] = extendWorldOrder([], 1);
  /** "Record in sight" plays at most once per game. */
  private nearRecordCalled = false;
  /** Worlds unlocked across all games, and the opening world. */
  private readonly collection: WorldCollection;
  private readonly hand: TutorialHand;
  /** Board material variants per world slug, loaded when the world first appears. */
  private readonly boardMaterials = new Map<string, Texture[]>();
  private readonly boardLoads = new Set<string>();
  private drag: DragState | null = null;
  /** Canvas position on the page, measured on resize instead of on every award. */
  private canvasRect: DOMRect | null = null;
  private resizeFrame = 0;

  constructor({ audio, storage = safeStorage }: GameOptions) {
    this.audio = audio;
    this.storage = storage;
    this.effects = new VisualEffects(storage);
    this.haptics = new Haptics(storage);
    this.session = new GameSession({ bestScore: readNumber(storage, STORAGE_KEYS.bestScore) });
    this.collection = parseCollection(storage.getItem(STORAGE_KEYS.worlds), WORLDS.length);
    this.hand = new TutorialHand(this.hud.pixiMount);
    this.celebrations = new Celebrations(this.hud.canvasWrapper);
    this.scoreAnimator = createScoreAnimator(this.hud.score, { host: this.hud.container, reducedMotion: this.reduced });
    this.hud.setBest(this.session.bestScore);

    const rect = this.hud.pixiMount.getBoundingClientRect();
    this.app = new Application<HTMLCanvasElement>({
      width: Math.max(300, Math.floor(rect.width)),
      height: Math.max(400, Math.floor(rect.height)),
      backgroundAlpha: 0,
      resolution: canvasResolution(),
      autoDensity: true,
      antialias: false,
    });
    this.hud.pixiMount.appendChild(this.app.view);

    this.textures = new BlockTextures(this.app.renderer);
    this.textures.rebuild(this.theme.palettes, this.theme.material, null);
    this.board = new BoardView(this.textures);
    this.tray = new TrayView(this.textures);
    const particleLayer = new Container();
    const textLayer = new Container();
    this.particles = new ParticleSystem(particleLayer, { reduced: this.reduced, createGraphics: () => new Graphics() });
    this.texts = new FloatingTexts(textLayer, this.reduced);

    // Back to front. The clear preview sits above blocks and ghosts so it stays visible.
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.board.background,
      this.board.materialLayer,
      this.board.blocks,
      this.board.jewelLayer,
      this.board.ghosts,
      this.board.preview,
      this.flash.graphics,
      this.trayBackdrop,
      this.tray.container,
      this.dragLayer,
      particleLayer,
      textLayer,
    );
  }

  start(): void {
    this.loadAssets();
    this.bindControls();
    this.resize();
    // Resize events fire many times per frame while a window is dragged; lay out once per frame.
    window.addEventListener('resize', () => {
      if (!this.resizeFrame) this.resizeFrame = requestAnimationFrame(() => this.resize());
    });
    if (!this.resumeSavedGame()) this.startNewGame();
    this.app.ticker.add(delta => this.update(delta / 60));
  }

  // --- Assets & theme -------------------------------------------------------

  private loadAssets(): void {
    Assets.load<Texture>(stoneReferenceURL)
      .then(texture => {
        this.referenceStone = texture;
        this.updateWorldTheme(true);
      })
      .catch(error => console.warn('Reference stone load failed:', error));
  }

  private loadBoardMaterial(slug: string): void {
    const url = boardURL(slug);
    if (!url || this.boardLoads.has(slug)) return;
    this.boardLoads.add(slug);
    Assets.load<Texture>(url)
      .then(sheet => {
        const { width, height } = sheet;
        // Take each of the sheet's seven-by-seven sockets whole, rim included.
        const variants: Texture[] = [];
        for (let row = 0; row < 7; row++)
          for (let col = 0; col < 7; col++) {
            variants.push(
              new Texture(
                sheet.baseTexture,
                new Rectangle(
                  Math.floor(width * (0.015 + col * 0.135)),
                  Math.floor(height * (0.015 + row * 0.135)),
                  Math.floor(width * 0.135),
                  Math.floor(height * 0.135),
                ),
              ),
            );
          }
        this.boardMaterials.set(slug, variants);
        if (this.theme.slug === slug) this.renderBoardBackground();
      })
      .catch(error => {
        this.boardLoads.delete(slug);
        console.warn('Board material load failed:', error);
      });
  }

  private updateWorldTheme(force = false): void {
    if (!force && performance.now() < this.themeChangeAt) return;
    const world = worldProgress(this.session.clearedLines);
    // Runs every frame, so compare the cheap key before building a theme.
    if (!force && this.themeApplied && themeKey(world.world, world.progress) === this.theme.key) return;
    if (world.world > this.worldOrder.length) this.worldOrder = extendWorldOrder(this.worldOrder, world.world);
    const next = themeFor(world.world, world.progress, this.worldOrder);

    const previous = this.theme;
    const wasApplied = this.themeApplied;
    this.theme = next;
    this.themeApplied = true;
    if (markSeen(this.collection, next.index)) this.saveCollection();
    if (wasApplied && previous.name !== next.name && this.session.clearedLines > 0) {
      this.texts.spawn(
        this.layout.viewWidth / 2,
        this.layout.gridY + 50,
        next.name,
        next.primary,
        18,
        this.layout.viewWidth,
      );
    }
    applyTheme(next, this.hud.container, this.hud.worldLabel);
    // A new stage only brightens the page; the jewels and board change with the world.
    if (!force && wasApplied && sameLook(previous, next)) return;
    this.loadBoardMaterial(next.slug);
    this.rebuildBlockTextures();
    this.renderBoardBackground();
  }

  private rebuildBlockTextures(): void {
    const pixelSize = this.layout.cellSize * this.app.renderer.resolution || undefined;
    const disposeOld = this.textures.rebuild(
      this.theme.palettes,
      this.theme.material,
      this.referenceStone,
      pixelSize,
      this.theme.slug,
    );
    this.syncBoard();
    this.tray.retexture();
    this.board.retextureGhosts();
    disposeOld();
  }

  private renderBoardBackground(): void {
    this.board.renderBackground(this.layout, this.theme.palettes, this.theme, this.boardMaterials.get(this.theme.slug));
  }

  // --- Layout ---------------------------------------------------------------

  private resize(): void {
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
    this.canvasRect = null;
    const rect = this.hud.pixiMount.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Browser zoom and moving between monitors change the pixel ratio at runtime.
    this.app.renderer.resolution = canvasResolution();
    this.app.renderer.resize(Math.floor(rect.width), Math.floor(rect.height));
    const layout = (this.layout = computeLayout(rect.width, rect.height));
    this.hud.positionComboBox(layout);
    this.hud.alignHeader(layout);
    this.trayBackdrop.clear();
    this.trayBackdrop.beginFill(0x080714, 0.78);
    this.trayBackdrop.drawRoundedRect(
      layout.gridX,
      layout.trayY - 4,
      layout.gridWidth,
      Math.min(layout.trayHeight + 8, layout.viewHeight - layout.trayY),
      12,
    );
    this.trayBackdrop.endFill();
    this.renderBoardBackground();
    this.flash.relayout(layout);
    if (Math.round(layout.cellSize * this.app.renderer.resolution) !== this.textures.pixelSize)
      this.rebuildBlockTextures();
    this.syncBoard();
    this.tray.relayout(layout);
    this.positionHand();
    this.scoreAnimator.resize();
    if (this.drag) this.drag.cell = '';
  }

  // --- Game flow ------------------------------------------------------------

  private startNewGame(): void {
    this.audio.announcer.reset();
    this.worldOrder = extendWorldOrder([], 1, Math.random, this.collection.start);
    const tutorial = !this.storage.getItem(STORAGE_KEYS.tutorialDone);
    const outcome = this.session.start(tutorial ? TUTORIAL_OPENING : null);
    this.nearRecordCalled = false;
    this.audio.announcer.announce('start');
    this.resetPresentation();
    this.updateProgressionUI();
    this.handleDeal(outcome);
    if (tutorial) this.positionHand();
  }

  /** Continues the game saved before the page was closed. Returns false when there is none. */
  private resumeSavedGame(): boolean {
    let saved: { session?: unknown; worldOrder?: unknown; nearRecordCalled?: unknown } | null = null;
    try {
      saved = JSON.parse(this.storage.getItem(STORAGE_KEYS.savedGame) || 'null');
    } catch {
      return false;
    }
    if (!saved || !this.session.restore(saved.session)) return false;
    const order = saved.worldOrder;
    const validOrder =
      Array.isArray(order) &&
      order.length > 0 &&
      order.every(index => Number.isInteger(index) && index >= 0 && index < WORLDS.length);
    this.worldOrder = validOrder ? order : extendWorldOrder([], 1, Math.random, this.collection.start);
    this.nearRecordCalled = Boolean(saved.nearRecordCalled);
    this.resetPresentation();
    this.scoreAnimator.reset(this.session.score);
    this.hud.setRecordGlow(this.session.recordCelebrated);
    this.updateWorldTheme(true);
    this.updateProgressionUI();
    const { session } = this;
    if (session.recoveryPending) {
      this.hud.offerRecovery(session.combo, session.revives);
    } else {
      this.handleDeal({
        kind: 'dealt',
        roundId: session.roundId,
        pieces: session.tray.filter(p => p !== null),
        gameOver: session.isGameOver,
      });
    }
    return true;
  }

  /** Writes the game in progress, so closing the page never loses it. */
  private saveGame(): void {
    const { session } = this;
    // A finished game without revives cannot continue; the next visit starts fresh.
    if (session.isGameOver && session.revives === 0) {
      this.storage.setItem(STORAGE_KEYS.savedGame, '');
      return;
    }
    this.storage.setItem(
      STORAGE_KEYS.savedGame,
      JSON.stringify({
        session: session.snapshot(),
        worldOrder: this.worldOrder,
        nearRecordCalled: this.nearRecordCalled,
      }),
    );
  }

  private saveCollection(): void {
    this.storage.setItem(STORAGE_KEYS.worlds, JSON.stringify(this.collection));
    this.updateWorldCount();
  }

  private updateWorldCount(): void {
    this.hud.setWorldCount(
      unlockedWorlds(this.collection, WORLDS.length).length,
      WORLDS.length,
      this.collection.fresh.length > 0,
    );
  }

  /** Board, effects and overlays back to a clean state for a new or resumed game. */
  private resetPresentation(): void {
    this.themeChangeAt = 0;
    this.hud.closeRecovery();
    this.celebrations.reset();
    this.hand.hide();
    this.scoreAnimator.reset();
    this.effects.updateComboMood(this.hud.canvasWrapper, 0);
    this.hud.setRecordGlow(false);
    this.shake.reset();
    this.flash.stop();
    this.drag = null;
    this.board.clearGhost();
    this.board.clearPreview();
    this.particles.clear();
    this.texts.clear();
    this.hud.setCombo(0);
    this.hud.hideGameOver();
    this.syncBoard();
    this.updateWorldCount();
  }

  private syncBoard(): void {
    this.board.syncBlocks(this.session.grid, this.layout, this.session.jewels);
  }

  private updateCombo(): void {
    const { session } = this;
    this.hud.setCombo(session.combo);
    this.hud.setComboFuse(session.combo, session.turnHasClear, session.tray.filter(p => p !== null).length);
  }

  /** Points the tutorial hand from the first tray piece to its target, while the first game waits for it. */
  private positionHand(): void {
    const { session, layout } = this;
    const piece = session.tray[TUTORIAL_TARGET.slot];
    const waiting =
      !this.storage.getItem(STORAGE_KEYS.tutorialDone) &&
      session.roundId === 1 &&
      session.roundPlacements === 0 &&
      piece;
    if (!waiting || !layout.cellSize) {
      if (!waiting) this.hand.hide();
      return;
    }
    // The hand ends where a finger has to be: dragged pieces float above the pointer.
    const center = cellCenter(
      layout,
      TUTORIAL_TARGET.row + (piece.height - 1) / 2,
      TUTORIAL_TARGET.col + (piece.width - 1) / 2,
    );
    const to = { x: center.x, y: center.y + dragLift(piece.height, layout.cellSize) };
    this.hand.show(slotCenter(layout, TUTORIAL_TARGET.slot), to);
  }

  private finishTutorial(): void {
    if (this.storage.getItem(STORAGE_KEYS.tutorialDone)) return;
    this.storage.setItem(STORAGE_KEYS.tutorialDone, '1');
    this.hand.hide();
  }

  private handleDeal(outcome: DealOutcome): void {
    if (outcome.kind === 'recovery-offer') {
      this.hud.offerRecovery(outcome.combo, outcome.revives);
      this.saveGame();
      return;
    }
    this.updateCombo();
    this.tray.setPieces(outcome.pieces, this.layout);
    // A resumed round may already be partly played; the solver only judges whole rounds.
    if (this.session.roundPlacements === 0)
      this.predictor.start(
        outcome.roundId,
        this.session.encodedGrid(),
        this.session.tray.map(p => (p ? { matrix: p.matrix } : null)),
        (id, result) => this.session.setRoundBest(id, result),
      );
    this.refreshFits();
    if (outcome.gameOver) this.showGameOver();
    this.saveGame();
  }

  private refreshFits(): void {
    for (let slot = 0; slot < this.session.tray.length; slot++) this.tray.setFits(slot, this.session.pieceFits(slot));
  }

  private place(drag: DragState, col: number, row: number): void {
    const outcome = this.session.place(drag.slot, col, row);
    if (!outcome) return;
    this.finishTutorial();
    const { layout } = this;

    for (const cell of outcome.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      this.particles.spawnPuff(center.x, center.y, this.theme.palettes[outcome.piece.colorIdx].base, 5);
    }
    if (!this.reduced()) this.flash.flash(0.08, 0.16);
    this.audio.playPlace();
    this.shake.add(this.reduced() ? 0 : 0.2);

    this.tray.remove(drag.slot);
    this.drag = null;
    this.board.clearGhost();
    this.board.clearPreview();
    this.syncBoard();

    this.presentClear(outcome);
    this.presentAwards(outcome);
    this.updateCombo();
    this.celebrations.celebrate(outcome.events);
    for (const kind of outcome.events) this.audio.announcer.announce(kind);

    if (outcome.next) {
      this.handleDeal(outcome.next);
    } else {
      this.refreshFits();
      if (outcome.gameOver) this.showGameOver();
      this.saveGame();
    }
  }

  private presentClear({ clear }: PlacementOutcome): void {
    if (!clear) return;
    const { layout } = this;
    this.themeChangeAt = performance.now() + THEME_CHANGE_DELAY_MS;
    this.effects.lineClear(clear, layout, this.hud.canvasWrapper, this.hud.pixiMount);
    if (!this.reduced()) this.flash.flash(0.08, clear.lines >= 3 ? 0.4 : 0.25, 0.35);
    this.haptics.lineClear();
    this.audio.playClear(clear.lines, clear.combo, this.reduced() ? 0 : CHARGE_TIME);
    // The announcer keeps the most important of these calls.
    const { announcer } = this.audio;
    announcer.announce('clear', clear.lines);
    const milestone = comboMilestone(clear.combo - clear.lines, clear.combo);
    if (milestone) announcer.announce('combo', milestone);
    const world = worldProgress(this.session.clearedLines).world;
    if (world > worldProgress(this.session.clearedLines - clear.lines).world) {
      announcer.announce((world - 1) % WORLDS.length === 0 ? 'eclipse' : 'world');
    }
    if (clear.allClear) announcer.announce('sweep', clear.allClearMultiplier);
    this.collectLines(clear.lines);
    this.shake.add(0.35 + clear.lines * 0.12 + Math.min(clear.combo, 15) * 0.012);

    const epicenter = cellsCentroid(layout, clear.cells);
    const fragments = Math.max(4, Math.floor(220 / clear.cells.length));
    for (const cell of clear.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      this.particles.spawnShatter(
        center.x,
        center.y,
        this.theme.palettes[cell.color],
        layout.cellSize,
        epicenter,
        fragments,
      );
    }
    if (clear.combo >= 2) this.hud.flashCombo();
    if (clear.lines >= 3) this.audio.playComboFanfare();
    if (clear.jewels) {
      if (clear.lines < 3) this.audio.playComboFanfare();
      for (const cell of clear.cells) {
        if (!cell.jewel) continue;
        const center = cellCenter(layout, cell.row, cell.col);
        this.particles.spawnPuff(center.x, center.y, 0xffd23f, 14);
      }
      this.texts.spawn(
        layout.viewWidth / 2,
        layout.gridY + layout.gridWidth / 2 - 40,
        t('float.gold', { points: clear.jewelPoints }),
        '#ffd23f',
        18,
        layout.viewWidth,
      );
    }
    if (clear.allClear) {
      this.audio.playComboFanfare();
      this.shake.add(0.5);
      this.texts.spawn(
        layout.viewWidth / 2,
        layout.gridY + layout.gridWidth / 2,
        t('float.boardClear', { multiplier: clear.allClearMultiplier }),
        '#ffd23f',
        18,
        layout.viewWidth,
      );
    }
  }

  private presentAwards(outcome: PlacementOutcome): void {
    const { layout } = this;
    const epicenter = outcome.clear ? cellsCentroid(layout, outcome.clear.cells) : null;
    for (const award of outcome.awards) {
      if (award.kind === 'placement' || !epicenter) {
        this.scoreAnimator.add(award.points);
      } else if (award.kind === 'clear') {
        this.scoreAnimator.add(award.points, this.toClient(epicenter), {
          combo: outcome.clear!.combo,
          delay: this.reduced() ? 0 : CHARGE_TIME,
        });
      } else {
        const centerY = layout.gridY + layout.gridWidth / 2;
        // Board clear and gold jewel bonuses fly in from opposite sides of the clear.
        const offset = (epicenter.y > centerY ? -84 : 84) * (award.kind === 'jewel' ? -0.6 : 1);
        const bonus = { x: layout.viewWidth / 2, y: epicenter.y + offset };
        this.scoreAnimator.add(award.points, this.toClient(bonus), {
          bonus: true,
          delay: award.kind === 'jewel' ? 0.2 : 0.32,
        });
      }
      if (award.levelUp) {
        const { level, gained } = award.levelUp;
        this.hud.celebrateLevelUp();
        this.audio.playComboFanfare();
        this.audio.announcer.announce('level', level);
        this.texts.spawn(
          layout.viewWidth / 2,
          layout.gridY + 35,
          t('float.levelUp', { level, count: gained }),
          '#00ff66',
          16,
          layout.viewWidth,
        );
      }
    }
    if (outcome.newRecord) {
      this.hud.setRecordGlow(true);
      this.audio.playNewRecord();
      this.audio.announcer.announce('record');
    }
    const { score, bestScore } = this.session;
    if (!this.nearRecordCalled && isNearRecord(score, bestScore)) {
      this.nearRecordCalled = true;
      this.audio.announcer.announce('near-record');
    }
    const gained = outcome.awards.reduce((sum, award) => sum + award.points, 0);
    if (score >= MILLION && score - gained < MILLION) this.audio.announcer.announce('million');
    this.saveBestScore();
    this.updateProgressionUI();
  }

  private saveBestScore(): void {
    this.session.bestScore = syncBestScore(this.storage, this.session.bestScore);
    this.hud.setBest(this.session.bestScore);
  }

  private updateProgressionUI(): void {
    this.updateWorldTheme();
    this.hud.setProgress(this.session.score, progression(this.session.score), this.session.revives);
  }

  /** Adds cleared lines to the world collection and announces worlds this unlocked. */
  private collectLines(lines: number): void {
    const unlocked = addLines(this.collection, lines, WORLDS.length);
    this.saveCollection();
    unlocked.forEach((index, order) =>
      setTimeout(
        () => {
          const { layout } = this;
          this.texts.spawn(
            layout.viewWidth / 2,
            layout.gridY + layout.gridWidth * 0.3,
            t('float.worldUnlocked', { world: WORLDS[index][0] }),
            WORLDS[index][1],
            14,
            layout.viewWidth,
          );
        },
        900 + order * 700,
      ),
    );
  }

  private showGameOver(): void {
    const { score, bestScore } = this.session;
    this.audio.playGameOver();
    const newRecord = score > 0 && score >= bestScore;
    this.audio.announcer.announce('over', newRecord ? 1 : 0);
    this.shake.add(0.4);
    if (newRecord) this.audio.playNewRecord();
    this.hud.showGameOver(score, bestScore, newRecord, this.gameOverHints(newRecord), this.gameOverStats());
  }

  /** The nearest goals, so a lost game already points at the next one. */
  private gameOverHints(newRecord: boolean): string[] {
    const { score, bestScore, level } = this.session;
    const hints: string[] = [];
    if (!newRecord && bestScore > 0 && score >= bestScore * RECORD_HINT_SHARE) {
      hints.push(t('gameOver.recordHint', { points: bestScore - score + 1 }));
    }
    const unlock = nextUnlock(this.collection, WORLDS.length);
    if (unlock) hints.push(t('gameOver.worldHint', { count: unlock.remaining, world: WORLDS[unlock.index][0] }));
    const next = progression(score);
    if (hints.length < 2 && next.progress >= LEVEL_HINT_PROGRESS) {
      hints.push(t('gameOver.levelHint', { points: next.next - score, level: level + 1 }));
    }
    return hints.slice(0, 2);
  }

  private gameOverStats(): [string, string][] {
    const { clearedLines, maxCombo, allClears } = this.session;
    const stats: [string, string][] = [
      [t('gameOver.statLines'), formatNumber(clearedLines)],
      [t('gameOver.statMaxCombo'), String(maxCombo)],
      [t('gameOver.statWorld'), String(Math.floor(clearedLines / LINES_PER_WORLD) + 1)],
    ];
    if (allClears) stats.push([t('gameOver.statClears'), String(allClears)]);
    return stats;
  }

  private revive(): void {
    this.audio.init();
    const outcome = this.session.revive();
    if (!outcome) return;
    this.hud.hideGameOver();
    pulse(this.hud.canvasWrapper, 'revive-return');
    this.audio.playRevive();
    this.audio.announcer.reset();
    this.audio.announcer.announce('revive', this.session.revives);
    this.shake.add(0.4);
    const { layout } = this;
    this.texts.spawn(
      layout.viewWidth / 2,
      layout.gridY + layout.gridWidth / 2 - 30,
      t('float.revived'),
      '#00ff66',
      20,
      layout.viewWidth,
    );
    this.handleDeal(outcome);
    this.tray.playEntrance(layout, this.reduced());
    this.updateProgressionUI();
    this.saveGame();
  }

  private finishRecovery(accepted: boolean): void {
    const combo = this.session.combo;
    const result = this.session.resolveRecovery(accepted);
    if (!result) return;
    if (result.saved) {
      this.audio.playRevive();
      this.audio.announcer.announce('rescue');
      this.texts.spawn(
        this.layout.viewWidth / 2,
        this.layout.gridY + 40,
        t('float.comboSaved', { combo }),
        '#00f5ff',
        16,
        this.layout.viewWidth,
      );
    }
    this.hud.closeRecovery();
    this.handleDeal(result.outcome);
    this.updateProgressionUI();
  }

  private toClient(point: Point): Point {
    const rect = (this.canvasRect ??= this.app.view.getBoundingClientRect());
    return {
      x: rect.left + (point.x * rect.width) / this.layout.viewWidth,
      y: rect.top + (point.y * rect.height) / this.layout.viewHeight,
    };
  }

  // --- Input ----------------------------------------------------------------

  private bindControls(): void {
    const { audio } = this;
    const music = new BackgroundMusic(audio, this.storage);
    document.addEventListener('visibilitychange', () => music.tick());
    window.addEventListener('pagehide', () => music.suspend());
    window.addEventListener('pageshow', event => {
      if (event.persisted) music.resume();
    });
    // Another window of the game set a new record.
    window.addEventListener('storage', event => {
      if (event.key === STORAGE_KEYS.bestScore) this.saveBestScore();
    });

    new OptionsMenu({
      soundMuted: () => audio.isMuted,
      toggleSound: () => {
        const muted = audio.toggleMute();
        if (!muted) audio.playPickup();
        return muted;
      },
      musicEnabled: () => music.enabled,
      toggleMusic: () => {
        audio.init();
        return music.toggle();
      },
      vibrationEnabled: () => this.haptics.enabled,
      toggleVibration: () => {
        const enabled = this.haptics.toggle();
        if (enabled) this.haptics.lineClear();
        return enabled;
      },
      resized: () => this.resize(),
    });
    this.effects.bindToggle(document.getElementById('btn-effects')!);
    new WorldGallery(
      {
        collection: () => this.collection,
        choose: index => {
          chooseStart(this.collection, index);
          this.saveCollection();
          // A game that has not cleared anything yet switches right away.
          const { session } = this;
          if (session.clearedLines > 0 || session.isGameOver) return false;
          this.worldOrder = extendWorldOrder([], 1, Math.random, index);
          this.updateWorldTheme(true);
          this.saveGame();
          return true;
        },
        opened: () => {
          if (!this.collection.fresh.length) return;
          this.collection.fresh = [];
          this.saveCollection();
        },
      },
      [
        this.hud.worldButton,
        document.getElementById('btn-options-worlds')!,
        document.getElementById('btn-over-worlds')!,
      ],
    );
    new RestartConfirm(() => {
      audio.init();
      this.startNewGame();
    });

    document.getElementById('btn-play-again')!.addEventListener('click', () => {
      audio.init();
      this.startNewGame();
    });
    this.hud.reviveButton.addEventListener('click', () => this.revive());
    document.getElementById('btn-recover-streak')!.addEventListener('click', () => this.finishRecovery(true));
    document.getElementById('btn-skip-recovery')!.addEventListener('click', () => this.finishRecovery(false));
    this.hud.recoveryDialog.addEventListener('cancel', event => {
      event.preventDefault();
      this.finishRecovery(false);
    });

    // Touch pointerdown can precede Chrome's user activation. Retry from
    // native touchend/click events, including after returning to the app.
    document.addEventListener('touchend', () => audio.init(), { passive: true });
    document.addEventListener('click', () => audio.init());

    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', event => this.onPointerDown(event));
    stage.on('pointermove', event => this.onPointerMove(event));
    stage.on('pointerup', () => this.onPointerUp());
    stage.on('pointerupoutside', () => this.onPointerUp());
  }

  private onPointerDown(event: FederatedPointerEvent): void {
    if (this.session.isGameOver || this.drag) return;
    this.hand.hide();
    this.audio.init();
    const pointer = { x: event.global.x, y: event.global.y };
    const slot = hitTestTray(this.layout, this.tray.bounds(this.layout), pointer, event.pointerType === 'touch');
    if (slot === null) return;
    const view = this.tray.beginDrag(slot, this.dragLayer);
    if (!view) return;
    this.drag = { slot, view, pointer, target: null, preview: NO_LINES, cell: '' };
    this.audio.playPickup();
    this.updateDrag();
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (!this.drag) return;
    this.drag.pointer = { x: event.global.x, y: event.global.y };
    this.updateDrag();
  }

  private onPointerUp(): void {
    const drag = this.drag;
    if (!drag) return;
    if (drag.target) {
      this.place(drag, drag.target.col, drag.target.row);
      return;
    }
    this.audio.playCancel();
    this.tray.returnToTray(drag.view, this.layout);
    this.drag = null;
    this.board.clearGhost();
    this.board.clearPreview();
  }

  private updateDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    const { piece } = drag.view;
    const placement = dragPlacement(this.layout, drag.pointer, piece.width, piece.height, drag.view.scale);
    this.tray.moveDragged(drag.view, placement.visual.x, placement.visual.y, this.layout);
    // Pointer moves inside the same cell change nothing on the board.
    const cell = `${placement.col}:${placement.row}`;
    if (cell === drag.cell) return;
    drag.cell = cell;
    if (this.session.canPlace(drag.slot, placement.col, placement.row)) {
      drag.target = { col: placement.col, row: placement.row };
      drag.preview = predictClears(this.session.grid, piece.matrix, placement.col, placement.row);
      this.board.showGhost(piece.matrix, piece.colorIdx, placement.col, placement.row, this.layout);
    } else {
      drag.target = null;
      drag.preview = NO_LINES;
      this.board.clearGhost();
    }
    this.drawClearPreview();
  }

  /** Draws the predicted clear once; the frame loop only pulses its opacity. */
  private drawClearPreview(): void {
    const lines = this.drag?.preview ?? NO_LINES;
    if (!lines.rows.length && !lines.cols.length) {
      this.board.clearPreview();
      return;
    }
    const color = this.theme.palettes[this.drag?.view.piece.colorIdx ?? 0].hi;
    this.board.drawClearPreview(lines, this.layout, color, 1);
    this.pulseClearPreview();
  }

  private pulseClearPreview(): void {
    this.board.preview.alpha = this.reduced() ? 0.13 : 0.13 + Math.sin(performance.now() * 0.006) * 0.035;
  }

  // --- Frame loop -------------------------------------------------------------

  private update(dt: number): void {
    this.updateWorldTheme();
    this.scoreAnimator.update(dt);
    this.effects.updateComboMood(this.hud.canvasWrapper, this.session.combo);
    if (this.reduced()) this.shake.reset();
    const offset = this.shake.update(dt);
    this.root.position.set(offset.x, offset.y);
    this.tray.update(dt, this.layout);
    this.particles.update(dt);
    this.texts.update(dt);
    this.flash.update(dt);
    // Pulse the clear prediction while a piece hovers.
    if (this.drag?.preview.rows.length || this.drag?.preview.cols.length) this.pulseClearPreview();
  }
}
