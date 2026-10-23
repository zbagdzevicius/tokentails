/**
 * Projectiles (instanced glowing bolts with particle trails) and zones (instanced ground discs). Kinds follow
 * PROJECTILE_KIND in src/data/towers.ts; an unknown kind draws as a hero bolt. Render only.
 */
import * as THREE from 'three';
import { CAPS } from '../../data/map';
import { ZONE_KIND } from '../../data/effects';
import { PROJECTILE_KIND } from '../../data/towers';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { FADE, SHAPE, type Particles } from '../fx/Particles.js';
import { elementColor, type CombatVfx } from '../fx/combatVfx';
import { RELATION, TEAM, dressTeam } from '../palette';
import { TELEGRAPH_OVER } from '../telegraph';
import { DecalLayer, discTexture } from './decals';
import { tinted, type CardFx } from '../skins/cardFx';

interface Look {
  size: number;
  y: number;
  color: number;
  trail: number;
}

/** Wave C (C3): one scratch look, filled per projectile (the old object per projectile per frame is gone). */
const _look: Look = { size: 0, y: 0, color: 0, trail: 0 };

function set(size: number, y: number, color: number, trail: number): Look {
  _look.size = size;
  _look.y = y;
  _look.color = color;
  _look.trail = trail;
  return _look;
}

/**
 * Ground zones are additive discs: at 0.55-0.95 they blew the pale plaza and the river out to a white disc (trailer
 * review). Every zone's alpha is scaled by this; the rim of the disc texture still marks the edge.
 */
export const ZONE_GLARE_K = 0.35;
/** An arming zone is a telegraph (danger to read): dimmed less. */
export const ZONE_ARMING_K = 0.7;

export function look(kind: number, team: number): Look {
  // cats rose, dogs blue whichever slot they play (palette.ts dressTeam)
  const dt = dressTeam(team);
  const t = TEAM[dt];
  switch (kind) {
    case PROJECTILE_KIND.ranged:
      return set(0.22, 0.7, team === 0 ? 0x9fd3ff : 0xffd27a, 0.12);
    case PROJECTILE_KIND.siege:
      return set(0.42, 1.4, t.main, 0.2);
    case PROJECTILE_KIND.tower:
      return set(0.42, 3.6, dt === 0 ? 0xff9fc0 : 0x8fb4ff, 0.3);
    // v3.3: 0.6 drew a 2 m flat yellow slab over the heroes at the doghouse (trailer v3.2 review)
    case PROJECTILE_KIND.core:
      return set(BOLT_CORE_SIZE, 3.0, team === 0 ? 0xff6f91 : 0xffd34d, 0.35);
    // sim v9: Lambo's tuna can and Bengas's burnt toast
    case PROJECTILE_KIND.tuna:
      return set(0.36, 1.0, 0xc8d4e0, 0.16);
    case PROJECTILE_KIND.toast:
      return set(0.34, 1.0, 0xff7a2e, 0.24);
    // sim v10 (GAPS B6): Sage's Piercing Shot, a long bright arrow
    case PROJECTILE_KIND.lance:
      return set(0.42, 1.0, 0xe8fff4, 0.3);
    default:
      return set(0.3, 0.9, team === 0 ? 0xfff1a8 : 0xd7b8ff, 0.18);
  }
}

/** v3.3: the core's shot radius (m). */
export const BOLT_CORE_SIZE = 0.4;

/**
 * v3.3 bolt shading (render only): the unlit bolts read as flat paper ellipses at the gameplay pitch (a core shot was
 * taken for a placeholder billboard); each is darkened toward its silhouette, so it reads as a glowing ball.
 */
export function shadeBolts(mat: THREE.MeshBasicMaterial): void {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = `varying vec3 vBoltN;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  #ifdef USE_INSTANCING\n  vBoltN = normalize(normalMatrix * mat3(instanceMatrix) * normal);\n  #else\n  vBoltN = normalize(normalMatrix * normal);\n  #endif',
    );
    sh.fragmentShader = `varying vec3 vBoltN;\n${sh.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      '#include <opaque_fragment>\n  gl_FragColor.rgb *= 0.5 + 0.5 * pow(abs(normalize(vBoltN).z), 0.6);',
    );
  };
  mat.customProgramCacheKey = () => 'pl-bolt-shade-v1';
}

/** Projectiles a hero fires (they trail the hero's element colour; minion, tower and core shots keep theirs). */
export const HERO_SHOTS: ReadonlySet<number> = new Set([PROJECTILE_KIND.hero, PROJECTILE_KIND.tuna, PROJECTILE_KIND.toast, PROJECTILE_KIND.lance]);

