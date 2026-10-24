// Pickups: fish snacks (lines, arcs, waves), golden bells (ground and "grab it in the air"), yarn, treats and
// cloud-ride hoops. SETPIECES lane. Collected pickups fly into the kitten and shrink (no instant pop-out).
import * as THREE from 'three';
import { callout, react } from '../core/hud';
import { P } from '../core/player';
import { setPieceTypes } from '../core/registry';
import { addPoints, collectBell, collectFish, collectPickup } from '../core/score';
import { TREAT_POINTS } from '../core/scoring';
import { G } from '../core/state';
import { placeOnTrack } from '../core/place';
import { MAX_HEARTS, NO_FLOOR, type SetPieceType } from '../core/types';
import { GEO, MAT, mesh, num, str } from './kit';
import { fishOffset } from './layout';

const tmp = new THREE.Vector3();
const tgt = new THREE.Vector3();

/** a collected pickup flying into the kitten */
interface Flyer {
  o: THREE.Object3D;
  t: number;
  s0: number;
}
const FLY = 0.16;
function stepFlyers(list: Flyer[], dt: number): void {
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f.t < 0) continue;
    f.t += dt;
    const u = Math.min(1, f.t / FLY);
    tgt.copy(P.world.pos).addScaledVector(P.world.up, 0.7);
    f.o.position.lerp(tgt, Math.min(1, u * 0.9 + 0.15));
    f.o.scale.setScalar(f.s0 * (1 + Math.sin(u * Math.PI) * 0.25) * (1 - u * 0.9));
    if (u >= 1) {
      f.o.visible = false;
      f.t = -1;
    }
  }
}

/** a row of fish snacks. params: n, gap, shape ('line' | 'arc' | 'wave'), h (arc height), amp (wave) */
const fish: SetPieceType = {
  id: 'fish',
  create(ctx) {
    const n = num(ctx, 'n', 5);
    const gap = num(ctx, 'gap', 3);
    const shape = str(ctx, 'shape', 'line');
    const h = num(ctx, 'h', 2.2);
    const amp = num(ctx, 'amp', 2);
    const x0 = ctx.spec.x ?? 0;
    const y0 = ctx.spec.y ?? 0.75;
    const items: THREE.Mesh[] = [];
    const flyers: Flyer[] = [];
    for (let i = 0; i < n; i++) {
      const s = ctx.spec.s + i * gap;
      const o = fishOffset(shape, i, n, x0, y0, h, amp);
      const m = mesh(ctx, GEO.fish(), MAT.vcShiny(), s, o.x, o.y, true);
      m.scale.setScalar(1.05);
      m.userData.y = o.y;
      m.userData.ph = i * 0.7;
      items.push(m);
      const f: Flyer = { o: m, t: -1, s0: 1.05 };
      flyers.push(f);
      ctx.addCollider({
        shape: 'sphere',
        s,
        x: o.x,
        y: o.y,
        r: 0.65,
        kind: 'trigger',
        label: 'fish',
        onTouch: () => {
          collectFish(m.getWorldPosition(tmp));
          f.t = 0;
        },
      });
    }
    return {
      end: ctx.spec.s + n * gap,
      update(dt, t) {
        for (let i = 0; i < items.length; i++) {
          const m = items[i];
          if (flyers[i].t >= 0 || !m.visible) continue;
          // swim in place: wiggle + spin
          m.rotation.y = t * 2.4 + m.userData.ph;
          m.rotation.z = Math.sin(t * 7 + m.userData.ph) * 0.25;
        }
        stepFlyers(flyers, dt);
      },
    };
  },
};

/** golden bell `index` (0..6). y > 2 = "grab it in the air": a light beam marks the spot from the ground. */
const bell: SetPieceType = {
  id: 'bell',
  create(ctx) {
    const { s } = ctx.spec;
    const index = num(ctx, 'index', 0);
    if (G.bells[index]) return { end: s };
    const x = ctx.spec.x ?? 0;
    const y = ctx.spec.y ?? 1;
    const root = new THREE.Group();
    const b = new THREE.Mesh(GEO.bell(), MAT.gold());
    b.castShadow = ctx.quality === 'high';
    b.scale.setScalar(1.35);
    const bow = new THREE.Mesh(GEO.bow(), MAT.vc());
    bow.position.y = 0.95;
    bow.scale.setScalar(1.3);
    const halo = new THREE.Sprite(MAT.halo());
    halo.scale.setScalar(3.2);
    halo.position.y = 0.3;
    root.add(halo, b, bow);
    const marks: THREE.Mesh[] = [];
    if (!NO_FLOOR.has(ctx.track.kindAt(s))) {
      const disc = mesh(ctx, GEO.disc(), MAT.goldGlow(), s, x, 0.04, true, false);
      disc.scale.setScalar(0.9);
      marks.push(disc);
      if (y > 1.8) {
        // "grab it in the air": a soft light column from the ground up to the bell
        const beam = mesh(ctx, GEO.beam(), MAT.beam(), s, x, 0, true, false);
        beam.scale.set(0.9, y + 1.2, 0.9);
        marks.push(beam);
      }
    }
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, x, y, true);
    const baseY = root.position.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const fly: Flyer = { o: root, t: -1, s0: 1 };
    ctx.addCollider({
      shape: 'sphere',
      s,
      x,
      y: y + 0.2,
      // air bells are a bit more forgiving: any hop that passes level with the bell takes it
      r: y > 1.8 ? 1.2 : 0.95,
      kind: 'trigger',
      label: 'bell',
      onTouch: () => {
        collectBell(index, root.getWorldPosition(tmp));
        if (y > 1.8 && !P.grounded && G.bells.filter(Boolean).length < 7) callout('PURRFECT!');
        fly.t = 0;
        for (const m of marks) m.visible = false;
      },
    });
    const flyers = [fly];
    return {
      end: s + 1,
      update(dt, t) {
        if (fly.t < 0 && root.visible) {
          root.position.copy(baseY).addScaledVector(up, Math.sin(t * 2.6 + index) * 0.15);
          b.rotation.z = Math.sin(t * 5 + index) * 0.22;
          root.rotation.y += dt * 1.2;
          halo.material.rotation = t;
          halo.scale.setScalar(2.4 + Math.sin(t * 4) * 0.3);
        }
        stepFlyers(flyers, dt);
      },
    };
  },
};

