// Ground obstacles and path furniture: logs (jump), rocks (dodge), low branches (slide), puddles (wet shake),
// bamboo clusters (slalom), signs, gap stakes, checkpoint pennants, the finish arch and prompt hints.
// SETPIECES lane.
import * as THREE from 'three';
import { burst } from '../core/fx';
import { callout, prompt } from '../core/hud';
import { placeOnTrack } from '../core/place';
import { P, soak } from '../core/player';
import { setPieceTypes } from '../core/registry';
import type { Action, SetPieceType } from '../core/types';
import { bannerMat, GEO, MAT, mesh, num, rockGeo, signMat, str, tickShared, usePuddle } from './kit';

const tmp = new THREE.Vector3();
let pennantMat: THREE.MeshStandardMaterial | null = null;

/** log across the path (or part of it): jump it. params w (width, default path width + 1) */
const log: SetPieceType = {
  id: 'log',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const w = num(ctx, 'w', ctx.track.widthAt(s) + 1);
    const root = new THREE.Group();
    const body = new THREE.Mesh(GEO.log(), MAT.bark());
    body.scale.set(w, 1, 1);
    body.castShadow = ctx.quality === 'high';
    const capL = new THREE.Mesh(GEO.logCap(), MAT.logEnd());
    capL.rotation.y = Math.PI / 2;
    capL.position.x = w / 2;
    const capR = new THREE.Mesh(GEO.logCap(), MAT.logEnd());
    capR.rotation.y = -Math.PI / 2;
    capR.position.x = -w / 2;
    const stub = new THREE.Mesh(GEO.stub(), MAT.vc());
    stub.position.set(w * 0.18, 0.3, 0);
    root.add(body, capL, capR, stub);
    if (w > 4) {
      const stub2 = new THREE.Mesh(GEO.stub(), MAT.vc());
      stub2.position.set(-w * 0.27, 0.28, 0.05);
      stub2.rotation.y = 2.4;
      root.add(stub2);
    }
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, x, 0.45);
    ctx.addCollider({ s, x, y: 0, hs: 0.45, hx: w / 2, h: 0.9, kind: 'hurt', label: 'log' });
    return { end: s + 1 };
  },
};

/** rock: dodge or jump. params r */
const rock: SetPieceType = {
  id: 'rock',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const r = num(ctx, 'r', 0.8);
    const m = mesh(ctx, rockGeo(s * 7.3), MAT.vc(), s, x, r * 0.55, true);
    m.scale.set(r, r, r * 1.05);
    m.rotation.y = s * 1.3;
    // pebbles around the base
    for (let k = 0; k < 2; k++) {
      const a = s * 3.1 + k * 2.4;
      const pb = mesh(ctx, rockGeo(k + 1), MAT.vc(), s + Math.cos(a) * r * 1.1, x + Math.sin(a) * r * 1.2, 0.08, true, false);
      pb.scale.setScalar(0.2 + k * 0.08);
    }
    ctx.addCollider({ shape: 'sphere', s, x, y: r * 0.55, r: r * 0.9, kind: 'hurt', label: 'rock' });
    return { end: s + r };
  },
};

/** low branch across the whole path between two trees: slide under it */
const branch: SetPieceType = {
  id: 'branch',
  create(ctx) {
    const { s } = ctx.spec;
    const w = ctx.track.widthAt(s) + 1.6;
    const root = new THREE.Group();
    const bough = new THREE.Mesh(GEO.bough(), MAT.vc());
    bough.scale.set(w + 1, 1.15, 1.15);
    bough.position.y = 1.35;
    bough.castShadow = ctx.quality === 'high';
    root.add(bough);
    const sway = new THREE.Group();
    sway.position.y = 1.35;
    root.add(sway);
    for (let k = 0; k < 4; k++) {
      const lf = new THREE.Mesh(GEO.leaves(), MAT.vc());
      lf.position.set(-w / 2 + (k + 0.5) * (w / 4), 0.35 + (k % 2) * 0.15, (k % 2) * 0.2 - 0.1);
      lf.scale.setScalar(0.85 + (k % 3) * 0.12);
      lf.castShadow = ctx.quality === 'high';
      sway.add(lf);
    }
    for (const side of [-1, 1]) {
      const tr = new THREE.Mesh(GEO.trunk(), MAT.vc());
      tr.scale.set(1.2, 4.2, 1.2);
      tr.position.set((side * (w + 0.9)) / 2, -0.2, 0);
      tr.castShadow = ctx.quality === 'high';
      const top = new THREE.Mesh(GEO.leaves(), MAT.vc());
      top.scale.setScalar(2.4);
      top.position.set((side * (w + 0.9)) / 2, 4.3, 0);
      root.add(tr, top);
    }
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, 0, 0);
    ctx.addCollider({ s, x: 0, y: 0.75, hs: 0.35, hx: w / 2, h: 2.2, kind: 'hurt', label: 'branch' });
    return {
      end: s + 1,
      update(_dt, t) {
        sway.rotation.x = Math.sin(t * 1.7 + s) * 0.05;
      },
    };
  },
};

