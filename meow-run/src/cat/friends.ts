// Grandma Cat (actor 'grandma': sit, wave) and the giant rolling yarn ball (actor 'yarn': roll, idle).
import * as THREE from 'three';
import type { ActorRig, ActorState } from '../core/types';
import { approach, hump } from './anim';
import { canvasTex, flat, geo, outline, part, prng, SPHERE, SPHERE_LO, toon } from './toon';

const GREY = 0xa7adb8;
const WHITE = 0xf6f2ec;
const OUT = 0x3a3440;

function paintGrandmaFur(g: CanvasRenderingContext2D, w: number, h: number): void {
  const R = prng(11);
  g.fillStyle = '#a7adb8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,60,80,0.12)';
    g.fillRect(R() * w, R() * h, 2, 5);
  }
  g.fillStyle = 'rgba(110,116,130,0.8)';
  for (let s = 0; s < 9; s++) {
    const x0 = (s / 9) * w;
    g.fillRect(x0, 0, 7, h * 0.4);
  }
  const grad = g.createLinearGradient(0, h * 0.55, 0, h * 0.72);
  grad.addColorStop(0, 'rgba(246,242,236,0)');
  grad.addColorStop(1, 'rgba(246,242,236,1)');
  g.fillStyle = grad;
  g.fillRect(0, h * 0.55, w, h * 0.45);
}

function paintKnit(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#b48ad8';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 3;
  for (let y = 4; y < h; y += 12) {
    for (let x = 0; x < w; x += 12) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6, y + 7);
      g.lineTo(x + 12, y);
      g.stroke();
    }
  }
  g.fillStyle = '#ffd6e8';
  for (let x = 0; x < w; x += 24) g.fillRect(x, h - 18, 12, 10);
}

/** Grandma Cat: a plump grey-and-white cat with round glasses and a lilac knitted shawl. ~1.6 u tall sitting. */
export class Grandma implements ActorRig {
  root = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  paw = new THREE.Group();
  tail: THREE.Group[] = [];
  eyes: THREE.Mesh[] = [];
  private blink = 3;
  private wave = 0;

