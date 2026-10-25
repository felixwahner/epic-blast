// Layered sound worlds: the same game events voiced as wood and stone, glass and bells, or heavy impacts.
import { comboSoundProfile } from './combo-sound.ts';

export const SOUND_WORLDS = ['impact', 'wood', 'glass', 'arcade'] as const;
export type SoundWorldId = (typeof SOUND_WORLDS)[number];
export const DEFAULT_SOUND_WORLD: SoundWorldId = 'impact';

export const SOUND_WORLD_LABELS: Record<SoundWorldId, string> = {
  impact: 'WUCHT',
  wood: 'HOLZ & STEIN',
  glass: 'GLAS & GLOCKEN',
  arcade: 'ARCADE',
};

export function parseSoundWorld(value: string | null): SoundWorldId {
  return SOUND_WORLDS.find(id => id === value) ?? DEFAULT_SOUND_WORLD;
}

export function nextSoundWorld(id: SoundWorldId): SoundWorldId {
  return SOUND_WORLDS[(SOUND_WORLDS.indexOf(id) + 1) % SOUND_WORLDS.length];
}

/** The game events every layered world voices; times are AudioContext seconds. */
export interface SoundKit {
  pickup(t: number): void;
  cancel(t: number): void;
  place(t: number): void;
  clear(t: number, lines: number, combo: number): void;
  fanfare(t: number): void;
  gameOver(t: number): void;
  record(t: number): void;
  revive(t: number): void;
}

type Dest = AudioNode | AudioNode[];

interface ToneOptions {
  f: number;
  f1?: number;
  glide?: number;
  type?: OscillatorType;
  a?: number;
  d?: number;
  g?: number;
}

interface NoiseOptions {
  type?: BiquadFilterType;
  f?: number;
  f1?: number;
  Q?: number;
  a?: number;
  d?: number;
  g?: number;
}

interface FmOptions {
  f: number;
  ratio: number;
  index: number;
  d: number;
  g: number;
  a?: number;
  indexTime?: number;
}

interface StackOptions {
  f: number;
  cutoff?: number;
  cutoffEnd?: number;
  a?: number;
  d?: number;
  g?: number;
}

interface BusOptions {
  gain: number;
  comp: { threshold: number; ratio: number; knee?: number; attack: number; release: number };
  reverb: { seconds: number; pow: number; damp: number; level: number };
  drive?: number;
}

interface Bus {
  dry: AudioNode;
  wet: AudioNode;
  /** Saturated path for punchy layers; the dry path when the world has no drive. */
  crunch: AudioNode;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Stereo room impulse: decaying noise, low-passed by `damp` (smaller is darker). */
function roomImpulse(ctx: BaseAudioContext, seconds: number, pow: number, damp: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpassed = 0;
    for (let i = 0; i < length; i++) {
      lowpassed += (Math.random() * 2 - 1 - lowpassed) * damp;
      data[i] = lowpassed * Math.pow(1 - i / length, pow);
    }
  }
  return buffer;
}

function saturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const size = 2048;
  const curve = new Float32Array(size);
  const norm = Math.tanh(amount);
  for (let i = 0; i < size; i++) curve[i] = Math.tanh(((i / (size - 1)) * 2 - 1) * amount) / norm;
  return curve;
}

/** dry -> compressor -> master; wet -> room -> compressor; crunch -> saturation -> compressor. */
function createBus(ctx: BaseAudioContext, destination: AudioNode, level: number, options: BusOptions): Bus {
  const master = ctx.createGain();
  master.gain.value = options.gain * level;
  master.connect(destination);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = options.comp.threshold;
  comp.ratio.value = options.comp.ratio;
  comp.knee.value = options.comp.knee ?? 6;
  comp.attack.value = options.comp.attack;
  comp.release.value = options.comp.release;
  comp.connect(master);

  const dry = ctx.createGain();
  dry.connect(comp);

  const wet = ctx.createGain();
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx, options.reverb.seconds, options.reverb.pow, options.reverb.damp);
  const roomReturn = ctx.createGain();
  roomReturn.gain.value = options.reverb.level;
  wet.connect(room);
  room.connect(roomReturn);
  roomReturn.connect(comp);

  let crunch: AudioNode = dry;
  if (options.drive) {
    crunch = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(options.drive);
    shaper.oversample = '4x';
    const trim = ctx.createGain();
    trim.gain.value = 0.8;
    crunch.connect(shaper);
    shaper.connect(trim);
    trim.connect(comp);
  }
  return { dry, wet, crunch };
}

