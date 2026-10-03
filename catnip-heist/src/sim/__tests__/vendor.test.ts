import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const vendored = join(root, '..', 'backend', 'src', 'vendor', 'heist-sim', 'heist-sim.bundle.ts');

// The backend replays Heist runs with a vendored bundle of src/sim/server.ts (plan G2 layer 2). A sim,
// level or star-rule change must be re-vendored (`npm run vendor-sim`) in the same change.
describe.skipIf(!existsSync(vendored))('vendored backend sim', () => {
  it('matches a fresh build of src/sim/server.ts (npm run vendor-sim:check)', () => {
    const out = execFileSync(process.execPath, [join(root, 'scripts', 'vendor-sim.mjs'), '--check'], { cwd: root, encoding: 'utf8' });
    expect(out).toContain('up to date');
  }, 180000);
});
