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
  readonly worldLabel = byId('world-label');

  private readonly best = byId('best-score-display');
  private readonly combo = byId('combo-display');
  private readonly comboBox = byId('combo-box');
  private readonly levelStatus = document.querySelector<HTMLElement>('.level-status');
  private readonly levelLabel = byId('level-label');
  private readonly levelTarget = byId('level-target');
  private readonly levelProgress = byId<HTMLProgressElement>('level-progress');
  private readonly reviveCount = byId('revive-count');
  private readonly gameOverModal = byId('game-over-modal');
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

  showGameOver(score: number, best: number, newRecord: boolean, delayMs = 450): void {
    this.finalScore.textContent = String(score);
    this.finalBest.textContent = String(best);
    this.newRecordBadge.classList.toggle('hidden', !newRecord);
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
