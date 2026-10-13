import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // the guides are read from the repository's docs/ folder (see lib/guides.ts)
  server: { port: 5173, fs: { allow: ['../..'] }, proxy: { '/api': 'http://localhost:8080' } },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
});
