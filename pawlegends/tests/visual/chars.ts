/**
 * Dev-only character gallery (not shipped; `npm run dev`, then /tests/visual/chars.html). Lines up every hero (both
 * teams) and the minions on lane sand and draws them with the match iso camera (`?view=iso`, default), a front view
 * (`?view=front`) or a back view (`?view=back`). `?quality=low|med`, `?pose=<state>` (idle, moving, dead, …),
 * `?only=clem,sage`, `?mood=cheer|sad` (results poses), `?team=0`, `?dist=6`, `?yaw=<rad>`, `?detail=1.5`. Used for the visual checks of the upright characters; sets `data-ready` when drawn.
 */
import * as THREE from 'three';
import type { HeroId } from '../../src/sim/api';
import { createRenderer } from '../../src/render/renderer';
import { DETAIL, makeHero, type CharState } from '../../src/render/chars';
import { minionGeometry } from '../../src/render/views/models';
import { uprightMaterial } from '../../src/render/views/rig';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'iso';
const tier = (q.get('quality') ?? 'med') as 'low' | 'med' | 'high';
const state = (q.get('pose') ?? 'idle') as CharState;
const only = (q.get('only') ?? 'clem,sage,brutus,cacklejaw').split(',') as HeroId[];
const yawQ = Number(q.get('yaw') ?? 'NaN');
const app = document.getElementById('app')!;
const gr = createRenderer(app, tier);
gr.resize();
const scene = gr.scene;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0xe6cf98 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const low = tier === 'low';
const chars: ReturnType<typeof makeHero>[] = [];
let x = 0;
for (const team of (q.get('team') ? [Number(q.get('team'))] : [0, 1]) as (0 | 1)[]) {
  for (const h of only) {
    const c = makeHero(h, team, null, { detail: q.get('detail') ? Number(q.get('detail')) : low ? DETAIL.low : DETAIL.med, outline: !low, shadows: !low });
    c.object.position.set(x, 0, team === 0 ? 0 : -4);
    // face the camera a little (the iso camera sits toward +Z / -X of the focus)
    c.object.rotation.y = Number.isFinite(yawQ) ? yawQ : view === 'back' ? Math.PI / 2 : -Math.PI / 2 + 0.5;
    c.anim.mood = q.get('mood');
    scene.add(c.object);
    chars.push(c);
    x += 3.2;
  }
  x = 0;
}
// minions
const mat = uprightMaterial();
let mx = 0;
for (const team of [0, 1] as const)
  for (const v of ['melee', 'ranged'] as const) {
    const m = new THREE.Mesh(minionGeometry(v, team), mat);
    m.geometry.setAttribute('aAnim', new THREE.BufferAttribute(new Float32Array(m.geometry.getAttribute('position').count * 4), 4));
    m.scale.setScalar(1.65);
    m.position.set(mx, 0, 4);
    m.rotation.y = view === 'back' ? Math.PI / 2 : -Math.PI / 2 + 0.5;
    scene.add(m);
    mx += 2.2;
  }
const cx = ((only.length - 1) * 3.2) / 2;
gr.focus.set(cx, 0, 0);
if (view !== 'iso') {
  gr.place = (cam) => {
    const d = Number(q.get('dist') ?? 10);
    const z = view === 'back' ? -d : d;
    cam.position.set(cx, 2.2, z);
    cam.lookAt(cx, 1.5, view === 'back' ? -2 : 0);
  };
}
let t = 0;
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  for (const c of chars) c.anim.update(dt, { state, speed: state === 'moving' ? 5 : 0, height: c.height, yawRate: 0 });
  gr.render();
  if (t > 0.6) document.documentElement.dataset.ready = '1';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => gr.resize());
