import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { boardMaterialTiles, clearHighlightRects } from '../../src/render/board-geometry.ts';
import { CHARGE_TIME, detonationTime, fragmentProjection } from '../../src/render/clear-animation.ts';
import { dragLift, dragPlacement, hitTestTray } from '../../src/render/drag.ts';
import { jewelColor } from '../../src/render/jewel-surface.ts';
import { computeLayout, slotCenter, type Layout } from '../../src/render/layout.ts';
import { ScreenShake } from '../../src/render/screen-shake.ts';

const fixedLayout = { ...computeLayout(400, 700), gridX: 12, gridY: 20, cellSize: 40, gridWidth: 320 } satisfies Layout;

describe('layout', () => {
  for (const [w, h] of [
    [390, 844],
    [1100, 1000],
    [320, 568],
    [768, 1024],
    [1920, 600],
  ]) {
    it(`fits board and tray into ${w}x${h}`, () => {
      const l = computeLayout(w, h);
      assert.equal(l.gridWidth, l.cellSize * 8);
      assert(l.gridX >= 26 - 1, 'side padding');
      assert(l.gridX + l.gridWidth <= w);
      assert(l.gridY >= 12);
      assert(l.trayY > l.gridY + l.gridWidth);
      assert(Math.abs(l.gridX * 2 + l.gridWidth - w) <= 1, 'horizontally centered');
      assert(l.trayScale > 0 && l.trayScale <= 0.56);
      assert(5 * l.cellSize * l.trayScale <= l.slotWidth - 16 + 1e-9, 'five-cell pieces fit a slot');
    });
  }

  it('centers tray slots under the board thirds', () => {
    const l = computeLayout(390, 844);
    const centers = [0, 1, 2].map(slot => slotCenter(l, slot).x);
    assert(Math.abs(centers[1] - (l.gridX + l.gridWidth / 2)) < 1e-9);
    assert(Math.abs(centers[2] - centers[1] - l.slotWidth) < 1e-9);
  });
});

describe('drag geometry', () => {
  it('keeps tall and growing pieces 32px above the finger', () => {
    for (const cellSize of [24, 32, 40, 48, 56])
      for (const height of [1, 2, 3, 4, 5]) {
        const fingerY = 500;
        const top = fingerY - (height * cellSize) / 2 - dragLift(height, cellSize);
        assert(top + height * cellSize <= fingerY - 32);
        for (const scale of [0.56, 0.8, 1]) {
          const visualTop = top + (height * cellSize * (1 - scale)) / 2;
          assert(visualTop + height * cellSize * scale <= fingerY - 32);
        }
      }
    assert.equal(dragLift(1, 40), 72);
    assert.equal(dragLift(5, 40), 132);
  });

  it('snaps the dragged piece to the nearest cell', () => {
    const l = fixedLayout;
    // A 1x1 piece lifted 72px: pointer at cell (3, 2) center + lift.
    const pointer = { x: l.gridX + 3.5 * 40, y: l.gridY + 2.5 * 40 + 72 };
    const placement = dragPlacement(l, pointer, 1, 1, 1);
    assert.deepEqual([placement.col, placement.row], [3, 2]);
    assert.deepEqual(placement.visual, placement.anchor, 'full scale draws at the anchor');
    const shrunk = dragPlacement(l, pointer, 2, 1, 0.5);
    assert(shrunk.visual.x > shrunk.anchor.x, 'smaller pieces are centred inside the full footprint');
  });

  it('gives touch input the whole slot but mouse input only the piece', () => {
    const l = fixedLayout;
    const pieces = [
      { slot: 0, x: 40, y: l.trayY + 30, width: 20, height: 20 },
      { slot: 2, x: 260, y: l.trayY + 30, width: 20, height: 20 },
    ];
    const slotEdge = { x: l.gridX + 2, y: l.trayY + 5 };
    assert.equal(hitTestTray(l, pieces, slotEdge, true), 0);
    assert.equal(hitTestTray(l, pieces, slotEdge, false), null);
    assert.equal(hitTestTray(l, pieces, { x: 50, y: l.trayY + 40 }, false), 0);
    const emptyMiddle = { x: l.gridX + l.slotWidth * 1.5, y: l.trayY + 40 };
    assert.equal(hitTestTray(l, pieces, emptyMiddle, true), null, 'an empty slot never selects a neighbour');
    assert.equal(
      hitTestTray(l, pieces, { x: l.gridX + l.slotWidth * 2, y: l.trayY + 40 }, true),
      2,
      'exclusive right edge',
    );
  });
});

describe('board geometry', () => {
  it('places 64 varied material tiles on the grid', () => {
    const tiles = boardMaterialTiles(fixedLayout, 49);
    assert.equal(tiles.length, 64);
    assert(new Set(tiles.map(t => t.variant)).size > 15);
    assert.deepEqual([tiles[63].x, tiles[63].y, tiles[63].size], [293, 301, 38]);
  });

  it('draws five halo layers per distinct cell and no row-sized rectangle', () => {
    const rects = clearHighlightRects({ rows: [2], cols: [4] }, fixedLayout);
    assert.equal(rects.length, 75);
    assert(rects.every(rect => rect.width < 60 && rect.height < 60));
    assert.equal(clearHighlightRects({ rows: [], cols: [] }, fixedLayout).length, 0);
  });
});

describe('clear animation', () => {
  it('detonates outward from the epicenter', () => {
    assert.equal(detonationTime(0, 0, { x: 0, y: 0 }), CHARGE_TIME);
    assert(detonationTime(100, 0, { x: 0, y: 0 }) > CHARGE_TIME);
    assert.equal(detonationTime(-100, 0, { x: 0, y: 0 }), detonationTime(100, 0, { x: 0, y: 0 }));
    assert.equal(detonationTime(50, 50, null), CHARGE_TIME);
  });

  it('keeps fragment perspective bounded', () => {
    for (const depth of [-0.42, 0, 0.78])
      for (const age of [0, 0.2, 0.8]) {
        const scale = fragmentProjection(age, depth, 8);
        assert(scale.x > 0 && scale.y > 0 && scale.y < 2);
      }
  });
});

describe('jewel shading', () => {
  it('keeps white specular highlights, saturated faces and dark bevels', () => {
    for (const color of [0x12ffff, 0xff12c0, 0x9020ff]) {
      const dark = jewelColor(0.2, color),
        body = jewelColor(0.72, color),
        light = jewelColor(1, color, 1);
      assert(Math.max(...dark) < 80, 'lower bevel remains dark');
      assert((Math.max(...body) - Math.min(...body)) / Math.max(...body) > 0.75, 'face remains saturated');
      assert(Math.min(...light) > 245, 'specular reflection stays nearly white');
    }
  });

  it('transitions continuously without hard bands', () => {
    for (let step = 1; step <= 1000; step++) {
      const a = jewelColor((step - 1) / 1000, 0xff1290),
        b = jewelColor(step / 1000, 0xff1290);
      assert(b.every((value, index) => Math.abs(value - a[index]) <= 4));
    }
  });
});

describe('screen shake', () => {
  it('caps trauma, decays it and returns to rest', () => {
    const shake = new ScreenShake(() => 1);
    shake.add(0.7);
    shake.add(0.7);
    assert.equal(shake.trauma, 1);
    const first = shake.update(0.1);
    assert(first.x > 0 && first.x <= ScreenShake.MAX_OFFSET);
    for (let i = 0; i < 20; i++) shake.update(0.1);
    assert.deepEqual(shake.update(0.1), { x: 0, y: 0 });
  });
});
