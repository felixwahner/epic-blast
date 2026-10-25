// Closing the installed app from inside the game. Browsers only let a script close a
// window it opened itself or one with a single history entry (a freshly launched app on
// Chrome/Edge); iOS never allows it. Where closing is refused we leave fullscreen instead
// and tell the player how to close the app with the system gesture.

export interface AppCloseEnvironment {
  close(): void;
  readonly closed: boolean;
  setTimeout(fn: () => void, ms: number): unknown;
  document: {
    readonly fullscreenElement: Element | null;
    exitFullscreen(): Promise<void>;
  };
}

/** How long to wait for the window to disappear before assuming the browser refused. */
export const CLOSE_TIMEOUT_MS = 300;

/** Resolves true when the window closed, false when the browser kept it open. */
export function closeApp(env: AppCloseEnvironment): Promise<boolean> {
  try { env.close(); } catch { /* Treated like a refusal below. */ }
  return new Promise(resolve => {
    env.setTimeout(() => {
      if (env.closed) return resolve(true);
      if (env.document.fullscreenElement) env.document.exitFullscreen().catch(() => {});
      resolve(false);
    }, CLOSE_TIMEOUT_MS);
  });
}
