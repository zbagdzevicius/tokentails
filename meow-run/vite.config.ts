import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.MEOWRUN_BASE || './',
  server: { port: 5178, host: '127.0.0.1', strictPort: true },
  preview: { port: 4178, host: '127.0.0.1' },
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'build', chunkSizeWarningLimit: 1200 },
});
