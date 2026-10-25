/**
 * EPIC BLAST - Pixi.js HTML5 Edition
 * Faithful Block Blast mechanics with 8-bit / 16-bit pixel art visual juice.
 */
import './styles/main.css';
import { AudioEngine } from './audio/audio-engine.ts';
import { Game } from './game/game.ts';
import { translatePage } from './i18n/index.ts';
import { InstallBanner } from './ui/install-banner.ts';
import { setupCloseAppButton } from './ui/close-app-button.ts';
import { enterFullscreenOnFirstTouch, registerServiceWorker } from './platform/pwa.ts';

declare global {
  interface Window {
    /** Exposed for debugging and the browser audio test. */
    audio?: AudioEngine;
  }
}

translatePage();
if (import.meta.env.PROD) registerServiceWorker();
enterFullscreenOnFirstTouch();
// Created right away so an early `beforeinstallprompt` is not missed.
new InstallBanner();
setupCloseAppButton();

const audio = new AudioEngine();
window.audio = audio;

window.addEventListener('DOMContentLoaded', () => new Game({ audio }).start());
