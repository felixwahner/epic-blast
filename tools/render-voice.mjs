// Run from the repository root: node tools/render-voice.mjs [input.mp3] [output.wav]
// Bakes the approved announcer effects into a raw take (see docs/prompts/voice.md).
// Takes are kept out of git: put them in voice-takes/.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async encoded => {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const decoder = new OfflineAudioContext(2, 1, 44100);
      const clip = await decoder.decodeAudioData(bytes.buffer);
      const context = new OfflineAudioContext(2, Math.ceil((clip.duration + 1.7) * 44100), 44100);
      const source = context.createBufferSource();
      source.buffer = clip;
      const mix = context.createGain();
      mix.connect(context.destination);
      const route = (node, volume) => {
        const gain = context.createGain();
        gain.gain.value = volume;
        node.connect(gain);
        gain.connect(mix);
      };
      route(source, 0.88);

      // Wide arena reflections with a short pre-delay to preserve consonants.
      const impulse = context.createBuffer(2, 44100 * 1.35, 44100);
      let seed = 8128;
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          samples[i] = (seed / 2147483648) * Math.exp((-7 * i) / samples.length);
        }
      }
      const reverb = context.createConvolver();
      reverb.buffer = impulse;
      const predelay = context.createDelay();
      predelay.delayTime.value = 0.034;
      const warmth = context.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = 4800;
      source.connect(predelay);
      predelay.connect(warmth);
      warmth.connect(reverb);
      route(reverb, 0.4);

      // Stereo slap/double plus two darker, receding echoes.
      for (const [time, volume, pan] of [
        [0.018, 0.13, -0.65],
        [0.027, 0.13, 0.65],
        [0.18, 0.23, -0.4],
        [0.36, 0.11, 0.4],
      ]) {
        const delay = context.createDelay();
        delay.delayTime.value = time;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3600;
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        source.connect(delay);
        delay.connect(filter);
        filter.connect(panner);
        route(panner, volume);
      }
      source.start();
      const rendered = await context.startRendering();
      return Array.from({ length: 2 }, (_, channel) => Array.from(rendered.getChannelData(channel)));
    },
    readFileSync(process.argv[2] || 'voice-takes/smooth-energetic-announcer.mp3').toString('base64'),
  );

  const frames = result[0].length;
  let peak = 0;
  for (const channel of result) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (!Number.isFinite(peak) || peak === 0) throw new Error('Empty or invalid rendered voice');
  const output = Buffer.alloc(44 + frames * 4);
  output.write('RIFF', 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(44100, 24);
  output.writeUInt32LE(176400, 28);
  output.writeUInt16LE(4, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      output.writeInt16LE(Math.round((result[channel][frame] / peak) * 0.89 * 32767), 44 + frame * 4 + channel * 2);
    }
  }
  writeFileSync(process.argv[3] || 'voice-takes/epic-blast-announcer.wav', output);
  console.log(`Rendered ${(frames / 44100).toFixed(2)}s stereo take; peak normalized to -1 dBFS.`);
} finally {
  await browser.close();
}
