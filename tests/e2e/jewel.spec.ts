import { expect, test } from '@playwright/test';

test('jewel keeps white top reflections, a dark lower bevel and a rounded silhouette', async ({ page }) => {
  await page.goto('/tests/e2e/harness/jewel.html');
  await page.waitForFunction(() => 'measureJewel' in window);
  const metrics = await page.evaluate(() =>
    (window as unknown as { measureJewel(): Promise<Record<string, number>> }).measureJewel(),
  );
  expect(metrics.faceBrightness).toBeGreaterThan(225);
  expect(metrics.top).toBeGreaterThan(metrics.bottom + 30);
  expect(metrics.center).toBe(255);
  expect(metrics.corner).toBe(0);
});
