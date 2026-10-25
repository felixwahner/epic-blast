// Recorded English calls with baked-in arena effects; no system voices.

const CLIP_NAMES = [
  'triple', 'unstoppable', 'legendary', 'record', 'level', 'revive', 'over',
  'sweep', 'sweep-again', 'max-multiplier', 'new-world', 'eclipse', 'combo-saved',
  'last-chance', 'record-in-sight', 'champion', 'perfect', 'brilliant', 'close-call',
  'zone', 'cross', 'fire', 'epic-blast', 'lets-blast', 'million',
] as const;

export type ClipName = typeof CLIP_NAMES[number];
export type AnnouncerEvent =
  | 'start' | 'clear' | 'combo' | 'fire' | 'cross' | 'zone' | 'escape' | 'brilliant' | 'perfect'
  | 'world' | 'eclipse' | 'level' | 'near-record' | 'record' | 'million' | 'sweep'
  | 'rescue' | 'revive' | 'over';

const clipURL = (name: ClipName): string => new URL(`../assets/audio/announcer/${name}.mp3`, import.meta.url).href;
export const CLIPS = Object.fromEntries(CLIP_NAMES.map(name => [name, clipURL(name)])) as Record<ClipName, string>;

/** Minimum gap between two calls, except game over. */
export const CALL_COOLDOWN_MS = 6500;
/** "Unstoppable" is the most frequent call; keep it special. */
export const UNSTOPPABLE_REPEAT_MS = 45000;
/** Calls that would otherwise repeat every few moves are spoken at most this often. */
export const REPEAT_LIMITS_MS: Partial<Record<ClipName, number>> = {
  unstoppable: UNSTOPPABLE_REPEAT_MS, fire: 45000, cross: 45000, zone: 45000,
};
/** "Record in sight" plays once the score reaches this share of a stored best... */
export const NEAR_RECORD_SHARE = 0.9;
/** ...but only when that best is worth chasing. */
export const NEAR_RECORD_MIN_BEST = 10000;
export const MILLION = 1_000_000;

export const isNearRecord = (score: number, best: number): boolean =>
  best >= NEAR_RECORD_MIN_BEST && score < best && score >= best * NEAR_RECORD_SHARE;

/** Clip and priority for an event; a higher priority replaces a lower pending call. */
function callFor(event: AnnouncerEvent, value: number): [ClipName, number] | null {
  switch (event) {
    case 'start': return ['lets-blast', 1];
    case 'fire': return ['fire', 1];
    case 'cross': return ['cross', 1];
    case 'zone': return ['zone', 2];
    case 'clear':
      if (value >= 5) return ['epic-blast', 5];
      return value >= 3 ? [value >= 4 ? 'legendary' : 'triple', 2] : null;
    case 'combo':
      if (value !== 5 && !(value >= 10 && value % 10 === 0)) return null;
      return [value >= 10 ? 'legendary' : 'unstoppable', 3];
    case 'escape': return ['close-call', 3];
    case 'brilliant': return ['brilliant', 3];
    case 'world': return ['new-world', 4];
    case 'level': return ['level', 4];
    case 'near-record': return ['record-in-sight', 4];
    case 'perfect': return ['perfect', 5];
    case 'eclipse': return ['eclipse', 5];
    case 'record': return ['record', 5];
    case 'million': return ['million', 5];
    // `value` is the board clear multiplier: x3 first, x4/x5 later, x6 at the cap.
    case 'sweep': return [value >= 6 ? 'max-multiplier' : value > 3 ? 'sweep-again' : 'sweep', 6];
    case 'rescue': return ['combo-saved', 6];
    // `value` is the number of revives left after this one.
    case 'revive': return [value > 0 ? 'revive' : 'last-chance', 6];
    // `value` is 1 when the game ended on a new best score.
    case 'over': return [value ? 'champion' : 'over', 7];
    default: return null;
  }
}

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
    host = globalThis.window,
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

  announce(event: string, value = 0): void {
    const call = callFor(event as AnnouncerEvent, value);
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
    const repeatLimit = REPEAT_LIMITS_MS[call.clip] ?? 0;
    if (now - (this.lastClipSpoken.get(call.clip) ?? -Infinity) < repeatLimit) return;
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
