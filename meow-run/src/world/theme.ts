// The three themes (WORLD-ART): meadow, gorge, sunset. One factory, palettes from palette.ts.
// enter: fog, lights, exposure, sky, finish dressing. buildChunk: terrain.ts. update: sway clock, water, sky follow,
// valley floor height, river spray, chimney smoke.
import * as THREE from 'three';
import { attractFocus } from '../core/camera';
import { renderer, sunDir } from '../core/engine';
import { spawnParticle } from '../core/fx';
import { P } from '../core/player';
import { themes } from '../core/registry';
import { G, game } from '../core/state';
import { newFrame, type Track } from '../core/track';
import type { ThemeDef, ThemeId } from '../core/types';
import { buildFinish, type FinishDressing } from './cottage';
import { getKit } from './kit';
import { PALETTES } from './palette';
import { Sky } from './sky';
import { buildTerrainChunk, disposeTerrainChunk, type WorldCtx } from './terrain';
import { THEME_IDS } from './themeIds';
import { waterMaterial } from './water';

/** fog distances per quality, tuned to VIEW_AHEAD (high 560, low 360) so the streaming edge is hidden */
export const FOG = { high: { near: 140, far: 540 }, low: { near: 80, far: 345 } };

const sfr = newFrame();
const camPos = new THREE.Vector3();

function makeFloorAt(track: Track, depth: number): (s: number) => number {
  const cache = new Map<number, number>();
  const bucket = (k: number): number => {
    const have = cache.get(k);
    if (have !== undefined) return have;
    const c = k * 10;
    let mn = Infinity;
    for (let s = c - 200; s <= c + 120; s += 10) {
      if (s < 0 || s > track.length) continue;
      track.sample(s, sfr);
      if (sfr.pos.y < mn) mn = sfr.pos.y;
    }
    if (!Number.isFinite(mn)) {
      track.sample(Math.max(0, Math.min(track.length, c)), sfr);
      mn = sfr.pos.y;
    }
    const v = mn - depth;
    if (c + 120 <= track.length) cache.set(k, v);
    return v;
  };
  return (s: number) => {
    const k = Math.floor(s / 10);
    const t = s / 10 - k;
    return bucket(k) * (1 - t) + bucket(k + 1) * t;
  };
}

function makeTheme(id: ThemeId): ThemeDef {
  const p = PALETTES[id];
  let world: WorldCtx | null = null;
  let sky: Sky | null = null;
  let finish: FinishDressing | null = null;
  let water: THREE.ShaderMaterial | null = null;
  let floorY = 0;
  let sprayT = 0;
  const waterTime = { value: 0 };
  return {
    id,
    enter(ctx) {
      const low = ctx.quality === 'low';
      const kit = getKit(id, p);
      const fog = FOG[ctx.quality];
      ctx.scene.background = new THREE.Color(p.horizon);
      ctx.scene.fog = new THREE.Fog(p.fog, fog.near, fog.far);
      ctx.sun.color.setHex(p.sun);
      ctx.sun.intensity = p.sunI;
      ctx.hemi.color.setHex(p.hemiSky);
      ctx.hemi.groundColor.setHex(p.hemiGround);
      ctx.hemi.intensity = p.hemiI;
      sunDir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
      renderer.toneMappingExposure = p.exposure;
      water = waterMaterial(p, low, waterTime);
      const floorAt = makeFloorAt(ctx.track, p.mix.valleyDepth);
      world = { id, track: ctx.track, p, kit, quality: ctx.quality, seed: ctx.stage.index * 17 + 3, water, floorAt };
      floorY = floorAt(0);
      sky = new Sky(p, kit, sunDir, low);
      ctx.scene.add(sky.group);
      if (Number.isFinite(G.finishS) && G.finishS > 0) {
        finish = buildFinish(ctx.track, G.finishS, p, !!ctx.stage.ending, kit.ground, low);
        ctx.scene.add(finish.group);
      }
    },
    buildChunk(_ctx, s0, s1) {
      if (!world) return null;
      return buildTerrainChunk(world, s0, s1);
    },
    disposeChunk(obj) {
      disposeTerrainChunk(obj);
    },
    update(dt, t, ctx) {
      if (!world || !sky) return;
      world.kit.time.value = t;
      waterTime.value = t;
      const focus = game.mode === 'title' ? attractFocus() : P.s;
      const want = world.floorAt(focus);
      floorY += (want - floorY) * Math.min(1, dt * 2);
      ctx.camera.getWorldPosition(camPos);
      sky.update(dt, camPos, floorY);
      // river spray along the banks ahead of the kitten
      const track = ctx.track;
      if (dt > 0) {
        sprayT += dt;
        while (sprayT > 0.03) {
          sprayT -= 0.03;
          const s = focus + 3 + Math.random() * 40;
          if (track.kindAt(s) !== 'river') continue;
          track.sample(s, sfr);
          const side = Math.random() < 0.5 ? -1 : 1;
          const x = side * (sfr.width / 2 + 0.2 + Math.random() * 0.9);
          const px = sfr.pos.x + sfr.right.x * x;
          const pz = sfr.pos.z + sfr.right.z * x;
          spawnParticle(px, sfr.pos.y + 0.05, pz, sfr.right.x * side * 0.8, 2 + Math.random() * 2.5, sfr.right.z * side * 0.8, 0.55, 0.25 + Math.random() * 0.25, p.foam, 9);
        }
        if (finish && camPos.distanceToSquared(sky.group.position) >= 0) {
          const near = Number.isFinite(G.finishS) && G.finishS - focus < 420;
          if (near) finish.update(dt, t);
        }
      }
    },
    exit(ctx) {
      sky?.dispose();
      sky = null;
      finish?.dispose();
      finish = null;
      water?.dispose();
      water = null;
      world = null;
      renderer.toneMappingExposure = 1;
      ctx.scene.background = new THREE.Color(0x8fd3ff);
    },
  };
}

export function registerThemes(): void {
  for (const id of THEME_IDS) themes.add(makeTheme(id));
}
