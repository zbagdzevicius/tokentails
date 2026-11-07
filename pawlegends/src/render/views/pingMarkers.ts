/**
 * MAP-GAPS A10: the ground ping marker, its own decal (not the mint move-order marker): a pulsing ring in the ping's
 * colour, a light pillar and the ping's glyph floating over it, for PING_LIFE s. Up to PING_SLOTS at once. Render only.
 */
import * as THREE from 'three';
import type { PingKind } from '../../data/pings';
import { pingGlyph } from '../../ui/pingGlyph';
import { DecalLayer, boldRingTexture } from './decals';

export const PING_LIFE = 2.6;
export const PING_SLOTS = 4;

interface Slot {
  x: number;
  z: number;
  t: number;
  color: THREE.Color;
  hex: number;
  kind: PingKind | null;
  pillar: THREE.Mesh;
  sprite: THREE.Sprite;
  glyphKey: string;
}

export class PingMarkers {
  readonly group = new THREE.Group();
  private rings = new DecalLayer(boldRingTexture(), PING_SLOTS * 2, { y: 0.08, renderOrder: 9, name: 'ping-rings' });
  private slots: Slot[] = [];
  private next = 0;
  private pillarGeo = new THREE.CylinderGeometry(0.09, 0.16, 3.2, 8, 1, true);
  /** Markers placed so far (tests). */
  placed = 0;

  constructor() {
    this.group.name = 'ping-markers';
    this.group.add(this.rings.mesh);
    for (let i = 0; i < PING_SLOTS; i++) {
      const pillar = new THREE.Mesh(this.pillarGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      pillar.position.y = 1.6;
      pillar.visible = false;
      pillar.renderOrder = 9;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      sprite.scale.set(1.1, 1.1, 1);
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.group.add(pillar, sprite);
      this.slots.push({ x: 0, z: 0, t: -1, color: new THREE.Color(), hex: 0xffffff, kind: null, pillar, sprite, glyphKey: '' });
    }
  }

  /** A ping at (x, z) m in `color` (css), of `kind` (its glyph; null: a ring and pillar only). */
  add(x: number, z: number, color: string, kind: PingKind | null): void {
    const s = this.slots[this.next];
    this.next = (this.next + 1) % PING_SLOTS;
    s.x = x;
    s.z = z;
    s.t = 0;
    s.color.set(color);
    s.hex = s.color.getHex();
    s.kind = kind;
    s.glyphKey = '';
    this.placed++;
  }

  /** Live markers (tests). */
  live(): number {
    return this.slots.filter((s) => s.t >= 0).length;
  }

  update(dt: number): void {
    this.rings.begin();
    for (const s of this.slots) {
      if (s.t < 0) continue;
      s.t += dt;
      if (s.t > PING_LIFE) {
        s.t = -1;
        s.pillar.visible = false;
        s.sprite.visible = false;
        continue;
      }
      const fade = 1 - Math.max(0, s.t - PING_LIFE + 0.6) / 0.6;
      const pulse = (s.t * 1.4) % 1;
      this.rings.add(s.x, s.z, 1.6, s.hex, fade);
      this.rings.add(s.x, s.z, 1.6 + pulse * 2.4, s.hex, fade * (1 - pulse) * 0.8);
      const pm = s.pillar.material as THREE.MeshBasicMaterial;
      pm.color.copy(s.color);
      pm.opacity = 0.55 * fade;
      s.pillar.position.set(s.x, 1.6, s.z);
      s.pillar.visible = true;
      if (s.kind) {
        const key = s.kind;
        if (s.glyphKey !== key) {
          const c = pingGlyph(s.kind, 64, '#' + s.color.getHexString());
          if (c) {
            const sm = s.sprite.material as THREE.SpriteMaterial;
            sm.map?.dispose();
            sm.map = new THREE.CanvasTexture(c);
            sm.map.colorSpace = THREE.SRGBColorSpace;
            sm.needsUpdate = true;
            s.glyphKey = key;
          }
        }
        s.sprite.position.set(s.x, 3.6 + Math.sin(s.t * 4) * 0.12, s.z);
        (s.sprite.material as THREE.SpriteMaterial).opacity = fade;
        s.sprite.visible = s.glyphKey !== '';
      }
    }
    this.rings.end();
  }

  dispose(): void {
    this.pillarGeo.dispose();
    for (const s of this.slots) {
      (s.pillar.material as THREE.Material).dispose();
      const sm = s.sprite.material as THREE.SpriteMaterial;
      sm.map?.dispose();
      sm.dispose();
    }
    this.group.removeFromParent();
  }
}