/** puddle: cats hate water (slowed + wet shake). params r */
const puddle: SetPieceType = {
  id: 'puddle',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const r = num(ctx, 'r', 1.4);
    const m = mesh(ctx, GEO.plane(), usePuddle(), s, x, 0.05, false, false);
    m.rotateX(-Math.PI / 2);
    m.scale.set(r * 2, r * 2.8, 1);
    m.renderOrder = 2;
    ctx.addCollider({
      s,
      x,
      y: 0,
      hs: r * 1.2,
      hx: r * 0.85,
      h: 0.3,
      kind: 'trigger',
      label: 'puddle',
      onTouch: () => {
        soak(1.2);
        tmp.copy(P.world.pos);
        burst(tmp, 9, 0x9fdcff, 4.5, 0.45, 0.16, 14, 1.2);
        callout('EWW, WET!', 'info');
      },
    });
    return { end: s + r * 2, update: (_dt, t) => tickShared(t) };
  },
};

/** bamboo cluster: slalom between them. params n (stalks), spread (u) */
const bamboo: SetPieceType = {
  id: 'bamboo',
  create(ctx) {
    const { s } = ctx.spec;
    const x = ctx.spec.x ?? 0;
    const n = num(ctx, 'n', 3);
    const spread = num(ctx, 'spread', 1.2);
    const stalks: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? k / (n - 1) - 0.5 : 0;
      const m = mesh(ctx, GEO.bamboo(), MAT.vc(), s + Math.sin(k * 2.3) * 0.3, x + u * spread, 0, true);
      m.scale.set(1.7, 0.95 + (k % 3) * 0.12, 1.7);
      m.userData.ph = k * 1.3 + s;
      m.userData.sy = m.scale.y;
      stalks.push(m);
    }
    ctx.addCollider({ s, x, y: 0, hs: 0.45, hx: spread / 2 + 0.25, h: 8, kind: 'hurt', label: 'bamboo' });
    return {
      end: s + 1,
      update(dt, t) {
        // once Mochi is past, the stalks duck into the ground so the chase camera never films through them
        const past = P.s > s + 0.6;
        for (const m of stalks) {
          m.rotation.z = Math.sin(t * 1.3 + m.userData.ph) * 0.03;
          const k = m.userData.k ?? 1;
          const nk = past ? Math.max(0, k - dt * 9) : 1;
          if (nk !== k) {
            m.userData.k = nk;
            m.scale.y = m.userData.sy * Math.max(0.001, nk);
            m.visible = nk > 0;
          }
        }
      },
    };
  },
};

/** roadside sign with an icon. params icon (jump | slide | left | right | warn | water | dog | yarn | vault), side */
const sign: SetPieceType = {
  id: 'sign',
  create(ctx) {
    const { s } = ctx.spec;
    const side = num(ctx, 'side', 1);
    const w = ctx.track.widthAt(s);
    const root = new THREE.Group();
    const post = new THREE.Mesh(GEO.post(), MAT.vc());
    post.scale.set(1.3, 2.3, 1.3);
    const face = new THREE.Mesh(GEO.plane(), signMat(str(ctx, 'icon', 'warn')));
    face.scale.set(1.3, 1.3, 1);
    face.position.set(0, 2.3, -0.06);
    face.rotation.y = Math.PI; // face the runner coming from -z
    const back = new THREE.Mesh(GEO.plane(), MAT.bark());
    back.scale.set(1.3, 1.3, 1);
    back.position.set(0, 2.3, 0.0);
    root.add(post, face, back);
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, side * (w / 2 + 1.2), 0, true);
    root.rotateY(side * 0.35);
    root.traverse((o) => ((o as THREE.Mesh).castShadow = ctx.quality === 'high'));
    return { end: s + 1 };
  },
};

/** striped stakes marking a jump edge (both sides of the path) */
const edge: SetPieceType = {
  id: 'edge',
  create(ctx) {
    const { s } = ctx.spec;
    const w = ctx.track.widthAt(s);
    for (const side of [-1, 1]) mesh(ctx, GEO.stakeStriped(), MAT.vc(), s, side * (w / 2 + 0.1), 0, true).scale.set(1.2, 1.1, 1.2);
    return { end: s + 1 };
  },
};

