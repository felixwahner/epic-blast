import { expect, test } from '@playwright/test';
import { canvasLayout, collectErrors } from './helpers.ts';

test('loads the renderer, materials, options and a playable tray', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('#pixi-view canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#score-display')).toHaveText('0');
  await page.screenshot({ path: `test-results/${info.project.name}-game.png`, fullPage: true });

  await page.getByRole('button', { name: 'Optionen öffnen' }).click();
  await expect(page.locator('#options-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Optionen schließen' }).click();
  await expect(page.locator('#options-menu')).not.toBeVisible();

  const { box, layout } = await canvasLayout(page);
  // Pick the first tray shape and drop it near the board center, where every catalog shape fits.
  await page.mouse.move(box.x + box.width / 6, box.y + layout.trayY + layout.trayHeight / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + layout.gridX + layout.gridWidth / 2, box.y + layout.gridY + layout.gridWidth * 0.58 + 80, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#score-display')).not.toHaveText('0');
  await page.screenshot({ path: `test-results/${info.project.name}-placed.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('remembers option toggles across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Optionen öffnen' }).click();
  await page.locator('#btn-effects').click();
  await expect(page.locator('#btn-effects')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btn-vibration').click();
  await expect(page.locator('#btn-vibration')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/reduced-effects/);
  await expect(page.locator('#btn-effects')).toHaveText('EFFEKTE: WENIG');
  await expect(page.locator('#btn-vibration')).toHaveAttribute('aria-pressed', 'false');
});
