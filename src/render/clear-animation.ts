// Shared choreography for sound, light and block breakup (seconds).
export const CHARGE_TIME = 0.14;
export const WAVE_SPEED = 1100;

export const detonationTime = (x: number, y: number, origin: { x: number; y: number } | null): number =>
  CHARGE_TIME + (origin ? Math.hypot(x - origin.x, y - origin.y) / WAVE_SPEED : 0);

export function fragmentProjection(age: number, depthSpeed: number, tumble: number): { x: number; y: number } {
  const perspective = 1 / Math.max(0.55, 1 + depthSpeed * age);
  return { x: perspective * (0.65 + 0.35 * Math.abs(Math.cos(age * tumble))), y: perspective };
}
