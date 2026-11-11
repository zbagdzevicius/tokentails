import { defineConfig } from 'vitest/config';

/** Diagnose-only: bot chatter transcripts from real simulated matches (not in `npm test`). */
export default defineConfig({
  test: { include: ['tools/chat-transcripts/*.test.ts'], environment: 'node' },
});
