// The world collection: every world as a card, locked ones with the lines still
// needed. Tapping an unlocked world makes it the opening world of new games.
import { isUnlocked, unlockLines, unlockedWorlds, type WorldCollection } from '../core/collection.ts';
import { WORLDS, worldSlug } from '../theme/themes.ts';
import { sceneURL } from '../theme/world-art.ts';
import { byId } from './hud.ts';

export interface GalleryHandlers {
  collection(): WorldCollection;
  /** Makes `index` the opening world; returns whether the current game switched to it too. */
  choose(index: number): boolean;
  /** Called once the gallery is open, so fresh unlocks count as seen. */
  opened(): void;
}

export class WorldGallery {
  readonly dialog = byId<HTMLDialogElement>('world-gallery');
  private readonly grid = byId('world-grid');
  private readonly summary = byId('gallery-summary');
  private readonly handlers: GalleryHandlers;
  private note = '';

  constructor(handlers: GalleryHandlers, triggers: readonly HTMLElement[]) {
    this.handlers = handlers;
    for (const trigger of triggers) trigger.addEventListener('click', () => this.open());
    byId('btn-close-gallery').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        this.dialog.close();
    });
    this.grid.addEventListener('click', event => {
      const card = (event.target as HTMLElement).closest<HTMLElement>('.world-card');
      if (!card || card.classList.contains('locked')) return;
      const index = Number(card.dataset.index);
      const now = this.handlers.choose(index);
      this.note = now
        ? `${WORLDS[index][0]} ist jetzt deine Startwelt.`
        : `${WORLDS[index][0]} eröffnet ab dem nächsten Spiel.`;
      this.render();
    });
  }

  open(): void {
    this.note = '';
    this.render();
    // Another overlay (options, game over) may still be on screen.
    for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
      if (dialog !== this.dialog) dialog.close();
    if (!this.dialog.open) this.dialog.showModal();
    this.handlers.opened();
  }

  private render(): void {
    const collection = this.handlers.collection();
    const unlocked = unlockedWorlds(collection, WORLDS.length).length;
    this.summary.textContent =
      this.note ||
      `${unlocked} / ${WORLDS.length} Welten · ${collection.lines.toLocaleString('de-DE')} Linien insgesamt`;
    this.grid.replaceChildren(
      ...WORLDS.map(([name, primary], index) => {
        const open = isUnlocked(collection, index);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'world-card';
        card.dataset.index = String(index);
        card.style.setProperty('--card-color', primary);
        card.classList.toggle('locked', !open);
        card.classList.toggle('start', collection.start === index);
        const url = sceneURL(worldSlug(index));
        const art = document.createElement('span');
        art.className = 'world-card__art';
        if (url) art.style.backgroundImage = `url("${url}")`;
        const label = document.createElement('span');
        label.className = 'world-card__name';
        label.textContent = name;
        const status = document.createElement('span');
        status.className = 'world-card__status';
        if (!open) status.textContent = `🔒 ${unlockLines(index) - collection.lines} LINIEN`;
        else if (collection.start === index) status.textContent = '▶ START';
        else if (collection.fresh.includes(index)) status.textContent = '★ NEU';
        card.append(art, label, status);
        card.setAttribute(
          'aria-label',
          open ? `${name}${collection.start === index ? ', Startwelt' : ''}` : `${name}, gesperrt`,
        );
        if (!open) card.setAttribute('aria-disabled', 'true');
        return card;
      }),
    );
  }
}
