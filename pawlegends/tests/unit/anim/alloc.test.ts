/**
 * ANIM-SPEC §10 / §12 alloc.test: the pools keep a constant size over 1,000 frames (ribbons, mesh FX, ghosts, clip
 * players), and a source scan of the per-frame functions (sampler, layers, warp, springs, root, player, reactions)
 * finds no `new`, array or object literals, closures or template strings.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { Ribbons } from '../../../src/render/anim/trails';
import { MeshFx } from '../../../src/render/anim/fxkit/meshFx';
import { Ghosts } from '../../../src/render/anim/ghosts';
import { makeHero } from '../../../src/render/chars';
import { newAnchors } from '../../../src/render/anim/types';
import { COMMON, swing } from '../../../src/render/anim/common';

const SRC = join(__dirname, '../../../src/render/anim');

/** The body of method / function `name` in `file` (brace-matched). */
function body(file: string, name: string): string {
  const s = readFileSync(join(SRC, file), 'utf8');
  const re = new RegExp(`(^|\\n)\\s*(export\\s+)?(private\\s+|public\\s+|static\\s+)*(function\\s+)?${name}\\s*\\([^)]*\\)[^{]*\\{`, 'g');
  const m = re.exec(s);
  if (!m) throw new Error(`${name} not found in ${file}`);
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (depth > 0 && i < s.length) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    i++;
  }
  return s.slice(start, i - 1);
}

const HOT: readonly [string, string][] = [
  ['sampler.ts', 'sampleClip'],
  ['sampler.ts', 'segmentAt'],
  ['sampler.ts', 'sampleScalar'],
  ['sampler.ts', 'slerpOver'],
  ['layers.ts', 'update'],
  ['layers.ts', 'applyOverride'],
  ['layers.ts', 'applyAdditive'],
  ['layers.ts', 'sumRoot'],
  ['layers.ts', 'addRoot'],
  ['layers.ts', 'applySprings'],
  ['warp.ts', 'time'],
  ['warp.ts', 'step'],
  ['springs.ts', 'step'],
  ['root.ts', 'apply'],
  ['player.ts', 'update'],
  ['reactions.ts', 'apply'],
];

const BAD: readonly [RegExp, string][] = [
  [/\bnew\s+[A-Za-z]/, 'new'],
  [/\[\s*\]/, 'array literal'],
  [/[=(,:]\s*\[[^\]]/, 'array literal'],
  [/=>/, 'closure'],
  [/\bfunction\b/, 'closure'],
  [/[=(,:?]\s*\{\s*([A-Za-z_$][\w$]*\s*[:,}]|\})/, 'object literal'],
  [/`[^`]*\$\{/, 'template string'],
];

describe('no allocation in the per-frame code', () => {
  it.each(HOT)('%s %s', (file, name) => {
    const b = body(file, name)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    for (const [re, what] of BAD) expect(re.test(b), `${file} ${name}: ${what}`).toBe(false);
  });
});

describe('pools keep a constant size over 1,000 frames', { timeout: 60000 }, () => {
  it('ribbons', () => {
    const r = new Ribbons();
    r.setTier('high', false);
    const size = r.poolSize;
    const src = { x: 0, y: 1, z: 0 };
    let maxLive = 0;
    for (let f = 0; f < 1000; f++) {
      if (f % 7 === 0) {
        const s = r.point(src, 0xffffff, 0.4, 0.2);
        if (s >= 0) for (let k = 0; k < 5; k++) r.feed(s, k * 0.3, 1, f * 0.01);
        if (s >= 0 && f % 14 === 0) r.end(s);
      }
      r.update(1 / 60);
      maxLive = Math.max(maxLive, r.live());
    }
    expect(r.poolSize).toBe(size);
    expect(maxLive).toBeLessThanOrEqual(10);
  });

  it('mesh FX', () => {
    const fx = new MeshFx();
    fx.tier = 'high';
    const caps = [fx.pools.ground.cap, fx.pools.vertical.cap, fx.pools.dome.cap];
    for (let f = 0; f < 1000; f++) {
      fx.spawn('crescent', { x: 0, z: 0, sx: 2, life: 0.3, color: 0xffffff, rim: 0xff0000, rel: 'own', p0: 1.6 });
      fx.spawn('pillar', { x: 0, z: 0, sx: 0.5, sy: 6, life: 0.4, color: 0xffffff, rim: 0xff0000, rel: 'enemy' });
      fx.update(1 / 60, f / 60);
      expect(fx.pools.ground.n).toBeLessThanOrEqual(fx.pools.ground.cap);
    }
    expect([fx.pools.ground.cap, fx.pools.vertical.cap, fx.pools.dome.cap]).toEqual(caps);
  });

  it('ghosts and clip players', () => {
    const ch = makeHero('sage', 0, null, { detail: 0.62 });
    const g = new Ghosts();
    g.setTier('high', false);
    const size = g.poolSize;
    const stack = ch.anim.stack;
    const players = stack.over.length + stack.addv.length;
    const clip = swing({ id: 'sage.basicA' });
    for (let f = 0; f < 1000; f++) {
      if (f % 5 === 0) g.spawn(ch.mesh, 0xffffff);
      g.update(1 / 60);
      const now = f / 60;
      if (f % 20 === 0) stack.play(f % 40 === 0 ? clip : COMMON.levelFlex, { anchors: newAnchors() });
      ch.anim.update(1 / 60, { state: 'idle', speed: 0, height: ch.height, yawRate: 0, now });
      expect(g.live()).toBeLessThanOrEqual(8);
    }
    expect(g.poolSize).toBe(size);
    expect(stack.over.length + stack.addv.length).toBe(players);
    // the rig's bones stay finite through 1,000 frames of clips and springs
    for (const b of ch.rig.bones) expect(Number.isFinite(b.quaternion.x + b.quaternion.w + b.position.y)).toBe(true);
    expect(ch.mover.position.y).toBeGreaterThan(0);
    expect(new THREE.Vector3().setFromMatrixPosition(ch.mover.matrix).length()).toBeGreaterThanOrEqual(0);
    ch.dispose();
  });
});
