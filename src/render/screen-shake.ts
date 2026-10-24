/** Trauma model: shake grows with the square of trauma, which decays linearly. */
export class ScreenShake {
  trauma = 0;
  static readonly MAX_OFFSET = 14;
  static readonly DECAY_PER_SECOND = 1.8;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset(): void {
    this.trauma = 0;
  }

  /** Advances the decay and returns the stage offset for this frame. */
  update(dt: number): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    this.trauma = Math.max(0, this.trauma - ScreenShake.DECAY_PER_SECOND * dt);
    const shake = this.trauma * this.trauma * ScreenShake.MAX_OFFSET;
    return { x: (this.random() * 2 - 1) * shake, y: (this.random() * 2 - 1) * shake };
  }
}