const outputs = (dest: Dest) => (Array.isArray(dest) ? dest : [dest]);
const envelope = (param: AudioParam, t: number, attack: number, peak: number, decay: number) => {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
};
const cleanup = (source: AudioScheduledSourceNode, nodes: AudioNode[]) => {
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
};

/** One-shot voices; every node disconnects itself once its source ends. */
function voices(ctx: BaseAudioContext) {
  const tone = (dest: Dest, t: number, { f, f1, glide, type = 'sine', a = 0.003, d = 0.3, g = 0.2 }: ToneOptions) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + (glide ?? d));
    envelope(gain.gain, t, a, g, d);
    osc.connect(gain);
    for (const node of outputs(dest)) gain.connect(node);
    osc.start(t);
    osc.stop(t + a + d + 0.03);
    cleanup(osc, [gain]);
  };

  const noise = (
    dest: Dest,
    t: number,
    { type = 'bandpass', f = 1000, f1, Q = 1, a = 0.001, d = 0.1, g = 0.2 }: NoiseOptions,
  ) => {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = noiseBuffer(ctx);
    filter.type = type;
    filter.Q.value = Q;
    filter.frequency.setValueAtTime(f, t);
    if (f1) filter.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    envelope(gain.gain, t, a, g, d);
    source.connect(filter);
    filter.connect(gain);
    for (const node of outputs(dest)) gain.connect(node);
    source.start(t, Math.random() * 1.4);
    source.stop(t + a + d + 0.03);
    cleanup(source, [filter, gain]);
  };

  /** Sum of damped partials, each [ratio, decay, amplitude]. */
  const modal = (dest: Dest, t: number, f: number, partials: [number, number, number][], g: number) => {
    for (const [ratio, d, amp] of partials)
      if (f * ratio < 16000) tone(dest, t, { f: f * ratio, a: 0.0015, d, g: g * amp });
  };

  /** Two-operator FM; the modulation index falls faster than the amplitude, like a struck bell. */
  const fm = (dest: Dest, t: number, { f, ratio, index, d, g, a = 0.002, indexTime = d * 0.4 }: FmOptions) => {
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    carrier.frequency.value = f;
    modulator.frequency.value = f * ratio;
    depth.gain.setValueAtTime(index * f * ratio, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(0.5, index * f * ratio * 0.04), t + indexTime);
    envelope(gain.gain, t, a, g, d);
    modulator.connect(depth);
    depth.connect(carrier.frequency);
    carrier.connect(gain);
    for (const node of outputs(dest)) gain.connect(node);
    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + a + d + 0.03);
    modulator.stop(t + a + d + 0.03);
    cleanup(carrier, [modulator, depth, gain]);
  };

  /** Three detuned saws through a closing low-pass: a synth stab, or a pad with a slow attack. */
  const stack = (
    dest: Dest,
    t: number,
    { f, cutoff = 5000, cutoffEnd = 700, a = 0.005, d = 0.45, g = 0.05 }: StackOptions,
  ) => {
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(cutoffEnd, t + a + d);
    envelope(gain.gain, t, a, g, d);
    filter.connect(gain);
    for (const node of outputs(dest)) gain.connect(node);
    const saws = [-14, 0, 14].map(detune => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + a + d + 0.03);
      return osc;
    });
    saws[0].onended = () => {
      for (const osc of saws) osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  };

  return { tone, noise, modal, fm, stack };
}

/** Small random detune so repeated placements never sound identical. */
const jitter = (spread: number) => 1 + (Math.random() * 2 - 1) * spread;

// C major pentatonic, C3 to A6.
const PENTATONIC = [
  130.81, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5,
  1174.66, 1318.51, 1567.98, 1760,
];

