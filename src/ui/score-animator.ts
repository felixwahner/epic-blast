// The game awards points immediately; the HUD receives clear bonuses on arrival.
import { formatNumber, t as translate } from '../i18n/index.ts';

export interface ScoreFlightOptions {
  /** Seconds before the award appears (synchronised with the detonation). */
  delay?: number;
  combo?: number;
  bonus?: boolean;
}

export interface ScoreAnimator {
  /** Adds points. Without an origin they count up immediately; with one they fly to the HUD first. */
  add(points: number, origin?: { x: number; y: number } | null, options?: ScoreFlightOptions): void;
  update(dt: number): void;
  reset(value?: number): void;
  resize(): void;
}

interface Flight {
  node: HTMLElement;
  points: number;
  age: number;
  x: number;
  y: number;
  side: number;
}

export function createScoreAnimator(
  element: HTMLElement,
  { host, reducedMotion }: { host: HTMLElement; reducedMotion: () => boolean },
): ScoreAnimator {
  const layer = document.createElement('div');
  layer.className = 'score-flight-layer';
  layer.setAttribute('aria-hidden', 'true');
  host.append(layer);

  const flights: Flight[] = [];
  let target = 0;
  let displayed = 0;
  let lastText = '';
  let impact: Animation | undefined;
  let bounds = layer.getBoundingClientRect();
  let destination = { x: 0.5, y: 0 };
  /** Positions are re-read only after a resize or when the score grows a digit. */
  let measured = false;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const gentle = () => reducedMotion() || motionPreference.matches;

  function measure() {
    measured = true;
    bounds = layer.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    destination = {
      x: (rect.left + rect.width / 2 - bounds.left) / bounds.width,
      y: (rect.top + rect.height / 2 - bounds.top) / bounds.height,
    };
  }

  function render() {
    // The big score reads as one block of digits, without grouping separators.
    const text = String(Math.floor(displayed));
    if (text === lastText) return;
    if (text.length !== lastText.length) measured = false;
    element.textContent = lastText = text;
    element.style.setProperty('--score-chars', String(text.length));
  }

  function receive(points: number, emphatic: boolean) {
    target += points;
    impact?.cancel();
    const reduced = gentle();
    impact = element.animate(
      reduced
        ? [{ color: '#ffffff' }, { color: '#fff2ac' }]
        : [
            { transform: 'scale(1)', color: '#ffffff' },
            { transform: `scale(${emphatic ? 1.18 : 1.04})`, color: '#ffffff', offset: 0.22 },
            { transform: 'scale(1)', color: '#fff2ac' },
          ],
      { duration: reduced ? 180 : emphatic ? 440 : 180, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
  }

  function add(
    points: number,
    origin?: { x: number; y: number } | null,
    { delay = 0, combo = 0, bonus = false }: ScoreFlightOptions = {},
  ) {
    if (!origin) {
      receive(points, false);
      return;
    }
    if (!measured) measure();
    const node = document.createElement('div');
    node.className = `score-flight${bonus ? ' score-flight--bonus' : ''}`;
    if (bonus || combo >= 2) {
      const label = document.createElement('span');
      label.className = 'score-flight-label';
      label.textContent = bonus ? translate('flight.allClear') : translate('flight.combo', { combo });
      node.append(label);
    }
    const amount = document.createElement('span');
    amount.className = 'score-flight-amount';
    amount.textContent = `+${formatNumber(points)}`;
    node.append(amount);
    layer.append(node);
    flights.push({
      node,
      points,
      age: -delay,
      x: Math.max(0.2, Math.min(0.8, (origin.x - bounds.left) / bounds.width)),
      y: Math.max(0.14, Math.min(0.88, (origin.y - bounds.top) / bounds.height)),
      side: bonus ? -1 : 1,
    });
  }

  function update(dt: number) {
    const reduced = gentle();
    for (let i = flights.length - 1; i >= 0; i--) {
      const flight = flights[i];
      flight.age += dt;
      if (flight.age < 0) continue;
      const duration = reduced ? 0.38 : 0.94;
      if (flight.age >= duration) {
        flight.node.remove();
        flights.splice(i, 1);
        receive(flight.points, true);
        continue;
      }
      const travel = Math.max(0, Math.min(1, (flight.age - 0.26) / 0.68));
      // An accelerating, curved flight leaves time to read the award first.
      const t = travel * travel;
      const x = (flight.x + (destination.x - flight.x) * t) * bounds.width + Math.sin(t * Math.PI) * 32 * flight.side;
      const y =
        (flight.y + (destination.y - flight.y) * t) * bounds.height - Math.min(flight.age / 0.26, 1) * 10 * (1 - t);
      const reveal = Math.min(flight.age / 0.12, 1);
      const scale = reduced ? 1 : (0.85 + 0.15 * (1 - (1 - reveal) ** 3)) * (1 - 0.62 * t);
      flight.node.style.transform = `translate(${reduced ? flight.x * bounds.width : x}px, ${reduced ? flight.y * bounds.height : y}px) translate(-50%, -50%) scale(${scale})`;
      flight.node.style.opacity = String(
        reduced ? Math.min(1, reveal * 2, (duration - flight.age) / 0.1) : Math.min(reveal, (1 - travel) / 0.12),
      );
      flight.node.classList.toggle('score-flight--travel', !reduced && travel > 0);
      const label = flight.node.firstElementChild as HTMLElement | null;
      if (label?.classList.contains('score-flight-label')) label.style.opacity = String(1 - Math.min(1, travel * 4));
    }

    displayed += (target - displayed) * (1 - Math.exp(-14 * dt));
    if (target - displayed < 0.5) displayed = target;
    render();
  }

  function reset(value = 0) {
    for (const flight of flights) flight.node.remove();
    flights.length = 0;
    impact?.cancel();
    target = displayed = value;
    render();
  }

  reset();
  return { add, update, reset, resize: measure };
}
