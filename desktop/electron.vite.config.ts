import {defineConfig, externalizeDepsPlugin} from 'electron-vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';

// Main and preload are bundled by esbuild, which resolves the app's CJS `src/`
// and the ESM `server/src/` at build time — so the cjs-module-lexer `export *`
// gotcha that bites the server never applies here. Node deps stay external and
// resolve from desktop/node_modules at runtime (hono, better-sqlite3, ws).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {rollupOptions: {input: resolve(__dirname, 'src/main/index.ts')}},
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {rollupOptions: {input: resolve(__dirname, 'src/preload/index.ts')}},
  },
  renderer: {
    plugins: [react()],
    // The renderer imports theme tokens and pure utils from the app's src/.
    server: {fs: {allow: [resolve(__dirname, '..')]}},
    build: {rollupOptions: {input: resolve(__dirname, 'src/renderer/index.html')}},
  },
});
