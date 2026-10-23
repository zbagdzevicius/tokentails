// Biscuit, the huge goofy dog of the River Gorge chase: a happy golden pup about 3.6 u tall with floppy ears, a
// flapping tongue, a red collar with a tag and a tail that never stops wagging. Actor id 'dog'.
// Actions: run (gallop), bark (head jerk, jaw open), leap (stretched flying gallop), tumble (rolls over, legs up),
// idle / sit. Local +z forward, feet at y = 0.
import * as THREE from 'three';
import type { ActorRig, ActorState } from '../core/types';
import { woof } from '../audio/sfx';
import { approach, gait, hump, newGait } from './anim';
import { flat, geo, outline, part, SPHERE, toon } from './toon';

const COAT = 0xe2a85a;
const COAT_DARK = 0xb87332;
const CREAM = 0xfff0d6;
const OUT = 0x4a2a12;

export class Dog implements ActorRig {
  root = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  jaw = new THREE.Group();
  ears: THREE.Group[] = [];
  legs: { pivot: THREE.Group; front: boolean }[] = [];
  tail: THREE.Group[] = [];
  tongue: THREE.Mesh;
  private phase = 0;
  private action = 'run';
  private actT = 0;
  private gaitT = newGait();
  private roll = 0;

  constructor() {
    const S = SPHERE();
    const coat = toon('dogCoat', COAT);
    const dark = toon('dogDark', COAT_DARK);
    const cream = toon('dogCream', CREAM);
    const black = toon('dogNose', 0x2a1a14);
    const pinkT = toon('dogTongue', 0xff6f8e);
    this.root.add(this.body);
    this.body.position.y = 1.9;
    const torso = part(S, coat, this.body, [0, 0, -0.1], [0.95, 0.9, 1.55]);
    outline(torso, 0.04, OUT);
    const chest = part(S, cream, this.body, [0, -0.15, 0.95], [0.75, 0.8, 0.6]);
    outline(chest, 0.05, OUT);
    part(S, dark, this.body, [0.55, 0.25, -0.5], [0.42, 0.4, 0.5]); // a big brown patch
    // collar + tag
    const collar = part(geo('dogCollar', () => new THREE.TorusGeometry(0.62, 0.11, 6, 18)), toon('dogCollar', 0xe63946), this.body, [0, 0.5, 1.15]);
    collar.rotation.x = Math.PI / 2 + 0.5;
    const tag = part(S, toon('dogTag', 0xffd23f, { emissive: 0x6a4a00, emissiveIntensity: 0.4 }), this.body, [0, -0.08, 1.52], [0.16, 0.16, 0.06]);
    outline(tag, 0.12, OUT);

    // head
    this.head.position.set(0, 0.85, 1.45);
    this.body.add(this.head);
    const skull = part(S, coat, this.head, [0, 0.3, 0.1], [0.8, 0.72, 0.75]);
    outline(skull, 0.04, OUT);
    const snout = part(S, cream, this.head, [0, -0.05, 0.75], [0.5, 0.38, 0.55]);
    outline(snout, 0.05, OUT);
    part(S, black, this.head, [0, 0.12, 1.25], [0.2, 0.15, 0.13]); // nose
    part(S, flat('dogShine', 0xffffff), this.head, [0.06, 0.2, 1.36], [0.05, 0.03, 0.02], false);
    // goofy mismatched eyes
    const eyeW = flat('dogEyeW', 0xffffff);
    const eyeB = flat('dogEyeB', 0x1a120c);
    for (const side of [-1, 1]) {
      const e = part(S, eyeW, this.head, [side * 0.33, 0.48, 0.66], [0.2, side > 0 ? 0.24 : 0.2, 0.12], false);
      part(S, eyeB, e, [side > 0 ? -0.2 : 0.3, side > 0 ? 0.15 : -0.2, 0.75], [0.5, 0.5, 0.4], false);
      // eyebrows (happy and dumb)
      const brow = part(S, dark, this.head, [side * 0.33, 0.78, 0.6], [0.16, 0.05, 0.06], false);
      brow.rotation.z = side * 0.3;
    }
    // jaw with the tongue
    this.jaw.position.set(0, -0.22, 0.5);
    this.head.add(this.jaw);
    part(S, cream, this.jaw, [0, -0.08, 0.25], [0.38, 0.14, 0.42]);
    part(S, toon('dogMouth', 0x7a2030), this.jaw, [0, 0.02, 0.3], [0.32, 0.06, 0.36], false);
    this.tongue = part(S, pinkT, this.jaw, [0.15, -0.12, 0.55], [0.15, 0.04, 0.32]);
    outline(this.tongue, 0.08, 0x8a2a3a);
    // floppy ears
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.62, 0.6, -0.05);
      this.head.add(ear);
      const e = part(S, dark, ear, [side * 0.12, -0.42, 0], [0.2, 0.55, 0.36]);
      outline(e, 0.06, OUT);
      this.ears.push(ear);
    }
    // legs
    const legGeo = geo('dogLeg', () => new THREE.CylinderGeometry(0.24, 0.2, 1.4, 10).translate(0, -0.7, 0));
    for (const [front, side] of [
      [true, 1],
      [true, -1],
      [false, 1],
      [false, -1],
    ] as [boolean, number][]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.55, -0.35, front ? 0.85 : -0.95);
      this.body.add(pivot);
      const leg = part(legGeo, front ? coat : coat, pivot, [0, 0, 0]);
      outline(leg, 0.06, OUT);
      const paw = part(S, cream, pivot, [0, -1.48, 0.12], [0.3, 0.18, 0.38]);
      outline(paw, 0.08, OUT);
      if (!front) part(S, coat, pivot, [0, -0.1, -0.1], [0.5, 0.6, 0.6]);
      this.legs.push({ pivot, front });
    }
    // tail
    let parent: THREE.Object3D = this.body;
    let pos: [number, number, number] = [0, 0.45, -1.5];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.position.set(...pos);
      parent.add(g);
      part(S, i === 4 ? cream : coat, g, [0, 0, 0], [0.2 - i * 0.02, 0.2 - i * 0.02, 0.26]);
      this.tail.push(g);
      parent = g;
      pos = [0, 0.18, -0.2];
    }
  }

  animate(dt: number, t: number, st: ActorState): void {
    const d = Math.min(0.05, Math.max(0, dt));
    if (st.action !== this.action) {
      // the bark is heard whenever the rig starts barking (a set piece only sets the action)
      if (st.action === 'bark' && this.root.parent && d > 0) {
        woof(0, 0.95 + Math.random() * 0.12);
        woof(0.2, 1.05 + Math.random() * 0.1);
      }
      this.action = st.action;
      this.actT = 0;
    }
    this.actT += d;
    const a = this.action;
    const speed = Math.max(0, st.speed);
    this.phase += d * (0.8 + speed * 0.12);
    const amp = a === 'idle' || a === 'sit' ? 0.1 : Math.min(1.2, 0.3 + speed / 18);
    const g = gait(this.phase, amp, this.gaitT);
    let pitch = g.pitch * 1.2;
    let bodyY = 1.9 + g.bob * 4;
    let headPitch = -g.pitch;
    let jaw = 0.25 + Math.sin(t * 9) * 0.08; // happy panting
    let fl = g.fl * 0.9;
    let fr = g.fr * 0.9;
    let bl = g.bl * 0.9;
    let br = g.br * 0.9;
    let rollT = 0;
    if (a === 'bark') {
      const k = hump(Math.min(1, this.actT / 0.35));
      jaw = 0.25 + 0.6 * k;
      headPitch -= 0.45 * k;
      bodyY += 0.15 * k;
    } else if (a === 'leap') {
      const k = Math.min(1, this.actT / 0.25);
      pitch = -0.25 * k;
      fl = -1.2 * k;
      fr = -1.1 * k;
      bl = 1.2 * k;
      br = 1.1 * k;
      bodyY = 1.9 + 0.3 * k;
      jaw = 0.6;
    } else if (a === 'tumble') {
      // rolls over onto its back with its legs in the air, tongue out: comic, not scary
      rollT = Math.PI * 0.5 * Math.min(1, this.actT / 0.5) + Math.sin(this.actT * 9) * 0.12;
      fl = -1.4 + Math.sin(t * 18) * 0.5;
      fr = -1.2 - Math.sin(t * 17) * 0.5;
      bl = 1.0 + Math.sin(t * 15) * 0.5;
      br = 1.2 - Math.sin(t * 16) * 0.5;
      bodyY = 1.05;
      jaw = 0.5;
    } else if (a === 'sit' || a === 'idle') {
      pitch = a === 'sit' ? -0.45 : 0;
      bl = a === 'sit' ? -1.3 : 0;
      br = bl;
      bodyY = a === 'sit' ? 1.5 : 1.9;
      headPitch = 0.4 + Math.sin(t * 1.5) * 0.05;
    }
    this.roll += (rollT - this.roll) * approach(10, d);
    this.body.position.y = bodyY;
    this.body.rotation.set(pitch, 0, this.roll);
    this.head.rotation.set(headPitch, Math.sin(t * 1.3) * 0.12, Math.sin(t * 2.1) * 0.1);
    this.jaw.rotation.x = jaw;
    this.tongue.rotation.y = Math.sin(t * 14) * 0.4;
    this.tongue.position.x = 0.15 + Math.sin(t * 7) * 0.08;
    for (let i = 0; i < 2; i++) this.ears[i].rotation.set(-0.4 - g.stretch * 0.6 * amp + Math.sin(t * 11 + i) * 0.15, 0, (i === 0 ? 1 : -1) * (0.25 + Math.sin(t * 9 + i * 2) * 0.2));
    const L = this.legs;
    L[0].pivot.rotation.x = fl;
    L[1].pivot.rotation.x = fr;
    L[2].pivot.rotation.x = bl;
    L[3].pivot.rotation.x = br;
    for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.set(i === 0 ? -0.8 : -0.15, Math.sin(t * 16 - i * 0.6) * 0.45, 0);
    }
  }
}

export const dogActor = (): ActorRig => new Dog();
