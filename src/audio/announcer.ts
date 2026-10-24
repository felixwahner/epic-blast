// Recorded English calls with baked-in arena effects; no system voices.

export type ClipName = 'triple' | 'unstoppable' | 'legendary' | 'record' | 'level' | 'revive' | 'over';
export type AnnouncerEvent = 'clear' | 'combo' | 'level' | 'record' | 'revive' | 'over';

export const CLIPS: Record<ClipName, string> = {
  triple: new URL('../assets/audio/announcer/triple.wav', import.meta.url).href,
  unstoppable: new URL('../assets/audio/announcer/unstoppable.wav', import.meta.url).href,
  legendary: new URL('../assets/audio/announcer/legendary.wav', import.meta.url).href,
  record: new URL('../assets/audio/announcer/record.wav', import.meta.url).href,
  level: new URL('../assets/audio/announcer/level.wav', import.meta.url).href,
  revive: new URL('../assets/audio/announcer/revive.wav', import.meta.url).href,
  over: new URL('../assets/audio/announcer/over.wav', import.meta.url).href,
};

/** Minimum gap between two calls, except game over. */
export const CALL_COOLDOWN_MS = 6500;
/** "Unstoppable" is the most frequent call; keep it special. */
export const UNSTOPPABLE_REPEAT_MS = 45000;
const SPEAK_DELAY_MS = 220;

/** The minimal Web Audio surface the announcer needs (mockable in tests). */
export interface AnnouncerContext {
  state: string;
  destination: unknown;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createGain(): { gain: { value: number }; connect(target: unknown): void; disconnect(): void };
  createBufferSource(): {
    buffer: unknown;
    onended: (() => void) | null;
    connect(target: unknown): void;
    disconnect(): void;
    start(): void;
    stop(): void;
  };
}

interface AnnouncerHost {
  document?: { hidden: boolean; addEventListener(name: string, listener: () => void): void };
  addEventListener?(name: string, listener: () => void): void;
}

interface PendingCall {
  clip: ClipName;
  priority: number;
  terminal: boolean;
}

interface ActiveCall {
  source: ReturnType<AnnouncerContext['createBufferSource']>;
  gain: ReturnType<AnnouncerContext['createGain']>;
}

export interface AnnouncerOptions {
  enabled?: () => boolean;
  context?: () => AnnouncerContext | null;
  host?: AnnouncerHost;
  fetchClip?: (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;
}

export class StadiumAnnouncer {
  readonly buffers = new Map<ClipName, unknown>();
  active: ActiveCall | null = null;
  pending: PendingCall | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;
  volume = 0.22;

  private readonly host: AnnouncerHost | undefined;
  private readonly enabled: () => boolean;
  private readonly context: () => AnnouncerContext | null;
  private readonly fetchClip: NonNullable<AnnouncerOptions['fetchClip']>;
  private loading: Promise<void> | null = null;
  private lastSpoken = -Infinity;
  private readonly lastClipSpoken = new Map<ClipName, number>();

  constructor({
    enabled = () => true,
    context = () => null,
    host = globalThis.window as AnnouncerHost | undefined,
    fetchClip = url => fetch(url),
  }: AnnouncerOptions = {}) {
    this.host = host;
    this.enabled = enabled;
    this.context = context;
    this.fetchClip = fetchClip;
    host?.document?.addEventListener('visibilitychange', () => {
      if (host.document?.hidden) this.reset();
    });
    host?.addEventListener?.('pagehide', () => this.reset());
  }

  /** Downloads and decodes all clips once; failed clips are retried on the next call. */
  prepare(): Promise<void> | null {
    const ctx = this.context();
    if (!ctx || this.loading) return this.loading;
    this.loading = Promise.all((Object.entries(CLIPS) as [ClipName, string][]).map(async ([name, url]) => {
      if (this.buffers.has(name)) return;
      try {
        const response = await this.fetchClip(url);
        if (!response.ok) throw new Error('Voice clip unavailable');
        this.buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()));
      } catch { /* Keep SFX/music working and retry missing clips on the next interaction. */ }
    })).then(() => undefined).finally(() => { this.loading = null; });
    return this.loading;
  }

  announce(event: AnnouncerEvent | string, value = 0): void {
    if (event === 'combo' && value !== 5 && !(value >= 10 && value % 10 === 0)) return;
    const calls: Record<AnnouncerEvent, [ClipName, number]> = {
      clear: [value >= 4 ? 'legendary' : 'triple', 2],
      combo: [value >= 10 ? 'legendary' : 'unstoppable', 3],
      level: ['level', 4],
      record: ['record', 5],
      revive: ['revive', 6],
      over: ['over', 7],
    };
    const call = calls[event as AnnouncerEvent];
    if (!call || !this.enabled() || this.host?.document?.hidden) return;
    if (this.pending && this.pending.priority > call[1]) return;
    this.pending = { clip: call[0], priority: call[1], terminal: event === 'over' };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.speak(), SPEAK_DELAY_MS);
  }

  speak(): void {
    const call = this.pending;
    this.pending = null;
    this.timer = null;
    const ctx = this.context();
    if (!call || !ctx || !this.enabled() || this.host?.document?.hidden || ctx.state !== 'running') return;
    const buffer = this.buffers.get(call.clip);
    if (!buffer) { void this.prepare(); return; } // Never replay stale calls after loading.
    const now = Date.now();
    if (call.clip === 'unstoppable' && now - (this.lastClipSpoken.get(call.clip) ?? -Infinity) < UNSTOPPABLE_REPEAT_MS) return;
    if (!call.terminal && (now - this.lastSpoken < CALL_COOLDOWN_MS || this.active)) return;
    if (call.terminal) this.stop();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    const active: ActiveCall = { source, gain };
    const release = () => {
      source.disconnect();
      gain.disconnect();
      if (this.active === active) this.active = null;
    };
    source.onended = release;
    this.active = active;
    try {
      source.start();
      this.lastSpoken = now;
      this.lastClipSpoken.set(call.clip, now);
    } catch { release(); }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    if (this.active) {
      const { source, gain } = this.active;
      this.active = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      gain.disconnect();
    }
  }

  /** Stops speech and allows the next call immediately (per-clip repeat limits stay). */
  reset(): void {
    this.stop();
    this.lastSpoken = -Infinity;
  }
}
