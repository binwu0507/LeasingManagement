import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Defaults: main = src/main/index.js, preload = src/preload/index.js,
// renderer root = src/renderer (index.html). Output goes to out/.
export default defineConfig({
  main: { build: { emptyOutDir: true } },
  preload: { build: { emptyOutDir: true } },
  renderer: {
    plugins: [react()]
  }
});