  constructor() {
    const S = SPHERE();
    const fur = toon('grandmaFur', 0xffffff, { map: canvasTex('grandmaFur', 256, 128, paintGrandmaFur) });
    const white = toon('grandmaWhite', WHITE);
    const grey = toon('grandmaGrey', GREY);
    this.root.add(this.body);
    // sitting pear body
    const b = part(S, fur, this.body, [0, 0.55, 0], [0.5, 0.58, 0.45]);
    outline(b, 0.04, OUT);
    part(S, white, this.body, [0, 0.55, 0.22], [0.36, 0.48, 0.28]); // bib
    for (const side of [-1, 1]) {
      const haunch = part(S, fur, this.body, [side * 0.32, 0.28, -0.02], [0.24, 0.26, 0.36]);
      outline(haunch, 0.06, OUT);
      part(S, white, this.body, [side * 0.3, 0.06, 0.32], [0.13, 0.08, 0.17]); // back paws
    }
    // knitted shawl draped over the shoulders: a cap of the body sphere, open at the front to show the bib
    const shawlGeo = geo('shawl', () => new THREE.SphereGeometry(1, 24, 12, Math.PI / 2 + 0.55, Math.PI * 2 - 1.1, 0.3, 0.95));
    const shawlMat = toon('shawl', 0xffffff, { map: canvasTex('knit', 128, 64, paintKnit) });
    shawlMat.side = THREE.DoubleSide;
    const shawl = part(shawlGeo, shawlMat, this.body, [0, 0.56, 0], [0.55, 0.63, 0.5]);
    outline(shawl, 0.03, 0x4a2e60);
    // a pink bow where the shawl ties
    for (const side of [-1, 1]) {
      const bow = part(SPHERE_LO(), toon('bow', 0xff7fb0), this.body, [side * 0.09, 1.02, 0.36], [0.09, 0.06, 0.04]);
      bow.rotation.z = side * 0.5;
    }
    part(SPHERE_LO(), toon('bow', 0xff7fb0), this.body, [0, 1.02, 0.38], [0.04, 0.04, 0.04]);
    // one front paw rests, the other waves
    part(S, white, this.body, [-0.17, 0.08, 0.36], [0.11, 0.08, 0.15]);
    part(geo('gmaLeg', () => new THREE.CylinderGeometry(0.08, 0.075, 0.55, 8).translate(0, -0.27, 0)), white, this.body, [-0.17, 0.62, 0.33]);
    this.paw.position.set(0.2, 0.75, 0.3);
    this.body.add(this.paw);
    part(geo('gmaLeg', () => new THREE.CylinderGeometry(0.08, 0.075, 0.55, 8).translate(0, -0.27, 0)), white, this.paw, [0, 0, 0]);
    part(S, white, this.paw, [0, -0.56, 0.03], [0.11, 0.08, 0.13]);
    this.paw.rotation.x = 0.35;

    // head
    this.head.position.set(0, 1.35, 0.08);
    this.body.add(this.head);
    const skull = part(S, fur, this.head, [0, 0, 0], [0.42, 0.36, 0.38]);
    outline(skull, 0.04, OUT);
    for (const side of [-1, 1]) {
      part(S, white, this.head, [side * 0.11, -0.1, 0.3], [0.15, 0.11, 0.1]);
      // ears
      const ear = part(geo('gmaEar', () => new THREE.ConeGeometry(0.13, 0.26, 4).rotateY(Math.PI / 4).translate(0, 0.11, 0)), grey, this.head, [side * 0.24, 0.27, -0.03], [1, 1, 0.55]);
      ear.rotation.z = -side * 0.35;
      outline(ear, 0.08, OUT);
      // kind closed-ish eyes
      const eye = part(S, flat('gmaEye', 0x2a2228), this.head, [side * 0.16, 0.06, 0.33], [0.06, 0.05, 0.03], false);
      this.eyes.push(eye);
      part(SPHERE_LO(), toon('gmaBlush', 0xffa8b8), this.head, [side * 0.26, -0.06, 0.26], [0.06, 0.035, 0.03], false);
    }
    part(S, toon('gmaNose', 0xe58a9e), this.head, [0, -0.02, 0.4], [0.05, 0.035, 0.03], false);
    // round glasses
    const ring = geo('glass', () => new THREE.TorusGeometry(0.1, 0.014, 6, 20));
    const gold = toon('gold', 0xd9a73a);
    for (const side of [-1, 1]) part(ring, gold, this.head, [side * 0.16, 0.06, 0.39], [1, 1, 1], false);
    const bridge = part(geo('glassBridge', () => new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4).rotateZ(Math.PI / 2)), gold, this.head, [0, 0.08, 0.4], [1, 1, 1], false);
    bridge.castShadow = false;
    // a little flower by the ear
    const petal = toon('petal', 0xff8fb8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(SPHERE_LO(), petal, this.head, [-0.3 + Math.cos(a) * 0.05, 0.3 + Math.sin(a) * 0.05, 0.12], [0.04, 0.04, 0.02], false);
    }
    part(SPHERE_LO(), toon('petalMid', 0xffe066), this.head, [-0.3, 0.3, 0.13], [0.03, 0.03, 0.02], false);
    // tail curled round the side
    let parent: THREE.Object3D = this.body;
    let pos: [number, number, number] = [0.25, 0.12, -0.35];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      g.position.set(...pos);
      parent.add(g);
      part(S, i >= 6 ? white : fur, g, [0, 0, 0], [0.1 - i * 0.006, 0.1 - i * 0.006, 0.13]);
      this.tail.push(g);
      parent = g;
      pos = [0.07, 0, 0.12];
    }
  }

  animate(dt: number, t: number, st: ActorState): void {
    const d = Math.min(0.05, Math.max(0, dt));
    this.body.scale.set(1 + Math.sin(t * 1.6) * 0.012, 1 - Math.sin(t * 1.6) * 0.012, 1);
    this.head.rotation.set(Math.sin(t * 0.8) * 0.05, Math.sin(t * 0.5) * 0.15, Math.sin(t * 0.9) * 0.08);
    this.wave += ((st.action === 'wave' ? 1 : 0) - this.wave) * approach(6, d);
    this.paw.rotation.set(0.35 - this.wave * 2.75, 0, this.wave * (0.55 + Math.sin(t * 10) * 0.35));
    for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.y = 0.25 + Math.sin(t * 1.8 - i * 0.5) * 0.12;
    this.blink -= d;
    if (this.blink < 0) this.blink = 2.5 + Math.random() * 3;
    const open = this.blink < 0.12 ? 0.1 : 0.85;
    for (const e of this.eyes) e.scale.y = 0.05 * open;
  }
}

