/**
 * Companion Kittens (POC.md §11.1, GDD "your cats in the game"): the player's first two Token Tails cats, in their
 * coat with an element collar and a name tag. Round 1 ("I never saw my cats during the fight"): both trot at the
 * player's heels (one each side) while the hero is out in a lane, 1.5× the size they were; while the hero is dead or
 * at home they follow the front melee minion of the player's lane, and nap at the fountain when there is no wave. On
 * the player's takedown they hop and cheer (`cheer`, the kill feed names one). Pure decoration: they are not
 * entities, cannot be hit and never reach the sim. Two meshes and two tags.
 */
import * as THREE from 'three';
import type { Companion } from '../../meta/roster';
import { ELEMENT_COLOR, companionCoat } from '../cosmetics';
import { makeKitten, type Character } from '../chars';
import { getSkin, skinIdOf } from '../skins/skinStore';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';

/** Round 1: kittens are drawn this much bigger than the builder's size (they were tiny shapes at 844×390). */
export const KITTEN_SCALE = 1.5;
/** Hero distance from its own fountain (m) beyond which the kittens walk with it. */
const OUT_OF_BASE = 14;

interface Kitten {
  c: Companion;
  ch: Character;
  tag: THREE.Sprite;
  pos: THREE.Vector3;
  yaw: number;
  phase: number;
  walk: number;
  napping: boolean;
  /** Seconds left of a cheer hop. */
  cheer: number;
  /** Round 2: Epic and Legendary cats glow on the ground in lane too (not only while napping); null below Epic. */
  aura: THREE.Mesh | null;
}

