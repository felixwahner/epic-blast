import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STONE_MOTIFS } from '../../src/render/stone-motifs.ts';
import { PALETTE_COUNT, WORLDS, deltaE, extendWorldOrder, themeFor, worldSlug } from '../../src/theme/themes.ts';

describe('themes', () => {
  it('rotates through every world with eclipse variants', () => {
    const names = new Set<string>();
    for (let level = 1; level <= 27; level++) {
      const world = themeFor(level);
      names.add(world.name);
      assert.equal(world.palettes.length, PALETTE_COUNT);
      assert.equal(themeFor(level, 0.34).stage, 1);
      assert.equal(themeFor(level, 0.7).stage, 2);
      for (const palette of world.palettes) assert(palette.base >= 0 && palette.base <= 0xffffff);
    }
    assert.equal(names.size, 27);
  });

  it('keeps each world anchor color and builds saturated neon palettes', () => {
    for (let world = 1; world <= WORLDS.length; world++) {
      assert.equal(themeFor(world).primary, WORLDS[world - 1][1]);
      for (const progress of [0, 0.25, 0.5, 0.75])
        for (const palette of themeFor(world, progress).palettes) {
          const c = [16, 8, 0].map(shift => (palette.base >> shift) & 255);
          assert((Math.max(...c) - Math.min(...c)) / Math.max(...c) > 0.85, 'Neon body requires high saturation');
          assert.equal(palette.hex, '#' + palette.base.toString(16).padStart(6, '0'));
          for (const shift of [16, 8, 0]) {
            const base = (palette.base >> shift) & 255;
            assert(((palette.hi >> shift) & 255) >= base, 'Highlights cannot change channel direction');
            assert(((palette.sh >> shift) & 255) <= base, 'Shadows cannot add a foreign color channel');
          }
        }
    }
  });

  it('never gives a fixed stone colour the look of a world colour', () => {
    for (let world = 1; world <= WORLDS.length * 2; world++) {
      const [first, second, ...fixed] = themeFor(world).palettes.map(palette => palette.hex);
      for (const hex of fixed) {
        assert(
          deltaE(hex, first) >= 12 && deltaE(hex, second) >= 12,
          `${themeFor(world).name}: ${hex} looks like a world colour`,
        );
      }
    }
  });

  it('has a stone motif for every world', () => {
    for (let index = 0; index < WORLDS.length; index++) assert(STONE_MOTIFS[worldSlug(index)], worldSlug(index));
  });

  it('swaps primary and secondary colors on odd eclipse cycles', () => {
    const first = themeFor(1),
      eclipse = themeFor(1 + WORLDS.length);
    assert.equal(eclipse.primary, first.secondary);
    assert.equal(eclipse.name, 'NEON ARCADE · ECLIPSE 1');
  });

  it('opens every game in Neon Arcade and visits each world once per shuffled round', () => {
    for (let seed = 1; seed <= 50; seed++) {
      let state = seed;
      const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
      const order = extendWorldOrder([], WORLDS.length * 4, random);
      assert.equal(order[0], 0);
      for (let start = 0; start < order.length; start += WORLDS.length) {
        assert.equal(new Set(order.slice(start, start + WORLDS.length)).size, WORLDS.length);
      }
      for (let i = 1; i < order.length; i++) assert.notEqual(order[i], order[i - 1], 'A world never follows itself');
    }
  });

  it('extends an order without changing the worlds already played', () => {
    const order = extendWorldOrder([], 1);
    assert.equal(order.length, WORLDS.length);
    const longer = extendWorldOrder(order, WORLDS.length + 1);
    assert.deepEqual(longer.slice(0, order.length), order);
    assert.equal(longer.length, WORLDS.length * 2);
  });

  it('themes follow the given order and carry the world art slug', () => {
    const order = [0, 12, 5];
    assert.equal(themeFor(2, 0, order).name, 'GLITCH DIMENSION');
    assert.equal(themeFor(2, 0, order).slug, 'glitch-dimension');
    assert.equal(worldSlug(0), 'neon-arcade');
    assert.equal(new Set(WORLDS.map((_, index) => worldSlug(index))).size, WORLDS.length);
  });
});
