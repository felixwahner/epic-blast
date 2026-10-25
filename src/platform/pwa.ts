/** Registers the generated service worker and checks for updates on return/reconnect. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('sw.js', document.baseURI), { updateViaCache: 'none' },
      );
      const checkUpdate = (): void => {
        registration.update().catch(error => console.warn('PWA update check failed:', error));
      };
      window.addEventListener('online', checkUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate();
      });
      checkUpdate();
    } catch (error) {
      console.warn('PWA registration failed:', error);
    }
  });
}

/** The browser pieces `enterFullscreenOnFirstTouch` needs, injectable for tests. */
export interface FullscreenEnvironment {
  matchMedia(query: string): { matches: boolean };
  navigator: { standalone?: boolean };
  document: Pick<Document, 'fullscreenEnabled' | 'fullscreenElement' | 'addEventListener'> & {
    documentElement: Pick<HTMLElement, 'requestFullscreen'>;
  };
}

/** The real browser, typed as the environment (`navigator.standalone` is iOS-only). */
export const browserEnvironment = (): FullscreenEnvironment => window as unknown as FullscreenEnvironment;

/** True when the game runs as an installed app rather than in a browser tab. */
export function isInstalledApp(env: Pick<FullscreenEnvironment, 'matchMedia' | 'navigator'>): boolean {
  return env.navigator.standalone === true
    || ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay']
      .some(mode => env.matchMedia(`(display-mode: ${mode})`).matches);
}

/**
 * The manifest asks for fullscreen, but some platforms (desktop Chrome, Safari) open the
 * installed app as a normal window. There we go fullscreen on the first tap, since browsers
 * only allow it after a user gesture. In a browser tab nothing changes.
 */
export function enterFullscreenOnFirstTouch(env: FullscreenEnvironment = browserEnvironment()): void {
  const { document } = env;
  if (!isInstalledApp(env) || env.matchMedia('(display-mode: fullscreen)').matches) return;
  if (!document.fullscreenEnabled || typeof document.documentElement.requestFullscreen !== 'function') return;
  document.addEventListener('pointerdown', () => {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .catch(error => console.warn('Fullscreen request failed:', error));
  }, { once: true, capture: true });
}
