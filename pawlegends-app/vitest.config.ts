import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// `@/…` is the Next client (the in-page host reuses the web host's React-free modules, src/host); packages those
// files import resolve from this app (dedupe), never from client/node_modules.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${resolve(__dirname, '../client')}/` }],
    dedupe: ['firebase', '@firebase/auth', '@firebase/app', '@capacitor/core', '@capacitor-firebase/authentication'],
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'],
    environment: 'node',
  },
});
