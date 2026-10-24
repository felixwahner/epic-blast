import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Graphics } from 'pixi.js';
import { MAX_PARTICLES, ParticleSystem } from '../../src/render/particles.ts';

/** Records drawing calls with the same method names as Pixi's Graphics. */
class FakeGraphics {
  x = 0; y = 0; rotation = 0; alpha = 1; visible = true; destroyed = false;
  scale = { x: 1, y: 1, set(x: number, y = x) { this.x = x; this.y = y; } };
  beginFill() { return this; }
  drawRect() { return this; }
  drawPolygon() { return this; }
  endFill() { return this; }
  destroy() { this.destroyed = true; }
}

function system(reduced = false) {
  const added: FakeGraphics[] = [];
  const particles = new ParticleSystem({ addChild: ((g: FakeGraphics) => { added.push(g); return g; }) as never }, {
    reduced: () => reduced, createGraphics: () => new FakeGraphics() as unknown as Graphics, random: () => 0.5,
  });
  return { particles, added };
}

const palette = { base: 1, hi: 2, sh: 3, hex: '#000001' };

describe('particle system', () => {
  it('spawns puffs and expires them', () => {
    const { particles, added } = system();
    particles.spawnPuff(20, 20, 0xffffff, 5);
    assert.equal(particles.particles.length, 5);
    assert.equal(added.length, 5);
    particles.update(0.3);
    assert.equal(particles.particles.length, 0);
    assert(added.every(g => g.destroyed));
  });

  it('holds the block until the detonation wave arrives, then releases fragments', () => {
    const { particles, added } = system();
    particles.spawnShatter(200, 0, palette, 40, { x: 0, y: 0 }, 6);
    assert.equal(particles.particles.length, 7, 'one charge plus six fragments');
    const fragments = added.slice(1);
    assert(fragments.every(g => !g.visible), 'fragments wait for the wave');
    particles.update(0.05);
    assert(fragments.every(g => !g.visible));
    particles.update(0.3);
    assert(added[0].destroyed, 'the held block disappears on detonation');
    assert(fragments.every(g => g.visible));
  });

  it('spawns nothing with reduced effects and caps the total', () => {
    const reduced = system(true);
    reduced.particles.spawnShatter(0, 0, palette, 40);
    reduced.particles.spawnPuff(0, 0, 1);
    assert.equal(reduced.particles.particles.length, 0);

    const busy = system();
    while (busy.particles.particles.length <= MAX_PARTICLES) busy.particles.spawnPuff(0, 0, 1, 10);
    const count = busy.particles.particles.length;
    busy.particles.spawnPuff(0, 0, 1, 10);
    assert.equal(busy.particles.particles.length, count);
  });

  it('clears everything on restart', () => {
    const { particles, added } = system();
    particles.spawnShatter(0, 0, palette, 40);
    particles.clear();
    assert.equal(particles.particles.length, 0);
    assert(added.every(g => g.destroyed));
  });
});
