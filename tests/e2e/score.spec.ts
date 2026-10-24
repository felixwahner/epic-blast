import { expect, test } from '@playwright/test';
import type { ScoreAnimator } from '../../src/ui/score-animator.ts';

declare global {
  interface Window {
    animator: ScoreAnimator;
    gentle: boolean;
    flightOrigin(): { x: number; y: number };
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/harness/score.html');
  await page.waitForFunction(() => window.animator);
});

test('clear points travel to the HUD before its counter increases', async ({ page }) => {
  await page.evaluate(() => { window.animator.add(128, window.flightOrigin(), { delay: 0.14 }); window.animator.update(0.3); });
  await expect(page.locator('.score-flight-amount')).toHaveText('+128');
  await expect(page.locator('#score-display')).toHaveText('0');
  const start = (await page.locator('.score-flight').boundingBox())!;
  await page.evaluate(() => window.animator.update(0.5));
  const traveling = (await page.locator('.score-flight').boundingBox())!;
  expect(traveling.y).toBeLessThan(start.y - 30);
  await expect(page.locator('#score-display')).toHaveText('0');
  await page.evaluate(() => window.animator.update(0.3));
  await expect(page.locator('.score-flight')).toHaveCount(0);
  const counting = await page.locator('#score-display').innerText();
  expect(Number(counting)).toBeGreaterThan(0);
  await page.evaluate(() => window.animator.update(0.6));
  await expect(page.locator('#score-display')).toHaveText('128');
});

test('overlapping awards and placement points are counted once; restart cancels pending awards', async ({ page }) => {
  await page.evaluate(() => {
    window.animator.add(4);
    window.animator.add(128, window.flightOrigin());
    window.animator.add(300, window.flightOrigin(), { bonus: true, delay: 0.32 });
    window.animator.update(0.5);
    window.animator.add(6);
    window.animator.update(0.5);
    window.animator.update(0.6);
    window.animator.update(0.6);
  });
  await expect(page.locator('#score-display')).toHaveText('438');
  await expect(page.locator('.score-flight')).toHaveCount(0);
  await page.evaluate(() => {
    window.animator.add(208, window.flightOrigin(), { combo: 2 });
    window.animator.update(0.2);
    window.animator.reset();
    window.animator.add(3);
    window.animator.update(2);
  });
  await expect(page.locator('#score-display')).toHaveText('3');
  await expect(page.locator('.score-flight')).toHaveCount(0);
});

for (const preference of ['system', 'game']) {
  test(`${preference} reduced motion keeps the award readable without a flight`, async ({ page }) => {
    if (preference === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
    else await page.evaluate(() => { window.gentle = true; });
    await page.evaluate(() => { window.animator.add(208, window.flightOrigin(), { combo: 2 }); window.animator.update(0.15); });
    await expect(page.locator('.score-flight-label')).toHaveText('COMBO ×2');
    const start = (await page.locator('.score-flight').boundingBox())!;
    await page.evaluate(() => window.animator.update(0.15));
    const end = (await page.locator('.score-flight').boundingBox())!;
    expect(end.y).toBeCloseTo(start.y, 1);
    await page.evaluate(() => { window.animator.update(0.1); window.animator.update(0.6); });
    await expect(page.locator('#score-display')).toHaveText('208');
    await expect(page.locator('.score-flight')).toHaveCount(0);
  });
}

test('large scores fit a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(async () => { window.animator.reset(123456789); await document.fonts.ready; });
  const score = (await page.locator('#score-display').boundingBox())!;
  expect(score.x).toBeGreaterThanOrEqual(0);
  expect(score.x + score.width).toBeLessThanOrEqual(320);
});
