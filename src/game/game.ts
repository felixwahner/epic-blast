// Wires the pure GameSession to Pixi rendering, audio, haptics and the DOM HUD.
// Rules live in core/session.ts; this file only turns their outcomes into feedback.
import { Application, Assets, Container, Graphics, Rectangle, Texture, type FederatedPointerEvent } from 'pixi.js';
import stoneReferenceURL from '../assets/images/neon-jewel.png?url';
import boardMaterialURL from '../assets/images/board-materials.png?url';
import { RoundPredictor } from '../ai/round-predictor.ts';
import type { AudioEngine } from '../audio/audio-engine.ts';
import { BackgroundMusic } from '../audio/music.ts';
import { predictClears, type FullLines } from '../core/board.ts';
import { progression, worldProgress } from '../core/progression.ts';
import { GameSession, type DealOutcome, type PlacementOutcome } from '../core/session.ts';
import { showInterstitialAd, listenForAdEvents } from '../platform/ads.ts';
import { Haptics } from '../platform/haptics.ts';
import { STORAGE_KEYS, readNumber, safeStorage, syncBestScore, type KeyValueStore } from '../platform/storage.ts';
import { BlockTextures } from '../render/block-textures.ts';
import { BoardView } from '../render/board-view.ts';
import { CHARGE_TIME } from '../render/clear-animation.ts';
import { dragPlacement, hitTestTray, type Point } from '../render/drag.ts';
import { FloatingTexts } from '../render/floating-text.ts';
import { cellCenter, cellsCentroid, computeLayout, emptyLayout, type Layout } from '../render/layout.ts';
import { ParticleSystem } from '../render/particles.ts';
import { ScreenShake } from '../render/screen-shake.ts';
import { TrayView, type PieceView } from '../render/tray-view.ts';
import { themeFor, type Theme } from '../theme/themes.ts';
import { Celebrations } from '../ui/celebrations.ts';
import { VisualEffects, pulse } from '../ui/effects.ts';
import { Hud } from '../ui/hud.ts';
import { OptionsMenu } from '../ui/options-menu.ts';
import { RestartConfirm } from '../ui/restart-confirm.ts';
import { createScoreAnimator, type ScoreAnimator } from '../ui/score-animator.ts';
import { applyTheme } from '../ui/theme-dom.ts';

/** Delay before the world theme may change after a clear, so the explosion reads first. */
const THEME_CHANGE_DELAY_MS = 1100;
const NO_LINES: FullLines = { rows: [], cols: [] };

interface DragState {
  slot: number;
  view: PieceView;
  pointer: Point;
  target: { col: number; row: number } | null;
  preview: FullLines;
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
  private boardMaterials: Texture[][] = [];
  private drag: DragState | null = null;

  constructor({ audio, storage = safeStorage }: GameOptions) {
    this.audio = audio;
    this.storage = storage;
    this.effects = new VisualEffects(storage);
    this.haptics = new Haptics(storage);
    this.session = new GameSession({ bestScore: readNumber(storage, STORAGE_KEYS.bestScore) });
    this.celebrations = new Celebrations(this.hud.canvasWrapper);
    this.scoreAnimator = createScoreAnimator(this.hud.score, { host: this.hud.container, reducedMotion: this.reduced });
    this.hud.setBest(this.session.bestScore);

    const rect = this.hud.pixiMount.getBoundingClientRect();
    this.app = new Application<HTMLCanvasElement>({
      width: Math.max(300, Math.floor(rect.width)),
      height: Math.max(400, Math.floor(rect.height)),
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
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
      this.board.background, this.board.materialLayer, this.board.blocks, this.board.ghosts, this.board.preview,
      this.trayBackdrop, this.tray.container, this.dragLayer, particleLayer, textLayer,
    );
  }

  start(): void {
    this.loadAssets();
    this.bindControls();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.startNewGame();
    this.app.ticker.add(delta => this.update(delta / 60));
  }

  // --- Assets & theme -------------------------------------------------------

  private loadAssets(): void {
    Assets.load<Texture>(stoneReferenceURL).then(texture => {
      this.referenceStone = texture;
      this.updateWorldTheme(true);
    }).catch(error => console.warn('Reference stone load failed:', error));

    Assets.load<Texture>(boardMaterialURL).then(atlas => {
      const width = atlas.width / 3, height = atlas.height / 3;
      // Sample distinct interiors from the source's seven-by-seven material cells per world.
      this.boardMaterials = Array.from({ length: 9 }, (_, index) => {
        const variants: Texture[] = [];
        for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
          variants.push(new Texture(atlas.baseTexture, new Rectangle(
            Math.floor(index % 3 * width + width * (0.045 + col * 0.135)),
            Math.floor(Math.floor(index / 3) * height + height * (0.045 + row * 0.135)),
            Math.floor(width * 0.075), Math.floor(height * 0.075))));
        }
        return variants;
      });
      this.renderBoardBackground();
    }).catch(error => console.warn('Board material load failed:', error));
  }