function paintYarn(g: CanvasRenderingContext2D, w: number, h: number): void {
  const R = prng(5);
  g.fillStyle = '#ff5c8a';
  g.fillRect(0, 0, w, h);
  // wound strands in several crossing bands
  const cols = ['#ff7ea3', '#e23d6c', '#ffa3c0', '#c92a5a'];
  for (let band = 0; band < 6; band++) {
    const ang = (band / 6) * Math.PI;
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(ang);
    for (let i = -h; i < h; i += 7) {
      g.strokeStyle = cols[Math.floor(R() * cols.length)];
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-w, i);
      g.lineTo(w, i + Math.sin(i) * 2);
      g.stroke();
    }
    g.restore();
  }
}

/** The giant yarn ball (radius 1; scale the root for the chase, about 2.2). Rolls along +z. */
export class YarnBall implements ActorRig {
  root = new THREE.Group();
  ball = new THREE.Group();
  private spin = 0;
  constructor() {
    this.root.add(this.ball);
    this.ball.position.y = 1;
    const m = part(geo('yarnBall', () => new THREE.IcosahedronGeometry(1, 4)), toon('yarn', 0xffffff, { map: canvasTex('yarn', 256, 256, paintYarn) }), this.ball, [0, 0, 0]);
    outline(m, 0.03, 0x6a1030);
    // a few raised loops for silhouette
    const loop = geo('yarnLoop', () => new THREE.TorusGeometry(0.9, 0.05, 5, 24, Math.PI * 1.1));
    const lm = toon('yarnLoop', 0xff86ab);
    for (let i = 0; i < 4; i++) {
      const l = part(loop, lm, this.ball, [0, 0, 0], [1.12, 1.12, 1.12]);
      l.rotation.set(i * 0.9, i * 1.3, i * 0.4);
    }
    // the loose strand trailing behind on the ground
    const strand = geo('yarnStrand', () => {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, -0.9), new THREE.Vector3(0.3, 0.04, -1.6), new THREE.Vector3(-0.2, 0.03, -2.4), new THREE.Vector3(0.25, 0.03, -3.3), new THREE.Vector3(0, 0.03, -4)]);
      return new THREE.TubeGeometry(c, 30, 0.05, 5);
    });
    part(strand, toon('yarnStrand', 0xff5c8a), this.root, [0, 0, 0]);
  }
  animate(dt: number, _t: number, st: ActorState): void {
    const d = Math.min(0.05, Math.max(0, dt));
    if (st.action !== 'idle') this.spin += (st.speed * d) / Math.max(0.1, this.root.scale.y);
    this.ball.rotation.x = this.spin;
    this.ball.position.y = 1 + hump((this.spin * 0.25) % 1) * 0.04;
  }
}

export const grandmaActor = (): ActorRig => new Grandma();
export const yarnActor = (): ActorRig => new YarnBall();
