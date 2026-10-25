import { expect, test, type Page } from '@playwright/test';
import { canvasLayout } from './helpers.ts';

const BEST_KEY = 'epic_blast_best_score';

/**
 * Drops the first tray piece near the board center, where every catalog shape fits.
 * The press aims at the middle of the first tray slot: a one-cell-wide piece
 * is too narrow to catch a press anywhere else.
 */
async function placeFirstPiece(page: Page) {
  const { box, layout } = await canvasLayout(page);
  await page.mouse.move(box.x + layout.gridX + layout.gridWidth / 6, box.y + layout.trayY + layout.trayHeight / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + layout.gridX + layout.gridWidth / 2, box.y + layout.gridY + layout.gridWidth * 0.58 + 80, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#score-display')).not.toHaveText('0');
}

test('best score follows a new record and survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#pixi-view canvas')).toBeVisible();
  await expect(page.locator('#best-score-display')).toHaveText('0');
  await placeFirstPiece(page);
  // The score display counts up; wait until it settles on the new best.
  const best = page.locator('#best-score-display');
  await expect(async () => {
    expect(await page.locator('#score-display').textContent()).toBe(await best.textContent());
  }).toPass();
  const score = await best.textContent();
  expect(score).not.toBe('0');
  expect(await page.evaluate(key => localStorage.getItem(key), BEST_KEY)).toBe(score);
  await page.reload();
  await expect(best).toHaveText(score!);
});

// The installed app and a browser tab share localStorage. A record set in one
// window must show up in the other instead of freezing its BEST display.
test('picks up a record set in another window', async ({ context }) => {
  const app = await context.newPage();
  await app.goto('/');
  await expect(app.locator('#pixi-view canvas')).toBeVisible();
  await expect(app.locator('#best-score-display')).toHaveText('0');

  const tab = await context.newPage();
  await tab.goto('/');
  await tab.evaluate(key => localStorage.setItem(key, '5000'), BEST_KEY);
  await expect(app.locator('#best-score-display')).toHaveText('5000');

  await app.bringToFront();
  await placeFirstPiece(app);
  await expect(app.locator('#best-score-display')).toHaveText('5000');
  expect(await app.evaluate(key => localStorage.getItem(key), BEST_KEY)).toBe('5000');
});
