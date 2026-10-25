import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Graphics } from 'pixi.js';
import { MAX_PARTICLES, ParticleSystem } from '../../src/render/particles.ts';

/** Records drawing calls with the same method names as Pixi's Graphics. */
class FakeGraphics {
  x = 0;
  y = 0;
  rotation = 0;
  alpha = 1;
  visible = true;
  destroyed = false;
  clears = 0;
  scale = {
    x: 1,
    y: 1,
    set(x: number, y = x) {
      this.x = x;
      this.y = y;
    },
  };
  beginFill() {
    return this;
  }
  drawRect() {
    return this;
  }
  drawPolygon() {
    return this;
  }
  endFill() {
    return this;
  }
  clear() {
    this.clears++;
    return this;
  }
  destroy() {
    this.destroyed = true;
  }
}

function system(reduced = false) {
  const added: FakeGraphics[] = [];
  const particles = new ParticleSystem(
    {
      addChild: ((g: FakeGraphics) => {
        added.push(g);
        return g;
      }) as never,
    },
    {
      reduced: () => reduced,
      createGraphics: () => new FakeGraphics() as unknown as Graphics,
      random: () => 0.5,
    },
  );
  return { particles, added };
}

const palette = { base: 1, hi: 2, sh: 3, hex: '#000001' };

describe('particle system', () => {
  it('spawns puffs and expires them into the pool', () => {
    const { particles, added } = system();
    particles.spawnPuff(20, 20, 0xffffff, 5);
    assert.equal(particles.particles.length, 5);
    assert.equal(added.length, 5);
    particles.update(0.3);
    assert.equal(particles.particles.length, 0);
    assert(added.every(g => !g.visible && !g.destroyed));
    assert.equal(particles.pool.length, 5);
  });

  it('reuses pooled graphics instead of allocating new ones', () => {
    const { particles, added } = system();
    particles.spawnPuff(20, 20, 0xffffff, 5);
    particles.update(0.3);
    added[0].rotation = 2;
    added[0].alpha = 0.1;
    added[0].scale.set(3);
    particles.spawnPuff(60, 70, 0xffffff, 3);
    assert.equal(added.length, 5, 'no new graphics');
    assert.equal(particles.pool.length, 2);
    const reused = particles.particles.map(p => p.displayObject as unknown as FakeGraphics);
    assert(
      reused.every(
        g =>
          g.visible &&
          g.clears === 1 &&
          g.x === 60 &&
          g.y === 70 &&
          g.rotation === 0 &&
          g.alpha === 1 &&
          g.scale.x === 1,
      ),
    );
  });

  it('holds the block until the detonation wave arrives, then releases fragments', () => {
    const { particles, added } = system();
    particles.spawnShatter(200, 0, palette, 40, { x: 0, y: 0 }, 6);
    assert.equal(particles.particles.length, 7, 'one charge plus six fragments');
    const fragments = added.slice(1);
    assert(
      fragments.every(g => !g.visible),
      'fragments wait for the wave',
    );
    particles.update(0.05);
    assert(fragments.every(g => !g.visible));
    particles.update(0.3);
    assert(!added[0].visible, 'the held block disappears on detonation');
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
    assert(added.every(g => !g.visible));
    assert.equal(particles.pool.length, added.length);
  });
});
