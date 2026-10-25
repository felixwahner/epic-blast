// The menu's new-game button and its in-game confirmation overlay.
import { byId } from './hud.ts';

export class RestartConfirm {
  private readonly overlay = byId('restart-confirm');
  private readonly trigger = byId('btn-new-game');
  private readonly cancelButton = byId('btn-cancel-restart');
  /** The trigger lives in the menu, which closes first; focus returns to the menu button. */
  private readonly menuButton = byId('btn-options');

  constructor(restart: () => void) {
    this.trigger.addEventListener('click', () => this.open());
    this.cancelButton.addEventListener('click', () => this.close());
    byId('btn-confirm-restart').addEventListener('click', () => {
      this.close();
      restart();
    });
    // Tapping the dimmed board around the box keeps the current game.
    this.overlay.addEventListener('click', event => {
      if (event.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  open(): void {
    this.trigger.closest('dialog')?.close();
    this.overlay.inert = false;
    this.overlay.classList.remove('hidden');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.cancelButton.focus();
  }

  close(): void {
    this.overlay.classList.add('hidden');
    this.overlay.inert = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.menuButton.focus();
  }
}