/** Heavy pieces on a wooden board; lines break like stone and a marimba answers. */
function woodAndStone(ctx: BaseAudioContext, destination: AudioNode, level: number): SoundKit {
  const bus = createBus(ctx, destination, level, {
    gain: 0.52,
    comp: { threshold: -16, ratio: 3, attack: 0.004, release: 0.18 },
    reverb: { seconds: 0.75, pow: 4, damp: 0.32, level: 0.5 },
  });
  const v = voices(ctx);
  const both = [bus.dry, bus.wet];
  const marimba = (t: number, f: number, g: number) => {
    const body = 0.14 + 0.5 * Math.sqrt(Math.min(1, 260 / f));
    v.modal(
      both,
      t,
      f,
      [
        [1, body, 1],
        [3.93, body * 0.22, 0.22],
        [9.36, 0.03, 0.06],
      ],
      g,
    );
    v.noise(bus.dry, t, { f: Math.min(f * 4, 7000), Q: 2, d: 0.012, g: g * 0.25 });
  };
  const logDrum = (t: number, f: number, g: number) => {
    v.modal(
      both,
      t,
      f,
      [
        [1, 0.22, 1],
        [1.52, 0.12, 0.45],
        [2.31, 0.06, 0.25],
      ],
      g,
    );
    v.noise(bus.dry, t, { f: f * 3, Q: 1.5, d: 0.03, g: g * 0.35 });
  };
  return {
    pickup(t) {
      const pitch = jitter(0.05);
      v.modal(
        bus.dry,
        t,
        1350 * pitch,
        [
          [1, 0.035, 1],
          [2.31, 0.018, 0.45],
        ],
        0.13,
      );
      v.noise(bus.dry, t, { f: 3200, Q: 1.4, d: 0.014, g: 0.07 });
    },
    cancel(t) {
      const pitch = jitter(0.04);
      v.tone(bus.dry, t, { f: 190 * pitch, f1: 150 * pitch, d: 0.09, g: 0.28 });
      v.modal(
        both,
        t,
        420 * pitch,
        [
          [1, 0.06, 1],
          [2.6, 0.03, 0.4],
        ],
        0.18,
      );
      v.noise(bus.dry, t, { f: 1500, Q: 1.3, d: 0.03, g: 0.14 });
    },
    place(t) {
      const pitch = jitter(0.045);
      // Low body, hollow wood resonance, knock and contact click.
      v.tone(bus.dry, t, { f: 128 * pitch, f1: 88 * pitch, glide: 0.08, a: 0.002, d: 0.24, g: 0.62 });
      v.modal(
        both,
        t,
        215 * pitch,
        [
          [1, 0.12, 0.6],
          [2.57, 0.065, 0.32],
          [4.13, 0.035, 0.2],
        ],
        0.42,
      );
      v.noise(both, t, { f: 850 * pitch, Q: 1.1, d: 0.05, g: 0.36 });
      v.noise(bus.dry, t, { type: 'highpass', f: 4800, d: 0.007, g: 0.14 });
    },
    clear(t, lines, combo) {
      const { stage, milestone } = comboSoundProfile(combo);
      const weight = 1 + 0.15 * Math.min(3, lines - 1);
      // The stone breaks: a deep thud and a spray of small fragments.
      v.tone(bus.dry, t, { f: 82, f1: 46, glide: 0.25, a: 0.004, d: 0.45, g: 0.6 * weight });
      logDrum(t, 110, 0.35 * weight);
      const grains = 9 + lines * 6 + stage * 3;
      for (let i = 0; i < grains; i++) {
        const at = t + 0.01 + Math.pow(Math.random(), 1.6) * (0.26 + 0.04 * lines);
        v.noise(Math.random() < 0.5 ? bus.dry : both, at, {
          f: 600 + Math.random() * 3200,
          Q: 2.5 + Math.random() * 4,
          d: 0.015 + Math.random() * 0.04,
          g: 0.07 + Math.random() * 0.1,
        });
      }
      // The marimba run grows with lines and combo.
      const notes = Math.min(9, 2 + lines + stage);
      const root = 5 + Math.min(stage, 3);
      marimba(t + 0.005, PENTATONIC[root - 5], 0.32);
      for (let i = 0; i < notes; i++) marimba(t + 0.03 + i * 0.045, PENTATONIC[root + i], 0.26 - i * 0.012);
      const top = PENTATONIC[root + notes - 1];
      if (stage >= 2) marimba(t + 0.03 + notes * 0.045, top * 2, 0.14);
      if (stage >= 3) for (let r = 1; r <= 4; r++) marimba(t + 0.03 + (notes + r) * 0.05, top, 0.12 - r * 0.02);
      if (stage >= 4) {
        logDrum(t + 0.14, 82, 0.4);
        logDrum(t + 0.24, 110, 0.32);
      }
      if (milestone) for (let i = 0; i < 8; i++) logDrum(t + 0.35 + i * 0.06, i % 2 ? 165 : 123, 0.22 + i * 0.015);
    },
    fanfare(t) {
      [5, 6, 7, 8, 9, 10].forEach((note, i) => marimba(t + i * 0.055, PENTATONIC[note], 0.22));
      for (const f of [523.25, 659.25, 783.99]) marimba(t + 0.36, f, 0.2);
      logDrum(t + 0.36, 98, 0.3);
    },
    gameOver(t) {
      [196, 164.81, 146.83, 130.81, 110].forEach((f, i) => marimba(t + i * 0.2, f, 0.36));
      logDrum(t + 1, 73.4, 0.45);
      v.tone(bus.dry, t + 1, { f: 60, f1: 40, d: 0.7, g: 0.4 });
    },
    record(t) {
      [5, 7, 8, 10].forEach((note, i) => marimba(t + i * 0.08, PENTATONIC[note], 0.26));
      [10, 12, 13, 15].forEach((note, i) => marimba(t + 0.4 + i * 0.03, PENTATONIC[note], 0.18));
      logDrum(t + 0.4, 98, 0.35);
    },
    revive(t) {
      for (let i = 0; i < 9; i++) marimba(t + i * 0.038, PENTATONIC[5 + i], 0.22);
      logDrum(t, 110, 0.25);
    },
  };
}

