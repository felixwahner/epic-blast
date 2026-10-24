import type { Page } from '@playwright/test';
import type { AudioEngine } from '../../src/audio/audio-engine.ts';
import { computeLayout } from '../../src/render/layout.ts';

/** Board/tray geometry of the live canvas, using the game's own layout math. */
export async function canvasLayout(page: Page) {
  const box = (await page.locator('#pixi-view canvas').boundingBox())!;
  return { box, layout: computeLayout(box.width, box.height) };
}

/** Collects uncaught page errors and asset load failures. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && /load failed/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

declare global {
  interface Window {
    /** Exposed by src/main.ts. */
    audio?: AudioEngine;
  }
}