  private updateWorldTheme(force = false): void {
    if (!force && performance.now() < this.themeChangeAt) return;
    const world = worldProgress(this.session.clearedLines);
    const next = themeFor(world.world, world.progress);
    if (!force && this.themeApplied && next.key === this.theme.key) return;

    const previousName = this.theme.name;
    this.theme = next;
    this.themeApplied = true;
    if (previousName !== next.name && this.session.clearedLines > 0) {
      this.texts.spawn(this.layout.viewWidth / 2, this.layout.gridY + 50, next.name, next.primary, 18, this.layout.viewWidth);
    }
    applyTheme(next, this.hud.container, this.hud.worldLabel);
    const disposeOld = this.textures.rebuild(next.palettes, next.material, this.referenceStone);
    this.renderBoardBackground();
    this.board.syncBlocks(this.session.grid, this.layout);
    this.tray.retexture();
    this.board.retextureGhosts();
    disposeOld();
  }

  private renderBoardBackground(): void {
    this.board.renderBackground(this.layout, this.theme.palettes, this.theme, this.boardMaterials[this.theme.index]);
  }

  // --- Layout ---------------------------------------------------------------

  private resize(): void {
    const rect = this.hud.pixiMount.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.app.renderer.resize(Math.floor(rect.width), Math.floor(rect.height));
    const layout = this.layout = computeLayout(rect.width, rect.height);
    this.hud.positionComboBox(layout);
    this.trayBackdrop.clear();
    this.trayBackdrop.beginFill(0x080714, 0.78);
    this.trayBackdrop.drawRoundedRect(layout.gridX, layout.trayY - 4, layout.gridWidth, Math.min(layout.trayHeight + 8, layout.viewHeight - layout.trayY), 12);
    this.trayBackdrop.endFill();
    this.renderBoardBackground();
    this.board.syncBlocks(this.session.grid, layout);
    this.tray.relayout(layout);
    this.scoreAnimator.resize();
  }

  // --- Game flow ------------------------------------------------------------

  private startNewGame(): void {
    this.audio.announcer.reset();
    this.themeChangeAt = 0;
    this.hud.closeRecovery();
    this.celebrations.reset();
    const outcome = this.session.start();

    this.scoreAnimator.reset();
    this.effects.updateComboMood(this.hud.canvasWrapper, 0);
    this.hud.setRecordGlow(false);
    this.shake.reset();
    this.drag = null;
    this.board.clearGhost();
    this.board.clearPreview();
    this.particles.clear();
    this.texts.clear();
    this.hud.setCombo(0);
    this.hud.hideGameOver();
    this.board.syncBlocks(this.session.grid, this.layout);
    this.updateProgressionUI();
    this.handleDeal(outcome);
  }

  private handleDeal(outcome: DealOutcome): void {
    if (outcome.kind === 'recovery-offer') {
      this.hud.offerRecovery(outcome.combo, outcome.revives);
      return;
    }
    this.hud.setCombo(this.session.combo);
    this.tray.setPieces(outcome.pieces, this.layout);
    this.predictor.start(outcome.roundId, this.session.encodedGrid(), this.session.tray.map(p => (p ? { matrix: p.matrix } : null)),
      (id, result) => this.session.setRoundBest(id, result));
    this.refreshFits();
    if (outcome.gameOver) this.showGameOver();
  }

  private refreshFits(): void {
    for (let slot = 0; slot < this.session.tray.length; slot++) this.tray.setFits(slot, this.session.pieceFits(slot));
  }