/** yarn ball: fills the PUFF meter */
const yarn: SetPieceType = {
  id: 'yarn',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const y = ctx.spec.y ?? 0.8;
    const root = new THREE.Group();
    const ball = new THREE.Mesh(GEO.yarnBall(), MAT.yarn());
    ball.castShadow = ctx.quality === 'high';
    const tail = new THREE.Mesh(GEO.yarnTail(), MAT.yarn());
    root.add(ball, tail);
    root.scale.setScalar(1.5);
    const halo = new THREE.Sprite(MAT.haloBlue());
    halo.scale.setScalar(2.2);
    root.add(halo);
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, x, y, true);
    const p0 = root.position.clone();
    const fly: Flyer = { o: root, t: -1, s0: 1.5 };
    ctx.addCollider({
      shape: 'sphere',
      s,
      x,
      y,
      r: 0.75,
      kind: 'trigger',
      label: 'yarn',
      onTouch: () => {
        collectPickup('yarn', root.getWorldPosition(tmp), 150, 0.25);
        react('happy');
        fly.t = 0;
      },
    });
    const flyers = [fly];
    return {
      end: s + 1,
      update(dt, t) {
        if (fly.t < 0) {
          root.position.y = p0.y + Math.abs(Math.sin(t * 3.2 + s)) * 0.35;
          ball.rotation.x = t * 2;
        }
        stepFlyers(flyers, dt);
      },
    };
  },
};

/** heart cookie treat: points + a little meter, "NOM NOM!" */
const treat: SetPieceType = {
  id: 'treat',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const y = ctx.spec.y ?? 0.9;
    const heart = num(ctx, 'heart', 0) > 0;
    const m = mesh(ctx, GEO.treat(), MAT.vc(), s, x, y, true);
    m.scale.setScalar(heart ? 2.1 : 1.6);
    const p0y = m.position.y;
    const fly: Flyer = { o: m, t: -1, s0: 1.6 };
    ctx.addCollider({
      shape: 'sphere',
      s,
      x,
      y,
      r: 0.7,
      kind: 'trigger',
      label: 'treat',
      onTouch: () => {
        if (heart && G.hearts < MAX_HEARTS) {
          // a heart cookie: one heart back before the hardest stretch
          G.hearts++;
          collectPickup('treat', m.getWorldPosition(tmp), TREAT_POINTS, 0.15);
          callout('+1 HEART!');
          react('happy');
        } else collectPickup('treat', m.getWorldPosition(tmp), TREAT_POINTS, 0.15, 'NOM NOM!');
        fly.t = 0;
      },
    });
    const flyers = [fly];
    return {
      end: s + 1,
      update(dt, t) {
        if (fly.t < 0) {
          m.rotation.y = t * 2.5;
          m.position.y = p0y + Math.sin(t * 3 + s) * 0.12;
        }
        stepFlyers(flyers, dt);
      },
    };
  },
};

/** golden hoop (cloud ride, air lines): fly through for points. Faces along the track. */
const ring: SetPieceType = {
  id: 'ring',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const y = ctx.spec.y ?? 4;
    const m = mesh(ctx, GEO.ring(), MAT.gold(), s, x, y, false);
    const inner = mesh(ctx, GEO.ringInner(), MAT.goldGlow(), s, x, y, false, false);
    inner.scale.setScalar(0.9);
    let hit = false;
    let pop = 0;
    ctx.addCollider({
      shape: 'sphere',
      s,
      x,
      y,
      r: 1.3,
      kind: 'trigger',
      label: 'ring',
      onTouch: () => {
        hit = true;
        addPoints(120);
        collectPickup('ring', m.getWorldPosition(tmp), 0, 0.08);
        callout(ringCombo() >= 3 ? 'PURRFECT!' : 'WHOOSH!');
      },
    });
    return {
      end: s + 1,
      update(dt, t) {
        if (!hit) {
          m.rotation.z = t * 0.8;
          inner.scale.setScalar(0.9 + Math.sin(t * 6) * 0.05);
          return;
        }
        if (pop < 1) {
          pop = Math.min(1, pop + dt * 6);
          const sc = (1 + pop * 0.35) * (1 - pop * 0.6);
          m.scale.setScalar(sc);
          inner.scale.setScalar(sc * 0.9);
          if (pop >= 1) m.visible = inner.visible = false;
        }
      },
    };
  },
};
/** consecutive rings within a short time (a tiny combo for the callout) */
let lastRing = -10;
let combo = 0;
function ringCombo(): number {
  const now = G.time;
  combo = now - lastRing < 2.2 ? combo + 1 : 1;
  lastRing = now;
  return combo;
}

export function registerPickups(): void {
  for (const t of [fish, bell, yarn, treat, ring]) setPieceTypes.add(t);
}
