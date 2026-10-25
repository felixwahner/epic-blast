// The close button in the header, shown only when the game runs as an installed app,
// where there is no browser tab or toolbar to close it with.
import { closeApp } from '../platform/app-close.ts';
import { t } from '../i18n/index.ts';
import { browserEnvironment, isInstalledApp } from '../platform/pwa.ts';
import { byId } from './hud.ts';

export function setupCloseAppButton(): void {
  const button = byId<HTMLButtonElement>('btn-close-app');
  if (!isInstalledApp(browserEnvironment())) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (!window.confirm(t('closeApp.confirm'))) return;
    const closed = await closeApp(window);
    if (!closed) window.alert(t('closeApp.unsupported'));
  });
}
