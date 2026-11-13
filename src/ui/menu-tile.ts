// A settings tile in the pause menu: pressed means on, with a short state text such as ON or FULL.
export function setTile(button: HTMLElement, on: boolean, state: string): void {
  button.setAttribute('aria-pressed', String(on));
  const label = button.querySelector('.tile-state');
  if (label) label.textContent = state;
}
