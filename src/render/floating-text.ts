import { Text, TextStyle, type Container } from 'pixi.js';

interface FloatingText {
  text: Text;
  fitScale: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** Bouncy arcade call-outs such as "LEVEL 3!" or the new world name. */
export class FloatingTexts {
  private readonly items: FloatingText[] = [];
  private readonly layer: Container;
  private readonly reduced: () => boolean;

  constructor(layer: Container, reduced: () => boolean) {
    this.layer = layer;
    this.reduced = reduced;
  }

  spawn(x: number, y: number, message: string, fill: string, fontSize: number, viewWidth: number): void {
    const style = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontWeight: '900',
      fontStyle: 'italic',
      fontSize,
      fill,
      stroke: '#000000',
      strokeThickness: 5,
      dropShadow: true,
      dropShadowColor: fill,
      dropShadowBlur: 12,
      dropShadowDistance: 3,
      align: 'center',
    });
    const text = new Text(message, style);
    text.anchor.set(0.5);
    text.position.set(x, y);
    const fitScale = Math.min(1, (viewWidth - 36) / Math.max(1, text.width * 1.6));
    text.scale.set(fitScale * 1.6);
    this.layer.addChild(text);
    this.items.push({ text, fitScale, vy: -55, life: 0, maxLife: 0.9 });
  }

  update(dt: number): void {
    const reduced = this.reduced();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        item.text.destroy(true);
        this.items.splice(i, 1);
        continue;
      }
      item.text.y += item.vy * dt;
      const progress = item.life / item.maxLife;
      item.text.alpha = 1 - progress * progress;
      item.text.scale.set(item.fitScale * (reduced ? 1 : 1 + 0.6 * Math.exp(-8 * progress) * Math.cos(progress * 17)));
      item.text.rotation = reduced ? 0 : Math.sin(progress * 14) * 0.025 * (1 - progress);
    }
  }

  clear(): void {
    for (const item of this.items) item.text.destroy(true);
    this.items.length = 0;
  }
}
