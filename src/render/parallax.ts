// Pure lean state for the board's parallax, kept free of Pixi so it can be unit tested.

/** Seconds without input before the board starts to drift on its own. */
export const IDLE_DELAY = 1.5;
/** Seconds the hand-over from finger to idle drift takes. */
const IDLE_BLEND = 2;
/** Share of the full lean the idle drift reaches. */
const IDLE_AMPLITUDE = 0.45;
/** Time constant of the follow, in seconds. */
const FOLLOW = 0.18;

/**
 * Lean of the board, each axis in [-1, 1]. It follows the latest pointer and,
 * once the player stops moving, hands over to a slow figure-eight drift.
 */
export class Parallax {
  x = 0;
  y = 0;
  private targetX = 0;
  private targetY = 0;
  private idle = Infinity;
  private time = 0;

  /** `nx`/`ny` are the pointer's position relative to the board, -1 at one edge and 1 at the other. */
  point(nx: number, ny: number): void {
    this.targetX = clamp(nx);
    this.targetY = clamp(ny);
    this.idle = 0;
  }

  /** Advances by `dt` seconds. With `still` set the board eases back to flat and stays there. */
  update(dt: number, still = false): void {
    this.time += dt;
    this.idle += dt;
    let tx = 0;
    let ty = 0;
    if (!still) {
      const drift = Math.min(1, Math.max(0, this.idle - IDLE_DELAY) / IDLE_BLEND);
      const t = this.time;
      tx = this.targetX * (1 - drift) + Math.sin(t * 0.5) * IDLE_AMPLITUDE * drift;
      ty = this.targetY * (1 - drift) + Math.sin(t * 0.33) * Math.cos(t * 0.5) * IDLE_AMPLITUDE * drift;
    }
    const k = 1 - Math.exp(-dt / FOLLOW);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }
}

const clamp = (v: number): number => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
