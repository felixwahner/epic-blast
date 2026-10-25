import { BLEND_MODES, Graphics } from 'pixi.js';
import type { Layout } from './layout.ts';

/**
 * Brief additive light over the board when a piece lands or lines clear. Drawn by
 * Pixi: a CSS filter on the element holding the canvas made the browser composite
 * the whole canvas through an extra pass for every frame of the flash.
 */
export class BoardFlash {
  readonly graphics = new Graphics();
  private time = 0;
  private duration = 0;
  private peak = 0;
  /** Share of the duration spent fading in. */
  private rise = 0.4;

  constructor() {
    this.graphics.blendMode = BLEND_MODES.ADD;
    this.graphics.visible = false;
  }

  relayout(layout: Layout): void {
    this.graphics.clear();
    this.graphics.beginFill(0xffffff);
    this.graphics.drawRect(layout.gridX, layout.gridY, layout.gridWidth, layout.gridWidth);
    this.graphics.endFill();
  }

  flash(peak: number, duration: number, rise = 0.4): void {
    this.time = 0;
    this.duration = duration;
    this.peak = peak;
    this.rise = rise;
    this.graphics.alpha = 0;
    this.graphics.visible = true;
  }

  update(dt: number): void {
    if (!this.graphics.visible) return;
    this.time += dt;
    if (this.time >= this.duration) {
      this.graphics.visible = false;
      return;
    }
    const t = this.time / this.duration;
    this.graphics.alpha = this.peak * (t < this.rise ? t / this.rise : (1 - t) / (1 - this.rise));
  }

  stop(): void {
    this.graphics.visible = false;
  }
}
