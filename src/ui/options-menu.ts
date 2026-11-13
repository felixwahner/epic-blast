// The pause menu: the current run at a glance, resume, new game, worlds and the
// settings tiles (sound, music, vibration, effects, fullscreen, sound world).
import { formatNumber, t } from '../i18n/index.ts';
import { byId } from './hud.ts';
import { setTile } from './menu-tile.ts';

export interface RunStatus {
  score: number;
  best: number;
  level: number;
}

export interface OptionsHandlers {
  toggleSound(): boolean;
  /** Switches to the next sound world and returns its label. */
  cycleSoundWorld(): string;
  soundWorldLabel(): string;
  toggleMusic(): boolean;
  musicEnabled(): boolean;
  toggleVibration(): boolean;
  vibrationEnabled(): boolean;
  soundMuted(): boolean;
  /** The run shown in the menu header each time it opens. */
  status(): RunStatus;
  /** Called after fullscreen changes so the canvas can re-measure. */
  resized(): void;
}

export class OptionsMenu {
  readonly dialog = byId<HTMLDialogElement>('options-menu');
  private readonly soundButton = byId('btn-sound');
  private readonly soundWorldButton = byId('btn-sound-world');
  private readonly musicButton = byId('btn-music');
  private readonly vibrationButton = byId('btn-vibration');
  private readonly fullscreenButton = byId('btn-fullscreen');
  private readonly handlers: OptionsHandlers;

  constructor(handlers: OptionsHandlers) {
    this.handlers = handlers;
    byId('btn-options').addEventListener('click', () => this.open());
    byId('btn-close-options').addEventListener('click', () => this.dialog.close());
    byId('btn-resume').addEventListener('click', () => this.dialog.close());
    // Close when clicking the backdrop outside the dialog box.
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        this.dialog.close();
    });

    this.syncSound();
    this.soundButton.addEventListener('click', () => {
      handlers.toggleSound();
      this.syncSound();
    });

    this.soundWorldButton.querySelector('.tile-state')!.textContent = handlers.soundWorldLabel();
    this.soundWorldButton.addEventListener('click', () => {
      this.soundWorldButton.querySelector('.tile-state')!.textContent = handlers.cycleSoundWorld();
    });

    this.syncMusic();
    this.musicButton.addEventListener('click', () => {
      handlers.toggleMusic();
      this.syncMusic();
    });

    this.syncVibration();
    this.vibrationButton.addEventListener('click', () => {
      handlers.toggleVibration();
      this.syncVibration();
    });

    this.bindFullscreen();
  }

  open(): void {
    this.syncHeader();
    if (!this.dialog.open) this.dialog.showModal();
  }

  /** World name, collection progress and the run's numbers, read when the menu opens. */
  private syncHeader(): void {
    const { score, best, level } = this.handlers.status();
    byId('menu-world-name').textContent = byId('world-name').textContent;
    byId('menu-world-progress').textContent = t('options.worldProgress', {
      progress: byId('world-count').textContent ?? '',
    });
    byId('menu-score').textContent = formatNumber(score);
    byId('menu-level').textContent = formatNumber(level);
    byId('menu-best').textContent = formatNumber(Math.max(best, score));
  }

  private syncSound(): void {
    const on = !this.handlers.soundMuted();
    setTile(this.soundButton, on, on ? t('options.on') : t('options.off'));
  }

  private syncMusic(): void {
    const on = this.handlers.musicEnabled();
    setTile(this.musicButton, on, on ? t('options.on') : t('options.off'));
  }

  private syncVibration(): void {
    const on = this.handlers.vibrationEnabled();
    setTile(this.vibrationButton, on, on ? t('options.on') : t('options.off'));
  }

  private bindFullscreen(): void {
    const button = this.fullscreenButton;
    button.hidden = !document.fullscreenEnabled;
    const sync = () => {
      const active = Boolean(document.fullscreenElement);
      setTile(button, active, active ? t('options.on') : t('options.off'));
    };
    sync();
    document.addEventListener('fullscreenchange', () => {
      sync();
      requestAnimationFrame(() => this.handlers.resized());
    });
    button.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (error) {
        console.warn('Fullscreen request failed:', error);
        button.title = t('options.fullscreenFailed');
      }
    });
  }
}
