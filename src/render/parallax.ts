// Pure lean state for the board's parallax, kept free of Pixi so it can be unit tested.

/** Seconds without input before the board eases back to flat. */
export const IDLE_DELAY = 1.5;
/** Seconds the hand-over from finger to flat takes. */
const IDLE_BLEND = 1;
/** Time constant of the follow, in seconds. */
const FOLLOW = 0.25;

/**
 * Lean of the board, each axis in [-1, 1]. It follows the latest pointer and,
 * once the player stops moving, eases back to flat; it never moves on its own.
 */
export class Parallax {
  x = 0;
  y = 0;
  private targetX = 0;
  private targetY = 0;
  private idle = Infinity;

  /** `nx`/`ny` are the pointer's position relative to the board, -1 at one edge and 1 at the other. */
  point(nx: number, ny: number): void {
    this.targetX = clamp(nx);
    this.targetY = clamp(ny);
    this.idle = 0;
  }

  /** Advances by `dt` seconds. With `still` set the board eases back to flat and stays there. */
  update(dt: number, still = false): void {
    this.idle += dt;
    const follow = still ? 0 : 1 - Math.min(1, Math.max(0, this.idle - IDLE_DELAY) / IDLE_BLEND);
    const k = 1 - Math.exp(-dt / FOLLOW);
    this.x += (this.targetX * follow - this.x) * k;
    this.y += (this.targetY * follow - this.y) * k;
  }
}

const clamp = (v: number): number => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
