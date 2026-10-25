// A pointing hand that drags from a tray slot to the board, shown until the
// first piece is picked up in the very first game.
import type { Point } from '../render/drag.ts';

export class TutorialHand {
  private element: HTMLElement | null = null;
  private readonly host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  get visible(): boolean {
    return this.element !== null;
  }

  /** Points are in view coordinates of the Pixi canvas, which fills `host`. */
  show(from: Point, to: Point): void {
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.className = 'tutorial-hand';
      this.element.setAttribute('aria-hidden', 'true');
      this.element.innerHTML = '<span class="tutorial-hand__icon">👆</span>';
      this.host.appendChild(this.element);
    }
    const style = this.element.style;
    style.setProperty('--from-x', `${from.x}px`);
    style.setProperty('--from-y', `${from.y}px`);
    style.setProperty('--to-x', `${to.x}px`);
    style.setProperty('--to-y', `${to.y}px`);
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
  }
}
