// One brief, non-interactive achievement banner per move.
import type { CelebrationKind } from '../core/session.ts';
import { t, type MessageKey } from '../i18n/index.ts';

/** Translation key of each banner. */
export const CELEBRATION_LABELS: Record<CelebrationKind, MessageKey> = {
  blockbuster: 'celebration.blockbuster',
  triple: 'celebration.triple',
  clean: 'celebration.clean',
  escape: 'celebration.escape',
  room: 'celebration.room',
  perfect: 'celebration.perfect',
  brilliant: 'celebration.brilliant',
  fire: 'celebration.fire',
  unstoppable: 'celebration.unstoppable',
  legendary: 'celebration.legendary',
  finish: 'celebration.finish',
  record: 'celebration.record',
  cross: 'celebration.cross',
  zone: 'celebration.zone',
};

/** Highest priority first. */
export const CELEBRATION_PRIORITY: readonly CelebrationKind[] = [
  'perfect',
  'clean',
  'brilliant',
  'escape',
  'record',
  'blockbuster',
  'legendary',
  'unstoppable',
  'fire',
  'finish',
  'zone',
  'cross',
  'triple',
  'room',
];

export const CELEBRATION_COOLDOWN_MS = 6500;
const BANNER_MS = 1250;

/** Chooses the most important celebration that is not on cooldown. Pure. */
export function pickCelebration(
  events: readonly CelebrationKind[],
  now: number,
  lastShown: ReadonlyMap<CelebrationKind, number>,
): CelebrationKind | null {
  return (
    CELEBRATION_PRIORITY.find(
      kind => events.includes(kind) && now - (lastShown.get(kind) ?? -Infinity) > CELEBRATION_COOLDOWN_MS,
    ) ?? null
  );
}

export class Celebrations {
  private readonly lastShown = new Map<CelebrationKind, number>();
  private readonly host: HTMLElement;
  private banner: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  celebrate(events: readonly CelebrationKind[], now = performance.now()): CelebrationKind | null {
    const kind = pickCelebration(events, now, this.lastShown);
    if (!kind) return null;
    this.lastShown.set(kind, now);
    const banner = this.ensureBanner();
    clearTimeout(this.timer);
    banner.className = 'celebration';
    banner.replaceChildren();
    const title = document.createElement('span');
    title.className = 'celebration-title';
    const label = t(CELEBRATION_LABELS[kind]);
    title.setAttribute('aria-label', label);
    for (const [index, letter] of [...label].entries()) {
      const glyph = document.createElement('span');
      glyph.textContent = letter === ' ' ? ' ' : letter;
      glyph.setAttribute('aria-hidden', 'true');
      glyph.style.setProperty('--letter', String(index));
      title.append(glyph);
    }
    banner.append(title);
    banner.dataset.effect = kind;
    void banner.offsetWidth;
    banner.classList.add('celebration-active');
    this.timer = setTimeout(() => banner.classList.remove('celebration-active'), BANNER_MS);
    return kind;
  }

  reset(): void {
    this.lastShown.clear();
    clearTimeout(this.timer);
    this.banner?.classList.remove('celebration-active');
  }

  private ensureBanner(): HTMLElement {
    if (!this.banner) {
      this.banner = document.createElement('div');
      this.banner.className = 'celebration';
      this.banner.setAttribute('role', 'status');
      this.host.append(this.banner);
    }
    return this.banner;
  }
}
