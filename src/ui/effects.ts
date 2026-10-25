// DOM/CSS layer effects (impact rings, clear beams, combo mood) and the
// "reduced effects" preference shared by every visual system.
import { lineCells, type FullLines } from '../core/board.ts';
import { cellsCentroid, type Layout } from '../render/layout.ts';
import { STORAGE_KEYS, safeStorage, type KeyValueStore } from '../platform/storage.ts';

export type ComboMood = 'calm' | 'warm' | 'hot' | 'legend';

export function comboMood(combo: number): ComboMood {
  return combo >= 10 ? 'legend' : combo >= 5 ? 'hot' : combo >= 2 ? 'warm' : 'calm';
}

/** Pulse classes per element, dropped again when the element's animation ends. */
const pulsing = new WeakMap<Element, Set<string>>();

/**
 * Restarts a one-shot CSS animation class. The class is dropped when its animation
 * ends, so the next pulse starts it again without forcing a synchronous layout.
 */
export function pulse(element: Element | null, name: string): void {
  if (!element) return;
  if (element.classList.contains(name)) {
    // Still running: only a reflow restarts it.
    element.classList.remove(name);
    void (element as HTMLElement).offsetWidth;
  }
  element.classList.add(name);
  let names = pulsing.get(element);
  if (!names) {
    const pending = names = new Set<string>();
    pulsing.set(element, pending);
    element.addEventListener('animationend', event => {
      if (event.target !== element) return;
      for (const pulsed of pending) element.classList.remove(pulsed);
      pending.clear();
    });
  }
  names.add(name);
}

export class VisualEffects {
  reduced: boolean;
  private readonly storage: KeyValueStore;

  constructor(storage: KeyValueStore = safeStorage, prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) {
    this.storage = storage;
    const saved = storage.getItem(STORAGE_KEYS.effects);
    this.reduced = saved ? saved === 'reduced' : prefersReducedMotion;
  }

  /** Binds the options toggle and applies the current preference to <body>. */
  bindToggle(button: HTMLElement): void {
    document.body.classList.toggle('reduced-effects', this.reduced);
    const sync = () => {
      button.textContent = this.reduced ? 'EFFEKTE: WENIG' : 'EFFEKTE: VOLL';
      button.setAttribute('aria-pressed', String(this.reduced));
    };
    sync();
    button.addEventListener('click', () => {
      this.reduced = !this.reduced;
      document.body.classList.toggle('reduced-effects', this.reduced);
      this.storage.setItem(STORAGE_KEYS.effects, this.reduced ? 'reduced' : 'full');
      sync();
    });
  }

  updateComboMood(wrapper: HTMLElement, combo: number): void {
    const mood = comboMood(combo);
    if (wrapper.dataset.combo !== mood) wrapper.dataset.combo = mood;
  }

  /** Shockwave rings at the clear's center plus a light beam along every cleared line. */
  lineClear(lines: FullLines, layout: Layout, wrapper: HTMLElement, host: HTMLElement): void {
    if (!this.reduced) {
      const center = cellsCentroid(layout, lineCells(lines));
      const ring = document.createElement('div');
      ring.className = 'impact-ring';
      ring.style.left = `${center.x}px`;
      ring.style.top = `${center.y}px`;
      ring.style.setProperty('--impact', String(Math.min(7, 4 + lines.rows.length + lines.cols.length)));
      const core = document.createElement('div');
      core.className = 'explosion-core';
      core.style.left = ring.style.left;
      core.style.top = ring.style.top;
      wrapper.append(core);
      setTimeout(() => core.remove(), 750);
      for (let wave = 1; wave <= 2; wave++) {
        const echo = ring.cloneNode() as HTMLElement;
        echo.classList.add('echo-ring');
        echo.style.animationDelay = `${wave * 0.09}s`;
        wrapper.append(echo);
        setTimeout(() => echo.remove(), 1100);
      }
      wrapper.append(ring);
      ring.addEventListener('animationend', () => ring.remove(), { once: true });
    }
    for (const [vertical, indices] of [[false, lines.rows], [true, lines.cols]] as const) for (const line of indices) {
      const beam = document.createElement('div');
      beam.className = 'clear-beam' + (vertical ? ' vertical' : '');
      Object.assign(beam.style, {
        left: `${layout.gridX + (vertical ? line * layout.cellSize : 0)}px`,
        top: `${layout.gridY + (vertical ? 0 : line * layout.cellSize)}px`,
        width: `${vertical ? layout.cellSize : layout.gridWidth}px`,
        height: `${vertical ? layout.gridWidth : layout.cellSize}px`,
      });
      host.append(beam);
      beam.addEventListener('animationend', () => beam.remove(), { once: true });
    }
  }
}