const AURA_GEO = new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2);
/** The tier glow under an Epic (violet) or Legendary (gold) kitten, or null. */
function tierAura(tier: string): THREE.Mesh | null {
  if (tier !== 'EPIC' && tier !== 'LEGENDARY') return null;
  const m = new THREE.Mesh(
    AURA_GEO,
    new THREE.MeshBasicMaterial({ color: tier === 'LEGENDARY' ? 0xffd34d : 0xc28cff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  m.renderOrder = 2;
  m.name = `aura-${tier.toLowerCase()}`;
  return m;
}

/** The kitten's tag: its name, the element dot and, for Rare+ cats, tier sparkles (round 0: show off a cat). */
function nameTag(name: string, color: number, tier = 'COMMON'): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext('2d');
  if (g) {
    g.font = '600 30px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = Math.min(240, g.measureText(name).width + 34);
    g.fillStyle = 'rgba(42,26,34,0.78)';
    g.beginPath();
    g.roundRect((256 - w) / 2, 10, w, 44, 22);
    g.fill();
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.arc((256 - w) / 2 + 16, 32, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3dc';
    const stars = tier === 'LEGENDARY' ? ' ✦✦' : tier === 'EPIC' || tier === 'RARE' ? ' ✦' : '';
    g.fillText(name, 128 + 6 - (stars ? 10 : 0), 33);
    if (stars) {
      g.fillStyle = '#ffd34d';
      g.textAlign = 'left';
      g.fillText(stars, 128 + 6 + g.measureText(name).width / 2 - 10, 33);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 5;
  return sp;
}

export class CompanionView {
  readonly group = new THREE.Group();
  private kittens: Kitten[] = [];
  private time = 0;
  myTeam: 0 | 1 = 0;
  mySlot = 0;

  constructor(companions: readonly Companion[]) {
    this.group.name = 'companions';
    companions.slice(0, 2).forEach((c, i) => {
      // GDD §7.2: a squad cat with a card skin walks in that skin's coat, so the champion wearing it and its kitten match
      const skin = getSkin(skinIdOf(c.id));
      const ch = makeKitten(companionCoat(c.coat, c.element), ELEMENT_COLOR[c.element], c.coat === 'SCOUT', skin?.coat);
      ch.object.name = `kitten-${i}`;
      ch.object.scale.multiplyScalar(KITTEN_SCALE);
      const tag = nameTag(c.name, ELEMENT_COLOR[c.element], c.tier);
      const aura = tierAura(c.tier);
      this.group.add(ch.object, tag);
      if (aura) this.group.add(aura);
      this.kittens.push({ c, ch, tag, pos: new THREE.Vector3(), yaw: 0, phase: i * 2.1, walk: 0, napping: true, cheer: 0, aura });
    });
    this.group.userData.count = this.kittens.length;
  }

  get count(): number {
    return this.kittens.length;
  }

  /** The player's takedown: the kittens hop. Returns the name of the one that cheers loudest (the kill feed line). */
  cheer(): string | null {
    for (const k of this.kittens) k.cheer = 0.8;
    return this.kittens[0]?.c.name ?? null;
  }

  update(frame: ViewFrame | null, dt: number): void {
    this.time += dt;
    if (!frame || this.kittens.length === 0) return;
    let fountain: ViewEntity | null = null;
    let me: ViewEntity | null = null;
    const front: (ViewEntity | null)[] = [null, null];
    for (const e of frame.entities) {
      if (e.team !== this.myTeam) continue;
      if (e.kind === 'fountain') fountain = e;
      else if (e.kind === 'hero' && e.id === this.mySlot) me = e;
      else if (e.kind === 'minion' && e.variant === 'melee' && e.state !== 'dead') {
        const li = e.lane === 'puddle' ? 1 : 0;
        const f = front[li];
        // the front minion: furthest from our fountain
        if (!f || (fountain ? dist2(e, fountain) > dist2(f, fountain) : e.id < f.id)) front[li] = e;
      }
    }
    const out = me && me.state !== 'dead' && fountain ? Math.sqrt(dist2(me, fountain)) / 1000 > OUT_OF_BASE : false;
    // the player's lane (Sunny above the middle of the map), for when the hero is dead or at home
    const myLane = me && me.fy < 30000 ? 1 : 0;
    this.kittens.forEach((k, i) => {
      const lead = front[myLane];
      let tx: number;
      let tz: number;
      if (out && me) {
        // at the hero's heels, one each side
        const back = me.yaw + Math.PI;
        const side = i === 0 ? 0.9 : -0.9;
        tx = toX(me.fx) + Math.cos(back) * 1.3 - Math.sin(back) * side;
        tz = toZ(me.fy) - Math.sin(back) * 1.3 - Math.cos(back) * side;
      } else if (lead) {
        // trot a little behind and beside the lead minion
        const back = lead.yaw + Math.PI;
        tx = toX(lead.fx) + Math.cos(back) * 1.1 + Math.sin(back) * 0.6;
        tz = toZ(lead.fy) - Math.sin(back) * 1.1 + Math.cos(back) * 0.6;
      } else if (fountain) {
        tx = toX(fountain.fx) + (i === 0 ? 1.4 : -1.4);
        tz = toZ(fountain.fy) + 1.6;
      } else return;
      const dx = tx - k.pos.x;
      const dz = tz - k.pos.z;
      const d = Math.hypot(dx, dz);
      if (k.pos.lengthSq() === 0 || d > 25) k.pos.set(tx, 0, tz);
      else if (d > 0.05) {
        const step = Math.min(d, dt * 6);
        k.pos.x += (dx / d) * step;
        k.pos.z += (dz / d) * step;
        k.yaw = Math.atan2(-dz, dx);
      }
      const moving = d > 0.15;
      k.napping = !lead && !moving;
      k.ch.anim.update(dt, { state: k.napping ? 'napping' : moving ? 'moving' : 'idle', speed: moving ? Math.min(6, d / Math.max(dt, 1e-3)) : 0, height: k.ch.height, yawRate: 0 });
      k.cheer = Math.max(0, k.cheer - dt);
      const hop = k.cheer > 0 ? Math.abs(Math.sin((0.8 - k.cheer) * Math.PI * 3)) * 0.6 : 0;
      k.ch.object.position.set(k.pos.x, hop, k.pos.z);
      k.ch.object.rotation.y = k.yaw;
      k.tag.position.set(k.pos.x, (k.napping ? 0.75 : 1.2) * KITTEN_SCALE + hop, k.pos.z);
      if (k.aura) {
        k.aura.position.set(k.pos.x, 0.05, k.pos.z);
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 4 + k.phase);
        k.aura.scale.setScalar(pulse * (k.c.tier === 'LEGENDARY' ? 1.15 : 1));
        (k.aura.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.2 * pulse;
      }
    });
  }

  dispose(): void {
    for (const k of this.kittens) {
      k.ch.dispose();
      (k.aura?.material as THREE.Material | undefined)?.dispose();
      (k.tag.material as THREE.SpriteMaterial).map?.dispose();
      k.tag.material.dispose();
    }
    this.kittens = [];
    this.group.clear();
  }
}

function dist2(a: { fx: number; fy: number }, b: { fx: number; fy: number }): number {
  const dx = a.fx - b.fx;
  const dy = a.fy - b.fy;
  return dx * dx + dy * dy;
}
