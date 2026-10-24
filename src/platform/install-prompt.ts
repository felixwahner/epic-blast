// When to offer installing the game as an app, kept free of the DOM so it can be tested.
import { STORAGE_KEYS, readNumber, type KeyValueStore } from './storage.ts';

/** Chromium's install event; not in the standard DOM typings yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** 'prompt': the browser can show its install dialog. 'ios': only the manual share-sheet route exists. */
export type InstallMode = 'prompt' | 'ios';

/** After closing the banner it stays away this long. */
export const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** iPhone, iPod and iPad, including iPads that report themselves as a Mac. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function installMode(options: { installed: boolean; ios: boolean; canPrompt: boolean }): InstallMode | null {
  if (options.installed) return null;
  if (options.canPrompt) return 'prompt';
  return options.ios ? 'ios' : null;
}

export function isSnoozed(store: KeyValueStore, now: number): boolean {
  return now - readNumber(store, STORAGE_KEYS.installDismissed, 0) < INSTALL_SNOOZE_MS;
}

export function snooze(store: KeyValueStore, now: number): void {
  store.setItem(STORAGE_KEYS.installDismissed, String(now));
}
