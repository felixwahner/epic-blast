import type { Theme } from '../theme/themes.ts';

/** Cross-fades the world scenery and updates the CSS world colors. */
export function applyTheme(theme: Theme, container: HTMLElement, worldLabel: HTMLElement): void {
  const scene = container.querySelector<HTMLElement>('.world-scenery');
  if (!scene || scene.dataset.world !== String(theme.index)) {
    const next = document.createElement('div');
    next.className = 'world-scenery';
    next.setAttribute('aria-hidden', 'true');
    next.dataset.world = String(theme.index);
    next.style.setProperty('--scene-position', `${theme.index % 3 * 50}% ${Math.floor(theme.index / 3) * 50}%`);
    container.prepend(next);
    requestAnimationFrame(() => next.classList.add('scene-visible'));
    if (scene) {
      scene.classList.remove('scene-visible');
      setTimeout(() => scene.remove(), 750);
    }
  }
  const root = document.documentElement.style;
  root.setProperty('--world-primary', theme.primary);
  root.setProperty('--world-secondary', theme.secondary);
  root.setProperty('--world-intensity', String(0.45 + theme.stage * 0.2));
  worldLabel.textContent = theme.name;
}
