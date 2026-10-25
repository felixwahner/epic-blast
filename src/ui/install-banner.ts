// A small banner that offers installing the game as an app (fullscreen, offline).
import { browserEnvironment, isInstalledApp } from '../platform/pwa.ts';
import {
  installMode,
  isIos,
  isSnoozed,
  snooze,
  type BeforeInstallPromptEvent,
  type InstallMode,
} from '../platform/install-prompt.ts';
import { safeStorage, type KeyValueStore } from '../platform/storage.ts';
import { byId } from './hud.ts';

/** Gives the player a moment with the game before asking. */
const SHOW_DELAY_MS = 5000;

export class InstallBanner {
  private readonly banner = byId('install-banner');
  private readonly installButton = byId<HTMLButtonElement>('btn-install');
  private readonly hint = byId('install-hint');
  private deferred: BeforeInstallPromptEvent | null = null;
  private timer = 0;
  private readonly storage: KeyValueStore;

  constructor(storage: KeyValueStore = safeStorage) {
    this.storage = storage;
    if (isInstalledApp(browserEnvironment()) || isSnoozed(storage, Date.now())) return;

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.scheduleShow();
    });
    window.addEventListener('appinstalled', () => this.hide());
    this.installButton.addEventListener('click', () => this.install());
    byId('btn-install-close').addEventListener('click', () => {
      snooze(this.storage, Date.now());
      this.hide();
    });
    if (isIos(navigator.userAgent, navigator.maxTouchPoints)) this.scheduleShow();
  }

  private mode(): InstallMode | null {
    return installMode({
      installed: isInstalledApp(browserEnvironment()),
      ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
      canPrompt: this.deferred !== null,
    });
  }

  private scheduleShow(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.show(), SHOW_DELAY_MS);
  }

  private show(): void {
    const mode = this.mode();
    if (!mode) return;
    this.installButton.hidden = mode !== 'prompt';
    this.hint.textContent =
      mode === 'prompt' ? 'Im Vollbild und offline spielen' : 'Tippe auf „Teilen“ und dann „Zum Home-Bildschirm“';
    this.banner.hidden = false;
  }

  private hide(): void {
    window.clearTimeout(this.timer);
    this.banner.hidden = true;
  }

  private async install(): Promise<void> {
    const prompt = this.deferred;
    if (!prompt) return;
    this.deferred = null;
    this.hide();
    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'dismissed') snooze(this.storage, Date.now());
    } catch (error) {
      console.warn('Install prompt failed:', error);
    }
  }
}