  private place(drag: DragState, col: number, row: number): void {
    const outcome = this.session.place(drag.slot, col, row);
    if (!outcome) return;
    const { layout } = this;

    for (const cell of outcome.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      this.particles.spawnPuff(center.x, center.y, this.theme.palettes[outcome.piece.colorIdx].base, 5);
    }
    pulse(this.hud.pixiMount, 'piece-land');
    this.audio.playPlace();
    this.shake.add(this.reduced() ? 0 : 0.2);

    this.tray.remove(drag.slot);
    this.drag = null;
    this.board.clearGhost();
    this.board.clearPreview();
    this.board.syncBlocks(this.session.grid, layout);

    this.presentClear(outcome);
    this.presentAwards(outcome);
    this.hud.setCombo(this.session.combo);
    this.celebrations.celebrate(outcome.events);

    if (outcome.next) {
      this.handleDeal(outcome.next);
    } else {
      this.refreshFits();
      if (outcome.gameOver) this.showGameOver();
    }
  }

  private presentClear({ clear }: PlacementOutcome): void {
    if (!clear) return;
    const { layout } = this;
    this.themeChangeAt = performance.now() + THEME_CHANGE_DELAY_MS;
    this.effects.lineClear(clear, layout, this.hud.canvasWrapper, this.hud.pixiMount);
    this.haptics.lineClear();
    this.audio.playClear(clear.lines, clear.combo, this.reduced() ? 0 : CHARGE_TIME);
    if ([5, 10].includes(clear.combo) || (clear.combo > 10 && clear.combo % 10 === 0)) {
      this.audio.announcer.announce('combo', clear.combo);
    } else if (clear.lines >= 3) {
      this.audio.announcer.announce('clear', clear.lines);
    }
    this.shake.add(0.35 + clear.lines * 0.12 + Math.min(clear.combo, 15) * 0.012);

    const epicenter = cellsCentroid(layout, clear.cells);
    const fragments = Math.max(4, Math.floor(220 / clear.cells.length));
    for (const cell of clear.cells) {
      const center = cellCenter(layout, cell.row, cell.col);
      this.particles.spawnShatter(center.x, center.y, this.theme.palettes[cell.color], layout.cellSize, epicenter, fragments);
    }
    if (clear.combo >= 2) this.hud.flashCombo();
    if (clear.lines >= 3) this.audio.playComboFanfare();
    if (clear.allClear) {
      this.audio.playComboFanfare();
      this.shake.add(0.5);
    }
  }

