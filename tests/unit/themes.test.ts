import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PALETTE_COUNT, WORLDS, themeFor } from '../../src/theme/themes.ts';

describe('themes', () => {
  it('rotates through 9 worlds with eclipse variants', () => {
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
      for (const progress of [0, 0.25, 0.5, 0.75]) for (const palette of themeFor(world, progress).palettes) {
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

  it('swaps primary and secondary colors on odd eclipse cycles', () => {
    const first = themeFor(1), eclipse = themeFor(1 + WORLDS.length);
    assert.equal(eclipse.primary, first.secondary);
    assert.equal(eclipse.name, 'NEON ARCADE · ECLIPSE 1');
  });
});
