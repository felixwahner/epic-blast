// The close button in the header, shown only when the game runs as an installed app,
// where there is no browser tab or toolbar to close it with.
import { closeApp } from '../platform/app-close.ts';
import { browserEnvironment, isInstalledApp } from '../platform/pwa.ts';
import { byId } from './hud.ts';

export function setupCloseAppButton(): void {
  const button = byId<HTMLButtonElement>('btn-close-app');
  if (!isInstalledApp(browserEnvironment())) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (!window.confirm('App schließen? Die laufende Runde geht dabei verloren.')) return;
    const closed = await closeApp(window);
    if (!closed)
      window.alert(
        'Dein Gerät erlaubt das Schließen aus dem Spiel heraus nicht. Wische zum Schließen vom unteren Rand nach oben oder nutze die App-Übersicht.',
      );
  });
}
