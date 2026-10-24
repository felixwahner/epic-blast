import { STORAGE_KEYS, safeStorage, type KeyValueStore } from './storage.ts';

export interface VibrationDevice {
  vibrate?: (pattern: number) => boolean;
}

export class Haptics {
  private on: boolean;
  private readonly storage: KeyValueStore;

  constructor(storage: KeyValueStore = safeStorage) {
    this.storage = storage;
    this.on = storage.getItem(STORAGE_KEYS.vibration) !== 'off';
  }

  get enabled(): boolean {
    return this.on;
  }

  toggle(): boolean {
    this.on = !this.on;
    this.storage.setItem(STORAGE_KEYS.vibration, this.on ? 'on' : 'off');
    return this.on;
  }

  /** A single short pulse per clear, independent of sound settings. */
  lineClear(device: VibrationDevice | undefined = globalThis.navigator as VibrationDevice | undefined): boolean {
    if (!this.on || typeof device?.vibrate !== 'function') return false;
    try {
      return device.vibrate(10);
    } catch {
      // Unsupported or policy-blocked vibration must never interrupt a move.
      return false;
    }
  }
}
