import { expect, test } from '@playwright/test';
import './helpers.ts';

test('sound output survives mute and music stays independent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#pixi-view canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Optionen öffnen' }).click();
  await expect.poll(() => page.evaluate(() => window.audio?.ctx?.state)).toBe('running');

  /** Peak level of a pickup sound, observed through an analyser on the real SFX routing. */
  const measure = () => page.evaluate(async () => {
    const audio = window.audio!;
    const ctx = audio.ctx!;
    const analyser = ctx.createAnalyser();
    const createGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const gain = createGain();
      gain.connect(analyser);
      return gain;
    };
    audio.playPickup();
    ctx.createGain = createGain;
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    // Audio rendering advances in blocks and may start late on a busy machine:
    // sample for up to 600 ms, stopping as soon as the sound is audible.
    for (let i = 0; i < 60 && peak === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      analyser.getFloatTimeDomainData(samples);
      peak = Math.max(peak, ...Array.from(samples, Math.abs));
    }
    analyser.disconnect();
    return peak;
  });

  // The first sound after resume can land in the past on a busy machine; retry.
  await expect.poll(measure, { timeout: 10000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.audio!.announcer.buffers.size)).toBe(7);
  const voice = await page.evaluate(async () => {
    const { announcer } = window.audio!;
    announcer.announce('record');
    await new Promise(resolve => setTimeout(resolve, 300));
    return { active: Boolean(announcer.active), volume: announcer.active?.gain.gain.value };
  });
  expect(voice.active).toBe(true);
  expect(voice.volume).toBeCloseTo(0.22);

  await page.locator('#btn-sound').click();
  expect(await page.evaluate(() => window.audio!.isMuted)).toBe(true);
  expect(await measure()).toBe(0);
  await expect(page.locator('#btn-music')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btn-sound').click();
  await expect.poll(measure, { timeout: 10000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