  private presentAwards(outcome: PlacementOutcome): void {
    const { layout } = this;
    const epicenter = outcome.clear ? cellsCentroid(layout, outcome.clear.cells) : null;
    for (const award of outcome.awards) {
      if (award.kind === 'placement' || !epicenter) {
        this.scoreAnimator.add(award.points);
      } else if (award.kind === 'clear') {
        this.scoreAnimator.add(award.points, this.toClient(epicenter), { combo: outcome.clear!.combo, delay: this.reduced() ? 0 : CHARGE_TIME });
      } else {
        const centerY = layout.gridY + layout.gridWidth / 2;
        const bonus = { x: layout.viewWidth / 2, y: epicenter.y + (epicenter.y > centerY ? -84 : 84) };
        this.scoreAnimator.add(award.points, this.toClient(bonus), { bonus: true, delay: 0.32 });
      }
      if (award.levelUp) {
        const { level, gained } = award.levelUp;
        this.hud.celebrateLevelUp();
        this.audio.playComboFanfare();
        this.audio.announcer.announce('level', level);
        this.texts.spawn(layout.viewWidth / 2, layout.gridY + 35, `LEVEL ${level}! +${gained} REVIVE`, '#00ff66', 16, layout.viewWidth);
      }
    }
    if (outcome.newRecord) {
      this.hud.setRecordGlow(true);
      this.audio.playNewRecord();
      this.audio.announcer.announce('record');
    }
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

  private showGameOver(): void {
    const { score, bestScore } = this.session;
    this.audio.playGameOver();
    this.audio.announcer.announce('over');
    this.shake.add(0.4);
    const newRecord = score > 0 && score >= bestScore;
    if (newRecord) this.audio.playNewRecord();
    this.hud.showGameOver(score, bestScore, newRecord);
  }

  private revive(): void {
    this.audio.init();
    const outcome = this.session.revive();
    if (!outcome) return;
    this.hud.hideGameOver();
    pulse(this.hud.canvasWrapper, 'revive-return');
    this.audio.playRevive();
    this.audio.announcer.reset();
    this.audio.announcer.announce('revive');
    this.shake.add(0.4);
    const { layout } = this;
    this.texts.spawn(layout.viewWidth / 2, layout.gridY + layout.gridWidth / 2 - 30, '✨ REVIVED! ✨', '#00ff66', 20, layout.viewWidth);
    this.handleDeal(outcome);
    this.tray.playEntrance(layout, this.reduced());
    this.updateProgressionUI();
  }

  private finishRecovery(accepted: boolean): void {
    const combo = this.session.combo;
    const result = this.session.resolveRecovery(accepted);
    if (!result) return;
    if (result.saved) {
      this.audio.playRevive();
      this.audio.announcer.announce('revive');
      this.texts.spawn(this.layout.viewWidth / 2, this.layout.gridY + 40, `COMBO ${combo} GERETTET!`, '#00f5ff', 16, this.layout.viewWidth);
    }
    this.hud.closeRecovery();
    this.handleDeal(result.outcome);
    this.updateProgressionUI();
  }

  private toClient(point: Point): Point {
    const rect = this.app.view.getBoundingClientRect();
    return {
      x: rect.left + point.x * rect.width / this.layout.viewWidth,
      y: rect.top + point.y * rect.height / this.layout.viewHeight,
    };
  }

  // --- Input ----------------------------------------------------------------

  private bindControls(): void {
    const { audio } = this;
    const music = new BackgroundMusic(audio, this.storage);
    document.addEventListener('visibilitychange', () => music.tick());
    window.addEventListener('pagehide', () => music.suspend());
    window.addEventListener('pageshow', event => { if (event.persisted) music.resume(); });
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
      toggleMusic: () => { audio.init(); return music.toggle(); },
      vibrationEnabled: () => this.haptics.enabled,
      toggleVibration: () => {
        const enabled = this.haptics.toggle();
        if (enabled) this.haptics.lineClear();
        return enabled;
      },
      resized: () => this.resize(),
    });
    this.effects.bindToggle(document.getElementById('btn-effects')!);
    new RestartConfirm(() => {
      audio.init();
      showInterstitialAd(() => this.startNewGame());
    });

    document.getElementById('btn-play-again')!.addEventListener('click', () => {
      audio.init();
      showInterstitialAd(() => this.startNewGame());
    });
    this.hud.reviveButton.addEventListener('click', () => this.revive());
    document.getElementById('btn-recover-streak')!.addEventListener('click', () => this.finishRecovery(true));
    document.getElementById('btn-skip-recovery')!.addEventListener('click', () => this.finishRecovery(false));
    this.hud.recoveryDialog.addEventListener('cancel', event => { event.preventDefault(); this.finishRecovery(false); });

    listenForAdEvents({
      pause: () => { this.app.ticker.stop(); audio.setMutedByAd(true); },
      resume: () => { this.app.ticker.start(); audio.setMutedByAd(false); },
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
    this.audio.init();
    const pointer = { x: event.global.x, y: event.global.y };
    const slot = hitTestTray(this.layout, this.tray.bounds(this.layout), pointer, event.pointerType === 'touch');
    if (slot === null) return;
    const view = this.tray.beginDrag(slot, this.dragLayer);
    if (!view) return;
    this.drag = { slot, view, pointer, target: null, preview: NO_LINES };
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

  private drawClearPreview(): void {
    const lines = this.drag?.preview ?? NO_LINES;
    if (!lines.rows.length && !lines.cols.length) {
      this.board.clearPreview();
      return;
    }
    const intensity = this.reduced() ? 0.13 : 0.13 + Math.sin(performance.now() * 0.006) * 0.035;
    const color = this.theme.palettes[this.drag?.view.piece.colorIdx ?? 0].hi;
    this.board.drawClearPreview(lines, this.layout, color, intensity);
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
    // Pulse the clear prediction while a piece hovers.
    if (this.drag?.preview.rows.length || this.drag?.preview.cols.length) this.drawClearPreview();
  }
}
