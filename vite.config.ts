import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works on a subpath (GitHub Pages) and at a root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
