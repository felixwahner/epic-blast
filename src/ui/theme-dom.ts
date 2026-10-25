import type { Theme } from '../theme/themes.ts';
import { sceneURL } from '../theme/world-art.ts';

/** Cross-fades the world scenery and updates the CSS world colors. */
export function applyTheme(theme: Theme, container: HTMLElement, worldLabel: HTMLElement): void {
  crossFadeScenery(container, theme);
  // Blurred copy of the same scene fills the page around the game column on wide screens.
  let backdrop = document.getElementById('page-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'page-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.prepend(backdrop);
  }
  crossFadeScenery(backdrop, theme);
  const root = document.documentElement.style;
  root.setProperty('--world-primary', theme.primary);
  root.setProperty('--world-secondary', theme.secondary);
  root.setProperty('--world-intensity', String(0.45 + theme.stage * 0.2));
  worldLabel.textContent = theme.name;
}

function crossFadeScenery(host: HTMLElement, theme: Theme): void {
  const scene = host.querySelector<HTMLElement>(':scope > .world-scenery');
  if (scene && scene.dataset.world === String(theme.index)) return;
  const next = document.createElement('div');
  next.className = 'world-scenery';
  next.setAttribute('aria-hidden', 'true');
  next.dataset.world = String(theme.index);
  const url = sceneURL(theme.slug);
  if (url) next.style.setProperty('--scene-image', `url("${url}")`);
  host.prepend(next);
  requestAnimationFrame(() => next.classList.add('scene-visible'));
  if (scene) {
    scene.classList.remove('scene-visible');
    setTimeout(() => scene.remove(), 750);
  }
}
