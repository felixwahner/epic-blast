// Retro 8-bit / 16-bit sound synthesis with the Web Audio API.
import { STORAGE_KEYS, safeStorage, type KeyValueStore } from '../platform/storage.ts';
import { StadiumAnnouncer, type AnnouncerContext } from './announcer.ts';
import { comboSoundProfile } from './combo-sound.ts';

type AudioContextConstructor = new () => AudioContext;

export interface AudioEngineOptions {
  storage?: KeyValueStore;
  /** Returns the AudioContext constructor, or undefined when Web Audio is unavailable. */
  contextClass?: () => AudioContextConstructor | undefined;
}

const defaultContextClass = (): AudioContextConstructor | undefined => {
  const host = globalThis as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor; window?: { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor } };
  const scope = host.window ?? host;
  return scope.AudioContext ?? scope.webkitAudioContext;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  isMuted: boolean;
  volume = 0.25;
  readonly announcer: StadiumAnnouncer;

  private readonly storage: KeyValueStore;
  private readonly contextClass: () => AudioContextConstructor | undefined;

  constructor({ storage = safeStorage, contextClass = defaultContextClass }: AudioEngineOptions = {}) {
    this.storage = storage;
    this.contextClass = contextClass;
    this.isMuted = storage.getItem(STORAGE_KEYS.muted) === 'true';
    this.announcer = new StadiumAnnouncer({
      enabled: () => !this.isMuted,
      context: () => this.ctx as unknown as AnnouncerContext | null,
    });
  }

  /** Creates or resumes the context. Call from user gestures; safe to call often. */
  init(): void {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = this.contextClass();
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    void this.announcer.prepare();
    // Music shares this context but has its own toggle; mute only guards SFX and speech.
    if (this.ctx && this.ctx.state !== 'running') {
      this.ctx.resume().catch(error => {
        console.warn('Audio activation failed; retrying on next interaction:', error);
      });
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.announcer.stop();
    this.storage.setItem(STORAGE_KEYS.muted, String(this.isMuted));
    if (!this.isMuted) this.init();
    return this.isMuted;
  }

  private get canPlay(): boolean {
    return !this.isMuted && this.ctx !== null && this.ctx.state === 'running';
  }

  /** Simple oscillator with an exponential decay envelope. */
  private voice(type: OscillatorType, freq: number, startTime: number, duration: number, startGain: number, endGain: number): void {
    if (this.isMuted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(startGain * this.volume, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endGain * this.volume), startTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  /** Short tone with a fast linear attack; nodes disconnect themselves when done. */
  private tone(start: number, duration: number, frequency: number, amplitude: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(amplitude * this.volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  /** Pick up a block piece: quick ascending blip. */
  playPickup(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.05);
    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Put down / return to tray. */
  playCancel(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    this.voice('sine', 200, this.ctx.currentTime, 0.08, 0.15, 0.001);
  }

  /** Place a block on the grid: sub impact, crunch and a metallic attack. */
  playPlace(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.playBassImpact(0.85);
    this.playImpactCrunch();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.07);
    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playImpactCrunch(): void {
    if (!this.canPlay) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + 0.12);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  /** Sub kick plus an audible harmonic for small phone speakers. */
  playBassImpact(strength = 1, delay = 0): void {
    if (!this.canPlay) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime + delay;
    [1, 2.5].forEach((harmonic, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = index ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(150 * harmonic, now);
      oscillator.frequency.exponentialRampToValueAtTime(45 * harmonic, now + 0.22);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.min(strength, 2) * (index ? 0.18 : 0.55) * this.volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(now); oscillator.stop(now + 0.6);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }

  /** Fixed-pitch positive attacks, warm chords and short rhythmic responses. */
  playClear(lineCount = 1, comboCount = 0, delay = 0): void {
    this.init();
    if (!this.canPlay) return;
    const now = this.ctx!.currentTime + delay;
    const { stage, milestone } = comboSoundProfile(comboCount);
    const tone = (offset: number, duration: number, frequency: number, amplitude: number, bright = false) =>
      this.tone(now + offset, duration, frequency, amplitude, bright ? 'triangle' : 'sine');
    tone(0, 0.16, 1046.5, 0.3, true);
    tone(0.025, 0.22, 1318.5, 0.19, true);
    this.playBassImpact(0.85 + Math.min(3, lineCount - 1) * 0.15, delay);
    if (stage >= 1 || lineCount >= 2) for (const frequency of [261.63, 329.63, 392]) tone(0.035, 0.5, frequency, 0.11, true);
    if (stage >= 2) {
      for (const frequency of [523.25, 659.25]) tone(0.19, 0.25, frequency, 0.11);
      tone(0.14, 0.18, 98, 0.28);
    }
    if (stage >= 3) for (const frequency of [392, 523.25, 659.25]) tone(0.09, 0.65, frequency, 0.085, true);
    if (stage >= 4) {
      tone(0.28, 0.22, 82.41, 0.32);
      [523.25, 659.25, 783.99].forEach((frequency, index) => tone(0.3 + index * 0.075, 0.4, frequency, 0.12, true));
    }
    if (milestone) {
      this.playBassImpact(0.65, delay + 0.16);
      this.playBassImpact(0.5, delay + 0.32);
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(0.45 + index * 0.04, 0.5, frequency, 0.1, true));
    }
  }

  /** Event fanfare in the same major-key register, independent of combo pitch. */
  playComboFanfare(): void {
    this.init();
    if (!this.canPlay) return;
    const now = this.ctx!.currentTime + 0.15;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const start = now + index * 0.055;
      const ctx = this.ctx!;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12 * this.volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.42);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }

  /** Melancholy descending notes: G4, F#4, F4, D#4, B3. */
  playGameOver(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    [392.0, 369.99, 349.23, 311.13, 246.94].forEach((freq, idx) => {
      this.voice('sawtooth', freq, now + idx * 0.14, 0.2, 0.22, 0.001 / this.volume);
    });
  }

  /** New high score fanfare: C5 E5 G5 C6. */
  playNewRecord(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    let t = this.ctx.currentTime;
    for (const { f, d } of [{ f: 523.25, d: 0.1 }, { f: 659.25, d: 0.1 }, { f: 783.99, d: 0.1 }, { f: 1046.5, d: 0.35 }]) {
      this.voice('square', f, t, d + 0.05, 0.25, 0.001 / this.volume);
      t += d;
    }
  }

  /** Revive / second chance arpeggio. */
  playRevive(): void {
    this.init();
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.voice('triangle', freq, now + idx * 0.05, 0.15, 0.2, 0.001 / this.volume);
    });
  }
}
