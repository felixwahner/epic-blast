import type { Container, DisplayObject, Graphics } from 'pixi.js';
import type { Palette } from '../theme/themes.ts';
import { detonationTime, fragmentProjection } from './clear-animation.ts';

export interface Particle {
  displayObject: DisplayObject;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  spin?: number;
  depthSpeed?: number;
  tumble?: number;
  /** A held copy of a cleared block, waiting for the detonation wave. */
  charge?: boolean;
}

export const MAX_PARTICLES = 450;

export type GraphicsFactory = () => Graphics;

/** Placement puffs and line-clear shatter debris. Pixi objects come from the injected factory. */
export class ParticleSystem {
  readonly particles: Particle[] = [];
  private readonly layer: Pick<Container, 'addChild'>;
  private readonly reduced: () => boolean;
  private readonly createGraphics: GraphicsFactory;
  private readonly random: () => number;

  constructor(layer: Pick<Container, 'addChild'>, options: { reduced: () => boolean; createGraphics: GraphicsFactory; random?: () => number }) {
    this.layer = layer;
    this.reduced = options.reduced;
    this.createGraphics = options.createGraphics;
    this.random = options.random ?? Math.random;
  }

  private get saturated(): boolean {
    return this.reduced() || this.particles.length > MAX_PARTICLES;
  }

  spawnPuff(cx: number, cy: number, color: number, count = 4): void {
    if (this.saturated) return;
    const rnd = this.random;
    for (let i = 0; i < count; i++) {
      const g = this.createGraphics();
      const s = Math.floor(rnd() * 3 + 3);
      g.beginFill(color);
      if (i % 3 === 0) g.drawPolygon([0, -s * 1.8, s * 0.35, -s * 0.35, s * 1.8, 0, s * 0.35, s * 0.35, 0, s * 1.8, -s * 0.35, s * 0.35, -s * 1.8, 0, -s * 0.35, -s * 0.35]);
      else g.drawRect(-s / 2, -s / 2, s, s);
      g.endFill();
      const angle = rnd() * Math.PI * 2;
      const speed = rnd() * 80 + 30;
      g.x = cx;
      g.y = cy;
      this.layer.addChild(g);
      this.particles.push({ displayObject: g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravity: 80, life: 0, maxLife: 0.25 });
    }
  }

  /** Holds the block until the wave from `epicenter` arrives, then breaks it into tumbling fragments. */
  spawnShatter(cx: number, cy: number, palette: Palette, cellSize: number, epicenter: { x: number; y: number } | null = null, fragmentCount = 12): void {
    if (this.saturated) return;
    const rnd = this.random;
    const delay = detonationTime(cx, cy, epicenter);
    const charge = this.createGraphics();
    const size = cellSize - 4;
    charge.beginFill(palette.base); charge.drawRect(-size / 2, -size / 2, size, size); charge.endFill();
    charge.beginFill(palette.hi); charge.drawRect(-size / 2, -size / 2, size, 3); charge.endFill();
    charge.beginFill(palette.sh); charge.drawRect(-size / 2, size / 2 - 3, size, 3); charge.endFill();
    charge.x = cx;
    charge.y = cy;
    this.layer.addChild(charge);
    this.particles.push({ displayObject: charge, vx: 0, vy: 0, gravity: 0, life: 0, maxLife: delay, charge: true });
    for (let i = 0; i < fragmentCount; i++) {
      const g = this.createGraphics();
      const depthSpeed = (rnd() - 0.35) * 1.2;
      const s = cellSize * (0.12 + rnd() * 0.12);
      const colors = [palette.base, palette.base, palette.hi];
      g.beginFill(colors[i % colors.length]); g.drawRect(-s / 2, -s / 2, s, s); g.endFill();
      g.beginFill(palette.hi); g.drawRect(-s / 2, -s / 2, s, 2); g.endFill();
      g.beginFill(palette.sh); g.drawPolygon([s / 2, -s / 2, s * 0.8, -s * 0.8, s * 0.8, s * 0.2, s / 2, s / 2]); g.endFill();
      g.beginFill(palette.hi); g.drawPolygon([-s / 2, -s / 2, -s * 0.2, -s * 0.8, s * 0.8, -s * 0.8, s / 2, -s / 2]); g.endFill();
      const angle = (epicenter ? Math.atan2(cy - epicenter.y, cx - epicenter.x) : 0) + (rnd() - 0.5) * 3;
      const speed = 90 + rnd() * 160;
      g.x = cx;
      g.y = cy;
      g.visible = false;
      this.layer.addChild(g);
      this.particles.push({
        displayObject: g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 110,
        gravity: 440, life: -delay, spin: (rnd() - 0.5) * 6, depthSpeed, tumble: 5 + rnd() * 7,
        maxLife: 0.65 + rnd() * 0.2,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const object = p.displayObject;
      p.life += dt;
      if (p.life >= p.maxLife) {
        object.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      if (p.life < 0) { object.visible = false; continue; }
      object.visible = true;
      object.rotation += (p.spin ?? 0) * dt;
      p.vy += p.gravity * dt;
      object.x += p.vx * dt;
      object.y += p.vy * dt;
      if (p.charge) {
        const detonating = p.maxLife - p.life < 0.09;
        if (detonating) object.scale.set(1.06);
        object.alpha = detonating ? 1 : 0.9;
      } else {
        object.alpha = Math.min(1, (1 - p.life / p.maxLife) * 2);
        if (p.depthSpeed !== undefined) {
          const projection = fragmentProjection(p.life, p.depthSpeed, p.tumble ?? 0);
          object.scale.set(projection.x, projection.y);
        }
      }
    }
  }

  clear(): void {
    for (const p of this.particles) p.displayObject.destroy();
    this.particles.length = 0;
  }
}