/** Sim v9: a hero bolt takes its shooter's colour where the kit has one (Gabė's heart bolts). */
const BOLT_TINT: Partial<Record<string, number>> = { gabe: 0xff7aa8, bengas: 0xffa04a };
/** Sim v10 (GAPS B6): Guard Post domes drawn at once (more than the heroes on a team never stand). */
const DOMES = 4;
/** Sim v9 burst discs by owner: Bengas's stage fire and Gabė's heart balloon. */
const BURST_COLOR: Partial<Record<string, number>> = { bengas: 0xff6a3d, gabe: 0xff8fb8 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

export class ProjectileView {
  readonly group = new THREE.Group();
  private bolts: THREE.InstancedMesh;
  // Wave C (C3): zones (an arming burst is a telegraph) draw after the particle layers, so dust never hides them
  private zones = new DecalLayer(discTexture(), CAPS.zones, { additive: true, y: 0.07, renderOrder: TELEGRAPH_OVER, name: 'zones' });
  private trailT = 0;
  private time = 0;
  /** Sim v10 (GAPS B6): translucent half-spheres over Guard Post zones. */
  private domes: THREE.Mesh[] = [];
  myTeam: 0 | 1 = 0;
  /** Wave C (C3): element trails and their pace per quality tier; null keeps the plain trail (tests). */
  vfx: CombatVfx | null = null;
  /** Wave C (C4): a hero's card effects by slot (a Rare+ card tints its shots' trails; colour only). */
  card: ((id: number) => CardFx | null) | null = null;
  private trailN = 0;
  /** The old plain trail's options, reused (no object per puff). */
  private readonly plain = { additive: true, n: 1, exact: true, shape: SHAPE.SOFT, color: 0, intensity: 1.4, size: [0, 0], sizeEnd: 0.2, life: [0.18, 0.28], speed: [0.1, 0.4], fade: FADE.LINEAR };

  constructor(private readonly particles: Particles) {
    this.group.name = 'projectiles';
    const geo = new THREE.SphereGeometry(1, 10, 8);
    geo.scale(1.8, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    shadeBolts(mat);
    this.bolts = new THREE.InstancedMesh(geo, mat, CAPS.projectiles);
    this.bolts.name = 'bolts';
    this.bolts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bolts.setColorAt(0, new THREE.Color(1, 1, 1));
    this.bolts.count = 0;
    this.bolts.frustumCulled = false;
    this.group.add(this.bolts, this.zones.mesh);
    const domeGeo = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < DOMES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const dome = new THREE.Mesh(domeGeo, mat);
      dome.name = 'guard-post';
      dome.visible = false;
      dome.renderOrder = 2;
      this.domes.push(dome);
      this.group.add(dome);
    }
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    this.trailT -= dt;
    const trail = this.trailT <= 0;
    if (trail) {
      this.trailT = 1 / (this.vfx?.tier.trailHz ?? 40);
      this.trailN++;
    }
    let n = 0;
    for (const p of frame.projectiles) {
      if (n >= CAPS.projectiles) break;
      const L = look(p.kind, p.team);
      const owner = HERO_SHOTS.has(p.kind) ? frame.byId.get(p.owner)?.hero : undefined;
      const tint = p.kind === PROJECTILE_KIND.hero && owner ? BOLT_TINT[owner] : undefined;
      if (tint !== undefined) L.color = tint;
      const x = toX(p.fx);
      const z = toZ(p.fy);
      _dir.set(p.vx, 0, -p.vy);
      if (_dir.lengthSq() > 0) _dir.normalize();
      else _dir.set(1, 0, 0);
      _q.setFromUnitVectors(_up, _dir);
      _m.compose(_p.set(x, L.y, z), _q, _s.setScalar(L.size));
      this.bolts.setMatrixAt(n, _m);
      _c.setHex(L.color).multiplyScalar(1.6);
      this.bolts.setColorAt(n, _c);
      n++;
      if (trail) {
        // Wave C (C3): a hero's shot trails its element colour, with embers on Med and High
        if (this.vfx) this.vfx.trail(_p, owner ? tinted(elementColor(owner), this.card?.(p.owner)) : L.color, L.trail * (owner ? 1.25 : 1), owner !== undefined && (this.trailN + n) % 2 === 0);
        else {
          const o = this.plain;
          o.color = L.color;
          o.size[0] = L.trail;
          o.size[1] = L.trail * 1.4;
          this.particles.burst(_p, o);
        }
      }
    }
    this.bolts.count = n;
    this.bolts.instanceMatrix.needsUpdate = true;
    if (this.bolts.instanceColor) this.bolts.instanceColor.needsUpdate = true;
    this.zones.begin();
    let domes = 0;
    for (const z of frame.zones) {
      const rel = z.team === 2 ? RELATION.neutral : z.team === this.myTeam ? RELATION.ally : RELATION.enemy;
      if (z.kind === ZONE_KIND.dome) {
        // Sim v10 (GAPS B6): Guard Post, a gold floor ring in the relation colour under a shimmering half-sphere
        const r = z.radius / 1000;
        this.zones.add(toX(z.x), toZ(z.y), r * 2, rel, ZONE_GLARE_K * (0.55 + Math.sin(this.time * 6 + z.index) * 0.15));
        const d = this.domes[domes++];
        if (d) {
          d.visible = true;
          d.position.set(toX(z.x), 0.05, toZ(z.y));
          d.scale.set(r, r * 0.8, r);
          (d.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.time * 4 + z.index) * 0.05;
        }
        continue;
      }
      if (z.kind === ZONE_KIND.burst) {
        // Visible to both teams: the arm phase is a fast flashing telegraph in the relation colour, then the owner's fire or hearts.
        const arming = (z.arm ?? 0) > 0;
        const col = arming ? rel : (BURST_COLOR[frame.byId.get(z.owner)?.hero ?? ''] ?? rel);
        const a = arming ? 0.45 + Math.abs(Math.sin(this.time * 12)) * 0.4 : 0.75 + Math.sin(this.time * 9 + z.index) * 0.2;
        this.zones.add(toX(z.x), toZ(z.y), (z.radius / 1000) * 2, col, (arming ? ZONE_ARMING_K : ZONE_GLARE_K) * a);
        continue;
      }
      const pulse = 0.55 + Math.sin(this.time * 5 + z.index) * 0.15;
      this.zones.add(toX(z.x), toZ(z.y), (z.radius / 1000) * 2, rel, ZONE_GLARE_K * pulse);
    }
    this.zones.end();
    for (let i = domes; i < this.domes.length; i++) this.domes[i].visible = false;
  }

  dispose(): void {
    this.bolts.geometry.dispose();
    (this.bolts.material as THREE.Material).dispose();
    this.zones.dispose();
    this.domes[0]?.geometry.dispose();
    for (const d of this.domes) (d.material as THREE.Material).dispose();
  }
}
