import { expect, test } from '@playwright/test';

test.describe('in a German browser', () => {
  test.use({ locale: 'de-DE' });

  test('shows the page in German', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.getByRole('button', { name: 'Menü öffnen' }).click();
    await expect(page.getByRole('heading', { name: 'MENÜ' })).toBeVisible();
    await expect(page.locator('#btn-effects')).toHaveText(/^EFFEKTE: /);
  });
});

test.describe('in a Spanish browser', () => {
  test.use({ locale: 'es-ES' });

  test('shows the page in Spanish', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('heading', { name: 'MENÚ' })).toBeVisible();
    await expect(page.locator('#btn-music')).toHaveText(/^(SÍ|NO)$/);
  });
});

test.describe('in an unsupported language', () => {
  test.use({ locale: 'fr-FR' });

  test('falls back to English, unless the URL picks a language', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await page.goto('/?lang=de');
    await expect(page.getByRole('button', { name: 'Menü öffnen' })).toBeVisible();
  });
});