/** Felt thuds with a glass tone on top, bell chords in a large hall. */
function glassAndBells(ctx: BaseAudioContext, destination: AudioNode, level: number): SoundKit {
  const bus = createBus(ctx, destination, level, {
    gain: 0.58,
    comp: { threshold: -18, ratio: 2.5, attack: 0.006, release: 0.3 },
    reverb: { seconds: 2.6, pow: 3, damp: 0.22, level: 0.55 },
  });
  const v = voices(ctx);
  const both = [bus.dry, bus.wet];
  const bell = (t: number, f: number, g: number, d = 1.4) => {
    v.fm(both, t, { f, ratio: 3.5, index: 1.6, d, g: g * 0.6, indexTime: 0.25 });
    v.tone(both, t, { f, d: d * 0.9, g: g * 0.5 });
    v.tone(both, t, { f: f * 2.76, d: d * 0.25, g: g * 0.12 });
  };
  const glass = (t: number, f: number, g: number) =>
    v.fm(both, t, { f, ratio: 7.1, index: 0.6, d: 0.55, g, indexTime: 0.05 });
  // Tones from the F lydian chord, so any sequence of placements sounds consonant.
  const tinks = [1396.9, 1568, 1760, 2093, 2349.3, 2637];
  return {
    pickup(t) {
      v.tone(both, t, { f: 2637 * jitter(0.01), d: 0.09, g: 0.045 });
      v.noise(bus.dry, t, { type: 'highpass', f: 6500, a: 0.01, d: 0.04, g: 0.035 });
    },
    cancel(t) {
      v.tone(bus.dry, t, { f: 150, f1: 110, d: 0.1, g: 0.3 });
      glass(t, 1046.5, 0.05);
    },
    place(t) {
      const pitch = jitter(0.03);
      v.tone(bus.dry, t, { f: 112 * pitch, f1: 62 * pitch, glide: 0.09, a: 0.003, d: 0.2, g: 0.6 });
      v.noise(bus.dry, t, { type: 'lowpass', f: 650, Q: 0.7, a: 0.002, d: 0.06, g: 0.4 });
      v.noise(both, t, { f: 1800, Q: 0.8, d: 0.02, g: 0.06 });
      glass(t + 0.004, tinks[Math.floor(Math.random() * tinks.length)], 0.06);
    },
    clear(t, lines, combo) {
      const { stage, milestone } = comboSoundProfile(combo);
      const weight = 1 + 0.15 * Math.min(3, lines - 1);
      // Shimmer sweep into a soft sub bloom and a rolled Fmaj9 bell chord.
      v.noise(both, t, { f: 600, f1: 7000, Q: 1.6, a: 0.09, d: 0.25, g: 0.14 });
      v.tone(bus.dry, t + 0.06, { f: 82, f1: 55, glide: 0.3, a: 0.01, d: 0.7, g: 0.55 * weight });
      const chord = [174.61, 349.23, 440, 523.25, 659.25, 783.99, 987.77];
      const count = Math.min(chord.length, 3 + lines);
      for (let i = 0; i < count; i++) bell(t + 0.06 + i * 0.022, chord[i], 0.13 - i * 0.008, 1.6);
      if (stage >= 1) [1046.5, 1318.5, 1568, 2093].forEach((f, i) => glass(t + 0.2 + i * 0.055, f, 0.07));
      if (stage >= 2) bell(t + 0.42, 1396.9, 0.08, 1.8);
      if (stage >= 3)
        for (const f of [174.61, 261.63, 440, 659.25])
          v.stack(bus.wet, t + 0.05, { f, a: 0.18, d: 1.4, cutoff: 1400, cutoffEnd: 500, g: 0.03 });
      if (stage >= 4) v.fm(both, t + 0.06, { f: 87.3, ratio: 1.41, index: 3.5, d: 2.4, g: 0.22, indexTime: 1.2 });
      if (milestone)
        [2637, 2349.3, 2093, 1760, 1568, 1396.9, 1318.5, 1046.5].forEach((f, i) => glass(t + 0.5 + i * 0.045, f, 0.08));
    },
    fanfare(t) {
      [349.23, 440, 523.25, 698.46].forEach((f, i) => bell(t + i * 0.07, f, 0.12, 1.3));
      glass(t + 0.3, 2093, 0.07);
    },
    gameOver(t) {
      [392, 349.23, 311.13, 261.63, 196].forEach((f, i) => bell(t + i * 0.24, f, 0.12, 1.8));
      v.fm(both, t + 1.2, { f: 65.4, ratio: 1.41, index: 2.5, d: 2.5, g: 0.2, indexTime: 1.5 });
    },
    record(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(t + i * 0.1, f, 0.13, 1.6));
      v.noise(both, t + 0.3, { f: 2000, f1: 9000, Q: 1.2, a: 0.15, d: 0.5, g: 0.08 });
      [2093, 2637, 3136].forEach((f, i) => glass(t + 0.45 + i * 0.06, f, 0.06));
    },
    revive(t) {
      v.noise(both, t, { f: 400, f1: 6000, Q: 1.5, a: 0.3, d: 0.15, g: 0.1 });
      [349.23, 440, 523.25, 659.25, 783.99, 880, 1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
        glass(t + i * 0.035, f, 0.07),
      );
    },
  };
}

