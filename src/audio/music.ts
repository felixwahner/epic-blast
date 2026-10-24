// Streams the compressed background recording with its own toggle.
import { STORAGE_KEYS, safeStorage, type KeyValueStore } from '../platform/storage.ts';

export const MUSIC_URL = new URL('../assets/audio/music/smth-smth.mp3', import.meta.url).href;

/** Music volume relative to the SFX master volume. */
const MUSIC_LEVEL = 0.7;
/** Music level while the announcer speaks. */
export const DUCK_LEVEL = 0.35;
const TICK_MS = 50;

/** The parts of the audio engine the music player depends on. */
export interface MusicAudioSource {
  ctx: AudioContext | null;
  adMuted: boolean;
  volume: number;
  announcer?: { active: unknown };
}

export class BackgroundMusic {
  enabled = true;
  playing = false;
  /** Autoplay was refused; retry only after a real interaction. */
  blocked = false;
  timer: ReturnType<typeof setInterval> | null;
  media: HTMLAudioElement | null = null;

  private readonly audio: MusicAudioSource;
  private readonly storage: KeyValueStore;
  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(audio: MusicAudioSource, storage: KeyValueStore = safeStorage) {
    this.audio = audio;
    this.storage = storage;
    this.enabled = storage.getItem(STORAGE_KEYS.music) !== 'off';
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('pointerdown', () => { this.blocked = false; this.tick(); });
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.blocked = false;
    this.storage.setItem(STORAGE_KEYS.music, this.enabled ? 'on' : 'off');
    this.tick();
    return this.enabled;
  }

  /** Stops the periodic tick (e.g. on pagehide). */
  suspend(): void {
    this.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  resume(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.context && this.gain) {
      const now = this.context.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setTargetAtTime(0, now, 0.01);
    }
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(() => this.media?.pause(), 60);
  }

  tick(): void {
    const { ctx, adMuted, volume } = this.audio;
    if (!this.enabled || !ctx || ctx.state !== 'running' || adMuted || document.visibilityState !== 'visible') {
      this.stop();
      return;
    }
    if (this.context !== ctx) this.connect(ctx);
    if (this.blocked) return;
    const media = this.media!;
    if (!this.playing) {
      clearTimeout(this.pauseTimer);
      this.playing = true;
      media.play().catch(() => {
        if (this.media !== media) return;
        this.playing = false;
        this.blocked = true;
        media.pause();
      });
    }
    const duck = this.audio.announcer?.active ? DUCK_LEVEL : 1;
    this.gain!.gain.setTargetAtTime(Math.max(0, Math.min(1, volume * MUSIC_LEVEL * duck)), ctx.currentTime, duck < 1 ? 0.04 : 0.25);
  }

  /** (Re)binds the media element to a new audio context. */
  private connect(ctx: AudioContext): void {
    clearTimeout(this.pauseTimer);
    this.media?.pause();
    this.source?.disconnect();
    this.gain?.disconnect();
    this.context = ctx;
    this.playing = false;
    this.blocked = false;
    this.media = new Audio(MUSIC_URL);
    this.media.loop = true;
    this.media.preload = 'none';
    this.source = ctx.createMediaElementSource(this.media);
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain);
    this.gain.connect(ctx.destination);
  }
}