/** checkpoint pennant: a paw flag on a pole that cheers when the kitten passes */
const cpflag: SetPieceType = {
  id: 'cpflag',
  create(ctx) {
    const { s } = ctx.spec;
    const side = num(ctx, 'side', -1);
    const w = ctx.track.widthAt(s);
    const root = new THREE.Group();
    const pole = new THREE.Mesh(GEO.post(), MAT.vc());
    pole.scale.set(0.9, 3.2, 0.9);
    pennantMat ??= new THREE.MeshStandardMaterial({ map: pennantTex(), side: THREE.DoubleSide, roughness: 0.8 });
    const flag = new THREE.Mesh(GEO.pennant(), pennantMat);
    flag.scale.set(1.5, 1.5, 1);
    flag.position.y = 3.1;
    flag.rotation.y = side > 0 ? 0 : Math.PI;
    const knob = new THREE.Mesh(GEO.dot(), MAT.gold());
    knob.position.y = 3.25;
    knob.scale.setScalar(1.3);
    root.add(pole, flag, knob);
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, side * (w / 2 + 0.9), 0, true);
    let passed = false;
    let pop = 0;
    return {
      end: s + 2,
      update(dt, t) {
        flag.rotation.x = Math.sin(t * 6 + s) * 0.18;
        if (!passed && P.s >= s) {
          passed = true;
          pop = 1;
          root.getWorldPosition(tmp);
          tmp.y += 3.2;
          burst(tmp, 14, 0xffc41f, 5, 0.6, 0.3, 6, 0.8);
        }
        if (pop > 0) {
          pop = Math.max(0, pop - dt * 2);
          flag.scale.set(1.5 + pop, 1.5 + pop, 1);
          root.rotation.y += dt * pop * 10;
        }
      },
    };
  },
};
let pennantTexture: THREE.Texture | null = null;
function pennantTex(): THREE.Texture {
  if (pennantTexture) return pennantTexture;
  const el = document.createElement('canvas');
  el.width = el.height = 64;
  const c = el.getContext('2d')!;
  c.fillStyle = '#ff8a2a';
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#fff6e0';
  c.beginPath();
  c.arc(16, 34, 9, 0, Math.PI * 2);
  for (const [dx, dy] of [[-8, -10], [0, -14], [8, -10]]) {
    c.moveTo(16 + dx + 4, 34 + dy);
    c.arc(16 + dx, 34 + dy, 4, 0, Math.PI * 2);
  }
  c.fill();
  pennantTexture = new THREE.CanvasTexture(el);
  pennantTexture.colorSpace = THREE.SRGBColorSpace;
  return pennantTexture;
}

/** finish arch with a banner. params text */
const finish: SetPieceType = {
  id: 'finish',
  create(ctx) {
    const { s } = ctx.spec;
    const w = ctx.track.widthAt(s) + 1.4;
    const root = new THREE.Group();
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(GEO.post(), MAT.vc());
      post.scale.set(2.4, 5.2, 2.4);
      post.position.x = (side * w) / 2;
      const hay = new THREE.Mesh(GEO.hay(), MAT.vc());
      hay.position.set((side * (w + 2.2)) / 2, 0.85, 0.4);
      hay.rotation.y = 0.3 * side;
      root.add(post, hay);
    }
    const banner = new THREE.Mesh(GEO.plane(), bannerMat(str(ctx, 'text', 'FINISH!')));
    banner.scale.set(w * 0.92, w * 0.23, 1);
    banner.position.y = 4.4;
    banner.rotation.y = Math.PI;
    root.add(banner);
    // bunting
    const cols = [0xe8432e, 0xffd23f, 0x4fb8ff, 0x6fbf3a];
    const flags: THREE.Mesh[] = [];
    for (let k = 0; k < 9; k++) {
      const u = k / 8 - 0.5;
      const f = new THREE.Mesh(GEO.pennant(), new THREE.MeshBasicMaterial({ color: cols[k % 4], side: THREE.DoubleSide }));
      f.rotation.z = Math.PI / 2;
      f.scale.setScalar(0.7);
      f.position.set(u * w, 5.3 - Math.cos(u * Math.PI) * 0.4, 0);
      flags.push(f);
      root.add(f);
    }
    root.traverse((o) => ((o as THREE.Mesh).castShadow = ctx.quality === 'high'));
    ctx.group.add(root);
    placeOnTrack(root, ctx.track, s, 0, 0, true);
    let passed = false;
    return {
      end: s + 2,
      update(_dt, t) {
        for (let k = 0; k < flags.length; k++) flags[k].rotation.x = Math.sin(t * 5 + k) * 0.3;
        if (!passed && P.s >= s) {
          passed = true;
          for (let k = 0; k < 4; k++) {
            root.getWorldPosition(tmp);
            tmp.y += 4.5;
            burst(tmp, 24, cols[k], 9, 1.2, 0.35, 8, 1.2);
          }
        }
      },
      dispose() {
        for (const f of flags) (f.material as THREE.Material).dispose();
      },
    };
  },
};

/** a contextual prompt while the player is in [s, s + len]: params action, text */
const hint: SetPieceType = {
  id: 'hint',
  create(ctx) {
    const { s } = ctx.spec;
    const len = ctx.spec.len ?? 15;
    const action = (ctx.spec.params?.action as Action) ?? 'jump';
    const text = String(ctx.spec.params?.text ?? 'JUMP!');
    return {
      end: s + len,
      update() {
        if (P.s >= s && P.s <= s + len && P.mode === 'run') prompt(action, text, 0.2);
      },
    };
  },
};

export function registerObstacles(): void {
  for (const t of [log, rock, branch, puddle, bamboo, sign, edge, cpflag, finish, hint]) setPieceTypes.add(t);
}
