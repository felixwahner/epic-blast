// DOM heads-up display: scores, combo, level/revive status, game-over modal
// and the combo recovery dialog.
import type { LevelProgress } from '../core/progression.ts';
import { TRAY_LABEL_HEIGHT, type Layout } from '../render/layout.ts';
import { pulse } from './effects.ts';

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element as T;
}

export class Hud {
  readonly container = byId('game-container');
  readonly canvasWrapper = byId('canvas-wrapper');
  readonly pixiMount = byId('pixi-view');
  readonly score = byId('score-display');
  readonly worldLabel = byId('world-name');
  readonly worldButton = byId<HTMLButtonElement>('world-label');

  private readonly best = byId('best-score-display');
  private readonly combo = byId('combo-display');
  private readonly comboFuse = byId('combo-fuse');
  private readonly worldCount = byId('world-count');
  private readonly overWorldsButton = byId('btn-over-worlds');
  private readonly gameOverHints = byId('game-over-hints');
  private readonly gameOverStats = byId('game-over-stats');
  private readonly comboBox = byId('combo-box');
  private readonly levelStatus = document.querySelector<HTMLElement>('.level-status');
  private readonly levelLabel = byId('level-label');
  private readonly levelTarget = byId('level-target');
  private readonly levelProgress = byId<HTMLProgressElement>('level-progress');
  private readonly reviveCount = byId('revive-count');
  private readonly gameOverModal = byId('game-over-modal');
  private readonly header = byId('game-header');
  private readonly finalScore = byId('final-score');
  private readonly finalBest = byId('final-best');
  private readonly newRecordBadge = byId('new-record-badge');
  readonly reviveButton = byId<HTMLButtonElement>('btn-revive');
  readonly recoveryDialog = byId<HTMLDialogElement>('streak-recovery');
  private readonly recoveryMessage = byId('recovery-message');
  private gameOverTimer: ReturnType<typeof setTimeout> | undefined;

  setBest(value: number): void {
    this.best.textContent = String(value);
  }

  setRecordGlow(on: boolean): void {
    this.best.classList.toggle('record-glow', on);
  }

  setCombo(value: number): void {
    this.combo.textContent = String(value);
  }

  /**
   * Shows how safe the running combo is: all pips lit once this round has a
   * clear, otherwise one pip per piece still left to clear a line with.
   */
  setComboFuse(combo: number, safe: boolean, piecesLeft: number): void {
    this.comboFuse.hidden = combo === 0;
    this.comboFuse.classList.toggle('safe', safe);
    this.comboFuse.classList.toggle('last', !safe && piecesLeft === 1);
    const lit = safe ? 3 : piecesLeft;
    [...this.comboFuse.children].forEach((pip, index) => pip.classList.toggle('lit', index < lit));
    this.comboFuse.title = safe
      ? 'Kombo gesichert: in dieser Runde wurde schon geräumt'
      : `Noch ${piecesLeft} ${piecesLeft === 1 ? 'Stück' : 'Stücke'}, um die Kombo zu halten`;
  }

  /** World collection progress beside the world name; `fresh` marks unseen unlocks. */
  setWorldCount(unlocked: number, total: number, fresh: boolean): void {
    this.worldCount.textContent = `${unlocked}/${total}`;
    this.worldButton.classList.toggle('has-fresh', fresh);
    this.overWorldsButton.textContent = `WELTEN ${unlocked}/${total}`;
    this.overWorldsButton.classList.toggle('has-fresh', fresh);
  }

  flashCombo(): void {
    pulse(this.comboBox, 'highlight');
  }

  /** Keeps the combo label aligned with the top edge of the tray. */
  positionComboBox(layout: Layout): void {
    Object.assign(this.comboBox.style, {
      left: `${layout.gridX}px`, top: `${layout.trayY - 2}px`,
      width: `${layout.gridWidth}px`, height: `${TRAY_LABEL_HEIGHT}px`,
    });
  }

  /** Exposes the board's left and right edges so the header and scores line up with them. */
  alignHeader(layout: Layout): void {
    const header = this.header.getBoundingClientRect();
    const view = this.pixiMount.getBoundingClientRect();
    // The board's lit rim is drawn 2-3px outside the grid itself.
    const rim = 3;
    const left = view.left + layout.gridX - rim - header.left;
    const right = header.right - (view.left + layout.gridX + layout.gridWidth + rim);
    const container = this.header.parentElement!.style;
    container.setProperty('--board-left', `${Math.max(0, left)}px`);
    container.setProperty('--board-right', `${Math.max(0, right)}px`);
  }

  setProgress(score: number, state: LevelProgress, revives: number): void {
    this.levelLabel.textContent = `LEVEL ${state.level}`;
    this.levelTarget.textContent = `${score.toLocaleString()} / ${state.next.toLocaleString()} · +1 REVIVE`;
    this.levelProgress.value = state.progress;
    this.reviveCount.textContent = `REVIVES: ${revives}`;
    this.reviveButton.textContent = `REVIVE (${revives})`;
    this.reviveButton.hidden = revives === 0;
    this.reviveButton.title = 'Einen Revive einsetzen und weiterspielen';
  }

  celebrateLevelUp(): void {
    pulse(this.levelStatus, 'level-up');
    pulse(this.reviveCount, 'reward-flight');
  }

  /** `hints` name the nearest goals; `stats` are label/value pairs of the finished game. */
  showGameOver(score: number, best: number, newRecord: boolean, hints: readonly string[] = [], stats: readonly (readonly [string, string])[] = [], delayMs = 450): void {
    this.finalScore.textContent = String(score);
    this.finalBest.textContent = String(best);
    this.newRecordBadge.classList.toggle('hidden', !newRecord);
    this.gameOverHints.replaceChildren(...hints.map(hint => Object.assign(document.createElement('li'), { textContent: hint })));
    this.gameOverHints.hidden = hints.length === 0;
    this.gameOverStats.replaceChildren(...stats.map(([label, value]) => {
      const item = document.createElement('div');
      item.append(Object.assign(document.createElement('dt'), { textContent: label }), Object.assign(document.createElement('dd'), { textContent: value }));
      return item;
    }));
    clearTimeout(this.gameOverTimer);
    this.gameOverTimer = setTimeout(() => this.gameOverModal.classList.remove('hidden'), delayMs);
  }

  hideGameOver(): void {
    clearTimeout(this.gameOverTimer);
    this.gameOverModal.classList.add('hidden');
    this.newRecordBadge.classList.add('hidden');
  }

  offerRecovery(combo: number, revives: number): void {
    this.recoveryMessage.textContent = `Kombo ${combo} retten? Tausche einen deiner ${revives} Revives und übernimm die Kombo in die nächste Runde.`;
    this.recoveryDialog.showModal();
  }

  closeRecovery(): void {
    if (this.recoveryDialog.open) this.recoveryDialog.close();
  }
}
