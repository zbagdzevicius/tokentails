import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './vendor-sim.mjs';

// The vendored backend copy is checked byte for byte by `npm run vendor-sim:check`; here the bundle itself must stay
// pure (no browser or module-loader API) and carry the server entry's exports.
test('the server bundle builds as one pure module with the verify and room-check entry points', async () => {
  const { code, modules } = await bundle();
  assert.ok(modules.includes('src/server/index.ts'));
  assert.ok(modules.some((m) => m.startsWith('src/sim/')));
  for (const name of ['verifyRanked', 'checkRoom', 'canonicalLogKey', 'dayNoUtc', 'cleanName']) assert.match(code, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(code, /\bwindow\.|\bdocument\.|localStorage|import\.meta/);
});
