export interface ComboSoundProfile {
  root: number;
  /** Number of extra layers, 0..4. */
  stage: number;
  /** Big rhythmic accent every 25 combos from 50 on. */
  milestone: boolean;
}

// Fixed positive register; escalation comes from layers and rhythm.
export function comboSoundProfile(combo: number): ComboSoundProfile {
  return {
    root: 261.63,
    stage: combo >= 40 ? 4 : combo >= 20 ? 3 : combo >= 10 ? 2 : combo >= 4 ? 1 : 0,
    milestone: combo >= 50 && combo % 25 === 0,
  };
}
