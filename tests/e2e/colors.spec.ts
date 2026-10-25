import { expect, test } from '@playwright/test';
import { themeFor } from '../../src/theme/themes.ts';
import { canvasLayout } from './helpers.ts';

const hue = ([r, g, b]: number[]) => {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (!d) return 0;
  return ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
};
const rgb = (color: number) => [(color >> 16) & 255, (color >> 8) & 255, color & 255];

test('rendered jewel hues match all eight neon palette colors', async ({ page }) => {
  test.setTimeout(120000); // Eight full page loads.
  for (let color = 0; color < 8; color++) {
    // Each load must deal a fresh tray instead of resuming the previous one.
    await page.addInitScript(
      seed => {
        Math.random = () => seed;
        localStorage.removeItem('epic_blast_saved_game');
      },
      (color + 0.1) / 8,
    );
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const { box, layout } = await canvasLayout(page);
    const screenshot = await page.screenshot();
    const sample = await page.evaluate(
      async ({ encoded, left, top, width, height }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + encoded;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(Math.floor(left), Math.floor(top), Math.floor(width), Math.floor(height)).data;
        const sums = [0, 0, 0];
        let count = 0;
        const saturation: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          const c = [data[i], data[i + 1], data[i + 2]],
            max = Math.max(...c),
            min = Math.min(...c);
          if (max > 130 && max - min > 35) {
            c.forEach((v, j) => {
              sums[j] += v;
            });
            saturation.push((max - min) / max);
            count++;
          }
        }
        saturation.sort((a, b) => a - b);
        return {
          rgb: sums.map(v => v / Math.max(1, count)),
          count,
          saturation: saturation[Math.floor(saturation.length / 2)],
        };
      },
      {
        encoded: screenshot.toString('base64'),
        left: box.x + layout.gridX + 8,
        top: box.y + layout.trayY + 4,
        width: layout.gridWidth - 16,
        height: layout.trayHeight - 8,
      },
    );
    expect(sample.count, `visible color ${color}`).toBeGreaterThan(30);
    expect(sample.saturation, `palette ${color} must look neon, not pastel`).toBeGreaterThan(0.65);
    const expected = rgb(themeFor(1).palettes[color].base),
      delta = Math.abs(hue(sample.rgb) - hue(expected));
    expect(
      Math.min(delta, 360 - delta),
      `palette ${color}: rendered ${sample.rgb.join(',')} expected ${expected.join(',')}`,
    ).toBeLessThan(12);
  }
});
