import { expect, test } from '@playwright/test';
import { canvasLayout, collectErrors } from './helpers.ts';

test('loads the renderer, materials, options and a playable tray', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('#pixi-view canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#score-display')).toHaveText('0');
  await page.screenshot({ path: `test-results/${info.project.name}-game.png`, fullPage: true });

  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await expect(page.locator('#options-menu')).toBeVisible();
  await page.getByRole('button', { name: 'Menü schließen' }).click();
  await expect(page.locator('#options-menu')).not.toBeVisible();

  const { box, layout } = await canvasLayout(page);
  // Pick the first tray shape and drop it near the board center, where every catalog shape fits.
  await page.mouse.move(box.x + layout.gridX + layout.gridWidth / 6, box.y + layout.trayY + layout.trayHeight / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + layout.gridX + layout.gridWidth / 2,
    box.y + layout.gridY + layout.gridWidth * 0.58 + 80,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.locator('#score-display')).not.toHaveText('0');
  await page.screenshot({ path: `test-results/${info.project.name}-placed.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('remembers option toggles across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.locator('#btn-effects').click();
  await expect(page.locator('#btn-effects')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btn-vibration').click();
  await expect(page.locator('#btn-vibration')).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/reduced-effects/);
  await expect(page.locator('#btn-effects')).toHaveText('EFFEKTE: WENIG');
  await expect(page.locator('#btn-vibration')).toHaveAttribute('aria-pressed', 'false');
});

test('the header holds only the logo and a menu, which leads to new game', async ({ page }, info) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menü öffnen' });
  const newGame = page.getByRole('button', { name: 'Neues Spiel' });
  await expect(page.locator('#game-header .pixel-btn:visible')).toHaveCount(1);
  // The menu sits in the top-right corner, clear of the logo.
  const [menuBox, logoBox] = [(await menu.boundingBox())!, (await page.locator('.game-logo').boundingBox())!];
  expect(menuBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
  expect(menuBox.y).toBeLessThan(logoBox.y + logoBox.height / 2);
  await expect(newGame).toBeHidden();

  const openNewGame = async () => {
    await menu.click();
    await newGame.click();
    await expect(page.locator('#options-menu')).not.toBeVisible();
  };
  const overlay = page.locator('#restart-confirm');
  await openNewGame();
  await expect(overlay).not.toHaveClass(/hidden/);
  await expect(page.getByRole('alertdialog', { name: 'NEUES SPIEL?' })).toBeVisible();
  await page.screenshot({ path: `test-results/${info.project.name}-restart-confirm.png` });
  await page.getByRole('button', { name: 'WEITERSPIELEN' }).click();
  await expect(overlay).toHaveClass(/hidden/);
  await expect(menu).toBeFocused();

  await openNewGame();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/hidden/);

  await openNewGame();
  await page.getByRole('button', { name: 'NEU STARTEN' }).click();
  await expect(overlay).toHaveClass(/hidden/);
  await expect(page.locator('#score-display')).toHaveText('0');
});
