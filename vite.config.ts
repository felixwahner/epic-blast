import { defineConfig } from 'vite';
import { pwaPlugin } from './build/pwa-plugin.ts';

export default defineConfig({
  plugins: [pwaPlugin()],
  // Relative base path lets the game run from any subdirectory.
  base: './',
  server: {
    port: 3000,
    // Browser tests start their own dev server and must not open a window.
    open: !process.env.PLAYWRIGHT_TEST,
  },
});