/** Sub, saturated punch and compression; lines boom with a synth stab and taikos. */
function heavyImpact(ctx: BaseAudioContext, destination: AudioNode, level: number): SoundKit {
  const bus = createBus(ctx, destination, level, {
    gain: 0.44,
    comp: { threshold: -20, ratio: 6, knee: 4, attack: 0.002, release: 0.14 },
    reverb: { seconds: 1.1, pow: 3.5, damp: 0.45, level: 0.35 },
    drive: 2.6,
  });
  const v = voices(ctx);
  const both = [bus.dry, bus.wet];
  const taiko = (t: number, f: number, g: number) => {
    v.tone(both, t, { f: f * 1.6, f1: f, glide: 0.05, a: 0.002, d: 0.32, g });
    v.noise(bus.crunch, t, { type: 'lowpass', f: 900, Q: 0.8, d: 0.07, g: g * 0.6 });
  };
  const boom = (t: number, g: number) => {
    v.tone(bus.dry, t, { f: 95, f1: 36, glide: 0.35, a: 0.003, d: 0.75, g });
    v.tone(bus.crunch, t, { type: 'triangle', f: 210, f1: 70, glide: 0.12, d: 0.18, g: g * 0.5 });
    v.noise(bus.crunch, t, { type: 'lowpass', f: 2200, f1: 160, Q: 0.6, d: 0.35, g: g * 0.45 });
    v.noise(bus.dry, t, { type: 'highpass', f: 5500, d: 0.01, g: 0.18 });
  };
  const stab = (t: number, notes: number[], g: number) => {
    for (const f of notes) v.stack(both, t, { f, cutoff: 6500, cutoffEnd: 600, d: 0.5, g });
  };
  return {
    pickup(t) {
      v.noise(bus.dry, t, { f: 1100, f1: 3600, Q: 1.8, a: 0.015, d: 0.05, g: 0.1 });
      v.tone(bus.dry, t, { f: 520, f1: 820, d: 0.045, g: 0.07 });
    },
    cancel(t) {
      v.noise(bus.dry, t, { f: 3000, f1: 900, Q: 1.8, a: 0.01, d: 0.06, g: 0.09 });
      v.tone(bus.dry, t, { f: 130, f1: 72, d: 0.12, g: 0.35 });
    },
    place(t) {
      const pitch = jitter(0.04);
      // Sub, saturated mid body, clack and transient, glued by the compressor.
      v.tone(bus.dry, t, { f: 145 * pitch, f1: 46 * pitch, glide: 0.09, a: 0.002, d: 0.3, g: 0.75 });
      v.tone(bus.crunch, t, { type: 'triangle', f: 270 * pitch, f1: 92 * pitch, glide: 0.05, d: 0.1, g: 0.5 });
      v.noise(bus.crunch, t, { f: 1500 * pitch, Q: 1.4, d: 0.04, g: 0.42 });
      v.noise(bus.dry, t, { type: 'highpass', f: 6000, d: 0.006, g: 0.2 });
      v.noise(bus.wet, t, { f: 900, Q: 1, d: 0.05, g: 0.12 });
    },
    clear(t, lines, combo) {
      const { stage, milestone } = comboSoundProfile(combo);
      const weight = 1 + 0.12 * Math.min(3, lines - 1);
      const hit = t + 0.08;
      // A short suck-in, then the boom and a synth stab that fills up with more lines.
      v.noise(both, t, { f: 400, f1: 3500, Q: 1.4, a: 0.075, d: 0.02, g: 0.16 });
      if (stage >= 3) v.noise(both, t, { type: 'highpass', f: 6500, a: 0.08, d: 0.45, g: 0.09 });
      boom(hit, 0.8 * weight);
      const chord = [130.81, 261.63, 329.63, 392, 523.25, 659.25];
      stab(hit, chord.slice(0, Math.min(chord.length, 2 + lines)), 0.045);
      if (stage >= 1) taiko(hit + 0.17, 92, 0.55);
      if (stage >= 2) {
        taiko(hit + 0.29, 74, 0.6);
        stab(hit + 0.29, [523.25, 659.25, 783.99], 0.035);
      }
      if (stage >= 4)
        for (const f of [65.41, 98, 130.81])
          v.stack([bus.crunch, bus.wet], hit + 0.29, { f, cutoff: 900, cutoffEnd: 200, a: 0.02, d: 0.9, g: 0.06 });
      if (milestone) for (let i = 0; i < 6; i++) taiko(hit + 0.45 + i * 0.075, i % 2 ? 110 : 82, 0.4 + i * 0.04);
    },
    fanfare(t) {
      [
        [261.63, 329.63, 392],
        [329.63, 392, 523.25],
        [392, 523.25, 659.25],
      ].forEach((chord, i) => stab(t + i * 0.08, chord, 0.04));
      taiko(t + 0.16, 82, 0.5);
    },
    gameOver(t) {
      [392, 369.99, 349.23, 311.13, 246.94].forEach((f, i) =>
        v.stack(both, t + i * 0.17, { f, cutoff: 1800, cutoffEnd: 300, d: 0.32, g: 0.06 }),
      );
      boom(t + 0.85, 0.7);
    },
    record(t) {
      v.noise(both, t, { f: 500, f1: 6000, Q: 1.2, a: 0.25, d: 0.05, g: 0.14 });
      boom(t + 0.28, 0.75);
      stab(t + 0.28, [261.63, 329.63, 392, 523.25], 0.045);
      stab(t + 0.46, [523.25, 659.25, 783.99, 1046.5], 0.035);
      taiko(t + 0.46, 82, 0.5);
    },
    revive(t) {
      v.noise(both, t, { f: 300, f1: 5000, Q: 1.3, a: 0.32, d: 0.08, g: 0.13 });
      [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((f, i) =>
        v.stack(both, t + i * 0.05, { f, d: 0.22, g: 0.035 }),
      );
      boom(t + 0.34, 0.6);
    },
  };
}

const KITS: Record<Exclude<SoundWorldId, 'arcade'>, typeof woodAndStone> = {
  impact: heavyImpact,
  wood: woodAndStone,
  glass: glassAndBells,
};

/**
 * Builds the layered kit for a world, or null for the classic arcade sounds.
 * `level` scales the bus; 1 matches the arcade sounds at the engine's default volume.
 */
export function createSoundKit(
  world: SoundWorldId,
  ctx: BaseAudioContext,
  destination: AudioNode,
  level = 1,
): SoundKit | null {
  return world === 'arcade' ? null : KITS[world](ctx, destination, level);
}
