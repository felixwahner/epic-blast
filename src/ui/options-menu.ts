// The options dialog: sound, sound world, music, vibration, effects and fullscreen.
import { byId } from './hud.ts';

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
  /** Called after fullscreen changes so the canvas can re-measure. */
  resized(): void;
}

export class OptionsMenu {
  readonly dialog = byId<HTMLDialogElement>('options-menu');
  readonly effectsButton = byId('btn-effects');
  private readonly soundButton = byId('btn-sound');
  private readonly soundWorldButton = byId('btn-sound-world');
  private readonly musicButton = byId('btn-music');
  private readonly vibrationButton = byId('btn-vibration');
  private readonly fullscreenButton = byId('btn-fullscreen');
  private readonly handlers: OptionsHandlers;

  constructor(handlers: OptionsHandlers) {
    this.handlers = handlers;
    byId('btn-options').addEventListener('click', () => this.dialog.showModal());
    byId('btn-close-options').addEventListener('click', () => this.dialog.close());
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

    this.soundWorldButton.textContent = handlers.soundWorldLabel();
    this.soundWorldButton.addEventListener('click', () => {
      this.soundWorldButton.textContent = handlers.cycleSoundWorld();
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

  private syncSound(): void {
    this.soundButton.textContent = this.handlers.soundMuted() ? '🔇' : '🔊';
  }

  private syncMusic(): void {
    const enabled = this.handlers.musicEnabled();
    this.musicButton.textContent = enabled ? 'AN' : 'AUS';
    this.musicButton.setAttribute('aria-pressed', String(enabled));
  }

  private syncVibration(): void {
    const enabled = this.handlers.vibrationEnabled();
    const label = enabled ? 'Vibration ausschalten' : 'Vibration einschalten';
    this.vibrationButton.setAttribute('aria-pressed', String(enabled));
    this.vibrationButton.setAttribute('aria-label', label);
    this.vibrationButton.title = label;
    this.vibrationButton.classList.toggle('vibration-off', !enabled);
  }

  private bindFullscreen(): void {
    const button = this.fullscreenButton;
    byId('fullscreen-option').hidden = !document.fullscreenEnabled;
    document.addEventListener('fullscreenchange', () => {
      const active = Boolean(document.fullscreenElement);
      const label = active ? 'Vollbild beenden' : 'Vollbild aktivieren';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(active));
      requestAnimationFrame(() => this.handlers.resized());
    });
    button.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (error) {
        console.warn('Fullscreen request failed:', error);
        button.title = 'Fullscreen unavailable — try again';
      }
    });
  }
}
