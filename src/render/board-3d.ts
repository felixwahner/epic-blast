// The board drawn in 3D with @pixi/3d: the world's socket art on a plane, and every
// placed block as a rounded stone carrying the game's own block texture on top.
// The camera looks straight down (orthographic), so at rest the board lines up with the
// 2D layout pixel for pixel; parallax leans the whole board a few degrees.
import { Container3D, DirectionalLight, Geometry3D, Material3D, Mesh3D, PlaneGeometry, View3D } from '@pixi/3d';
import { type Container, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { GRID_SIZE, type Grid } from '../core/board.ts';
import type { Palette } from '../theme/themes.ts';
import type { Layout } from './layout.ts';
import { Parallax } from './parallax.ts';
import { roundedBoxData } from './rounded-box.ts';

/** Largest lean of the board, in radians (about 4°). */
export const MAX_LEAN = 0.075;
/** Cells of margin drawn around the grid, for the rim, shadows and the lean. */
const MARGIN = 0.6;
/** Stone body height, in cells. */
const STONE_HEIGHT = 0.36;
/** A sync that fills more cells than this at once is a new or resumed game: no drop-in. */
const MAX_DROPS = 9;
const DROP_TIME = 0.32;

interface Stone {
  group: Container3D;
  body: Mesh3D;
  face: Mesh3D;
  color: number | null;
  /** Seconds since the stone was placed; negative while it waits its turn in the drop. */
  age: number;
}

export class Board3D {
  readonly view: View3D;
  readonly parallax = new Parallax();
  private readonly renderer: Renderer;
  private readonly tilt = new Container3D();
  private readonly boardPlane: Mesh3D;
  private boardMaterial: Material3D;
  private readonly stones: Stone[][];
  private readonly sun: DirectionalLight;
  private bodyMaterials: Material3D[] = [];
  private faceMaterials: Material3D[] = [];
  private boardTexture: Texture | null = null;
  private layout: Layout | null = null;
  private shadows = true;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.view = new View3D({
      environment: { skyColor: 0xc9d4ff, groundColor: 0x2a1840, intensity: 0.55 },
      shadowQuality: 'low',
      toneMapping: 'none',
    });
    // The game listens on the stage; the view must not swallow pointer events.
    this.view.eventMode = 'none';
    const camera = this.view.camera;
    camera.mode = 'orthographic';
    camera.near = 1;
    camera.far = 100;
    // Straight down, screen-up along -z; the tiny z offset fixes the camera's up axis.
    camera.position.set(0, 40, 0.001);
    camera.lookAt({ x: 0, y: 0, z: 0 });

    this.view.root.addChild(this.tilt);
    this.boardMaterial = new Material3D({ baseColor: 0x000000, roughness: 0.55, metallic: 0.1 });
    this.boardPlane = new Mesh3D({
      geometry: new PlaneGeometry({ width: 1, height: 1, flipV: true }),
      material: this.boardMaterial,
      rotation: { x: -Math.PI / 2, y: 0, z: 0 },
      castShadow: false,
      receiveShadow: true,
      parent: this.tilt,
    });

    const box = roundedBoxData(0.94, STONE_HEIGHT, 0.94, 0.12, 4);
    const bodyGeometry = new Geometry3D({
      positions: box.positions,
      normals: box.normals,
      uvs: box.uvs,
      indices: box.indices,
    });
    const faceGeometry = new PlaneGeometry({ width: 1, height: 1, flipV: true });
    this.stones = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (__, c) => {
        const group = new Container3D({ position: cellCenter(r, c), parent: this.tilt });
        group.visible = false;
        const body = new Mesh3D({
          geometry: bodyGeometry,
          position: { x: 0, y: STONE_HEIGHT / 2, z: 0 },
          parent: group,
        });
        const face = new Mesh3D({
          geometry: faceGeometry,
          rotation: { x: -Math.PI / 2, y: 0, z: 0 },
          position: { x: 0, y: STONE_HEIGHT + 0.002, z: 0 },
          castShadow: false,
          parent: group,
        });
        return { group, body, face, color: null, age: Infinity };
      }),
    );

    // Light from the upper left, like the highlights baked into the stone texture.
    this.sun = new DirectionalLight({ color: 0xfff4e6, intensity: 2.4, castShadow: true });
    this.sun.position.set(-5, 8, -4);
    this.sun.lookAt({ x: 0, y: 0, z: 0 });
    const rim = new DirectionalLight({ color: 0xff7ae6, intensity: 0.9 });
    rim.position.set(6, 3, 6);
    rim.lookAt({ x: 0, y: 0, z: 0 });
    this.view.root.addChild(this.sun, rim);
  }

  /** Places the view over the board and sizes the camera so one cell is one world unit. */
  relayout(layout: Layout): void {
    this.layout = layout;
    const cs = layout.cellSize;
    const span = GRID_SIZE + MARGIN * 2;
    this.view.position.set(layout.gridX - MARGIN * cs, layout.gridY - MARGIN * cs);
    this.view.width = span * cs;
    this.view.height = span * cs;
    this.view.camera.orthographicSize = span / 2;
  }

  /**
   * Bakes the 2D board art (sockets, rim) into the board plane's texture, so the 3D board
   * shows exactly the world's material. `art` holds the board's 2D layers in layout space.
   */
  setBoardArt(art: Container): void {
    const layout = this.layout;
    if (!layout || layout.cellSize <= 0) return;
    const cs = layout.cellSize;
    const span = GRID_SIZE + MARGIN * 2;
    const texture = this.renderer.generateTexture({
      target: art,
      frame: new Rectangle(layout.gridX - MARGIN * cs, layout.gridY - MARGIN * cs, span * cs, span * cs),
      resolution: this.renderer.resolution,
    });
    // Lit like the stones (sky fill plus sun add up to about 1), so the art keeps its own
    // brightness and the stones' shadows darken it. An emissive term would only add grey.
    const old = this.boardMaterial;
    this.boardMaterial = new Material3D({
      baseColorTexture: texture,
      // Outside the rim the art is transparent, so the scenery shows around the board.
      alphaMode: 'blend',
      roughness: 0.7,
      metallic: 0,
      // No sky reflection: on near-black art even a 4% reflection reads as a grey veil.
      specular: { factor: 0 },
    });
    this.boardPlane.material = this.boardMaterial;
    old.destroy();
    this.boardPlane.scale.set(span, span, 1);
    this.boardTexture?.destroy(true);
    this.boardTexture = texture;
  }

  /** New block textures (world change or resize): the stones' faces follow. */
  retexture(blocks: readonly Texture[], palettes: readonly Palette[]): void {
    const oldFaces = this.faceMaterials;
    const oldBodies = this.bodyMaterials;
    this.faceMaterials = blocks.map(
      texture =>
        new Material3D({
          baseColorTexture: texture,
          alphaMode: 'mask',
          roughness: 0.32,
          metallic: 0,
          // A weak reflection only: the texture already has its own baked highlights.
          specular: { factor: 0.35 },
        }),
    );
    this.bodyMaterials = palettes.map(p => new Material3D({ baseColor: p.sh, roughness: 0.4, metallic: 0 }));
    for (const row of this.stones) for (const stone of row) if (stone.color !== null) this.paint(stone, stone.color);
    oldFaces.forEach(m => m.destroy());
    oldBodies.forEach(m => m.destroy());
  }

  /** Mirrors the grid. Freshly filled cells drop in when a single piece was placed. */
  sync(grid: Grid, animate: boolean): void {
    const filled: Stone[] = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) {
        const stone = this.stones[r][c];
        const cell = grid[r][c];
        if (cell === null) {
          stone.color = null;
          stone.group.visible = false;
          continue;
        }
        if (stone.color === null) filled.push(stone);
        if (stone.color !== cell) this.paint(stone, cell);
        stone.color = cell;
        stone.group.visible = true;
      }
    const drop = animate && filled.length <= MAX_DROPS;
    filled.forEach((stone, i) => {
      stone.age = drop ? -i * 0.035 : Infinity;
      this.pose(stone);
    });
  }

  /** Points the lean at a pointer position in layout space. */
  point(x: number, y: number): void {
    const layout = this.layout;
    if (!layout || layout.gridWidth <= 0) return;
    const half = layout.gridWidth / 2;
    this.parallax.point((x - layout.gridX - half) / half, (y - layout.gridY - half) / half);
  }

  /** `reduced` turns off the lean, the drop-in and shadows. */
  update(dt: number, reduced: boolean): void {
    if (this.shadows === reduced) {
      this.shadows = !reduced;
      this.sun.castShadow = this.shadows;
    }
    this.parallax.update(dt, reduced);
    // Lean toward the pointer: the near edge dips, so the far sides of the stones show.
    this.tilt.rotation.set(this.parallax.y * MAX_LEAN, 0, -this.parallax.x * MAX_LEAN);
    for (const row of this.stones)
      for (const stone of row) {
        if (stone.age === Infinity) continue;
        stone.age = reduced ? Infinity : stone.age + dt;
        this.pose(stone);
      }
  }

  private paint(stone: Stone, color: number): void {
    const face = this.faceMaterials[color];
    const body = this.bodyMaterials[color];
    if (face) stone.face.material = face;
    if (body) stone.body.material = body;
  }

  /** Drop-in: falls from above, lands with a squash and a small damped bounce. */
  private pose(stone: Stone): void {
    const t = stone.age;
    if (t >= DROP_TIME + 0.4 || t === Infinity) {
      stone.age = Infinity;
      stone.group.position.y = 0;
      stone.group.scale.set(1, 1, 1);
      return;
    }
    if (t < 0) {
      stone.group.position.y = 1.2;
      stone.group.scale.set(1, 1, 1);
      return;
    }
    if (t < DROP_TIME) {
      const k = t / DROP_TIME;
      stone.group.position.y = 1.2 * (1 - k * k);
      stone.group.scale.set(1, 1, 1);
      return;
    }
    const s = t - DROP_TIME;
    const wobble = Math.exp(-s * 10) * Math.cos(s * 24);
    stone.group.position.y = Math.max(0, Math.exp(-s * 10) * Math.sin(s * 24) * 0.08);
    stone.group.scale.set(1 + wobble * 0.06, 1 - wobble * 0.14, 1 + wobble * 0.06);
  }
}

function cellCenter(r: number, c: number): { x: number; y: number; z: number } {
  return { x: c - GRID_SIZE / 2 + 0.5, y: 0, z: r - GRID_SIZE / 2 + 0.5 };
}
