// GameDistribution SDK integration. The SDK is optional: without it the game
// simply continues immediately.

interface GameDistributionSdk {
  showAd(): Promise<unknown>;
}

declare global {
  interface Window {
    gdsdk?: GameDistributionSdk;
    onGameDistributionEvent?: (event: { name: string } | null | undefined) => void;
  }
}

export interface AdHandlers {
  pause(): void;
  resume(): void;
}

/** Pauses the game loop and audio while the portal shows an advertisement. */
export function listenForAdEvents(handlers: AdHandlers): void {
  window.onGameDistributionEvent = event => {
    if (!event) return;
    if (event.name === 'SDK_GAME_PAUSE') handlers.pause();
    else if (event.name === 'SDK_GAME_START') handlers.resume();
  };
}

/** Shows an interstitial if the SDK is present; always calls `done` afterwards. */
export function showInterstitialAd(done: () => void): void {
  const sdk = window.gdsdk;
  if (typeof sdk?.showAd !== 'function') {
    done();
    return;
  }
  sdk.showAd()
    .then(done)
    .catch(error => {
      console.warn('GD Interstitial notice:', error);
      done();
    });
}
