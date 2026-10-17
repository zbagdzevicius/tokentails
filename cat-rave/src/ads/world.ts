/**
 * The 20 ad slots in the world (slots.ts): LED screens, floor-edge banners, laser-tower wraps, blimps and
 * the moon ring. An empty slot shows "Your ad here · $100" while ads are on sale; an approved ad shows its
 * image (the server's re-encoded WebP). Faces are picked by raycast (click → sponsor card / buy sheet).
 *
 * All materials are unlit (MeshBasicMaterial). Ad images come from the API's CDN with crossOrigin
 * 'anonymous'; if one cannot be drawn into WebGL (no CORS, network) the face shows the sponsor's name on a
 * plain card instead, drawn as text.
 */
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Frustum,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Object3D,
  type Raycaster,
  type Scene,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LiveAd } from './api';
import { AD_KINDS, AD_SLOTS, MOON_RING_R, PORTRAIT_ASPECT, blimpPosition, moonRingOffset, slotAspect, type AdKind, type AdSlot } from './slots';

export interface AdBoards {
  readonly group: Group;
  /** Empty slots show "Your ad here" only while selling. */
  setSelling(on: boolean): void;
  setAds(ads: readonly LiveAd[]): void;
  /** Slots held or in review: they show "Sold · coming soon" instead of "Your ad here". */
  setTaken(slotIds: readonly string[]): void;
  /** The approved ad on a slot, or null. */
  adFor(slotId: string): LiveAd | null;
  /** Slot under the pointer (desktop hover): its "Your ad here" card shows at full brightness. */
  setHover(slotId: string | null): void;
  update(time: number, camera: Camera, moonCenter: Vector3): void;
  /** Slot id under the ray (an approved ad, or an empty slot while selling), else null. */
  pick(ray: Raycaster): string | null;
  /** Slot ids whose face centre is inside the camera frustum and drawn (tests, analytics). */
  visibleSlots(camera: Camera): string[];
  /** World centre of a slot face now. */
  slotPosition(slotId: string, out: Vector3): boolean;
  /**
   * Screen rectangles (CSS px) of the visible slots that show an approved ad, for the HUD to yield to
   * (a paid ad never stays under the counter or the badge).
   */
  liveRects(camera: Camera, width: number, height: number): { slotId: string; x0: number; y0: number; x1: number; y1: number }[];
  dispose(): void;
}

const PLACEHOLDER_PX: Record<AdKind, [number, number]> = {
  screen: [768, 432],
  banner: [1024, 256],
  tower: [256, 768],
  blimp: [640, 320],
  moon: [960, 320],
};

const FONT = "'Lilita One', system-ui, -apple-system, 'Segoe UI', sans-serif";

/** "Your ad here · $100" card for a kind (shared by its slots); `sold` draws "Sold · coming soon". */
export function drawPlaceholder(kind: AdKind, canvas: HTMLCanvasElement = document.createElement('canvas'), sold = false): HTMLCanvasElement {
  const [w, h] = PLACEHOLDER_PX[kind];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#03130a');
  g.addColorStop(1, '#0c2a17');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const m = Math.round(Math.min(w, h) * 0.06);
  ctx.setLineDash([Math.max(8, m), Math.max(6, m * 0.7)]);
  ctx.lineWidth = Math.max(4, m * 0.35);
  ctx.strokeStyle = sold ? '#a26bff' : '#ff5fa8';
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#5dff8a';
  ctx.shadowBlur = Math.min(w, h) * 0.05;
  const lines: [string, number, string][] = sold
    ? kind === 'tower'
      ? [
          ['SOLD', 0.24, '#eafff0'],
          ['soon', 0.16, '#a26bff'],
        ]
      : [
          ['AD SPACE SOLD', kind === 'banner' ? 0.36 : 0.2, '#eafff0'],
          ['coming soon', kind === 'banner' ? 0.18 : 0.11, '#c9a8ff'],
        ]
    : kind === 'tower'
      ? [
          ['YOUR', 0.2, '#eafff0'],
          ['AD', 0.2, '#eafff0'],
          ['HERE', 0.2, '#eafff0'],
          ['$100', 0.16, '#5dff8a'],
        ]
      : [
          ['YOUR AD HERE', kind === 'banner' ? 0.36 : 0.22, '#eafff0'],
          ['$100 · tap to advertise', kind === 'banner' ? 0.18 : 0.11, '#5dff8a'],
        ];
  const unit = kind === 'tower' ? w : h;
  const total = lines.reduce((s, [, k]) => s + unit * k * 1.15, 0);
  let y = h / 2 - total / 2;
  for (const [text, k, color] of lines) {
    const size = Math.round(unit * k);
    ctx.font = `${size}px ${FONT}`;
    ctx.fillStyle = color;
    let fit = size;
    while (fit > 10 && ctx.measureText(text).width > w - 4 * m) {
      fit -= 2;
      ctx.font = `${fit}px ${FONT}`;
    }
    y += (unit * k * 1.15) / 2;
    ctx.fillText(text, w / 2, y);
    y += (unit * k * 1.15) / 2;
  }
  return canvas;
}

/** Fallback face for an approved ad whose image cannot be drawn: its sponsor name, as text. */
function drawNameCard(kind: AdKind, name: string): HTMLCanvasElement {
  const [w, h] = PLACEHOLDER_PX[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#071d0e';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eafff0';
  let size = Math.round(Math.min(w, h) * 0.3);
  ctx.font = `${size}px ${FONT}`;
  while (size > 10 && ctx.measureText(name).width > w * 0.9) {
    size -= 2;
    ctx.font = `${size}px ${FONT}`;
  }
  ctx.fillText(name, w / 2, h / 2);
  return canvas;
}

interface SlotView {
  slot: AdSlot;
  root: Group;
  faces: Mesh[];
  material: MeshBasicMaterial;
  ad: LiveAd | null;
  texture: Texture | null;
  body?: Object3D;
}

export function createAdBoards(scene: Scene, opts: { loader?: TextureLoader } = {}): AdBoards {
  const group = new Group();
  group.name = 'ad-slots';
  group.visible = false;
  scene.add(group);
  const loader = opts.loader ?? new TextureLoader();
  loader.setCrossOrigin('anonymous');

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ------------------------------------------------------------------ placeholders (one per kind)
  const placeholders = new Map<AdKind, CanvasTexture>();
  const soldCards = new Map<AdKind, CanvasTexture>();
  const canvasTexture = (c: HTMLCanvasElement) => {
    const t = keep(new CanvasTexture(c));
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    return t;
  };
  for (const kind of Object.keys(AD_KINDS) as AdKind[]) {
    placeholders.set(kind, canvasTexture(drawPlaceholder(kind)));
    soldCards.set(kind, canvasTexture(drawPlaceholder(kind, undefined, true)));
  }
  // Redraw once the display font is in (the first paint may use the fallback font).
  void document.fonts
    ?.load?.(`40px ${FONT}`)
    .then(() => {
      for (const [kind, t] of placeholders) {
        drawPlaceholder(kind, t.image as HTMLCanvasElement);
        t.needsUpdate = true;
      }
      for (const [kind, t] of soldCards) {
        drawPlaceholder(kind, t.image as HTMLCanvasElement, true);
        t.needsUpdate = true;
      }
    })
    .catch(() => undefined);

  // ------------------------------------------------------------------ structures
  const dark = keep(new MeshBasicMaterial({ color: new Color(0x050f09) }));
  const neon = keep(new MeshBasicMaterial({ color: new Color(0.3, 1.4, 0.5) }));
  const darkParts: BufferGeometry[] = [];
  // The moon banners' backing plate: like `dark`, but no fog (the moon is far beyond the fog range).
  const darkFog = keep(new MeshBasicMaterial({ color: new Color(0x050f09), fog: false }));
  const neonParts: BufferGeometry[] = [];

  // One shared envelope: baked shading (light top, dark belly, a neon belt) so the unlit body reads round.
  const blimpGeo = keep(new SphereGeometry(1, 24, 14));
  {
    const n = blimpGeo.getAttribute('normal');
    const p = blimpGeo.getAttribute('position');
    const col = new Float32Array(n.count * 3);
    const top = new Color(0.95, 0.42, 0.7);
    const belly = new Color(0.22, 0.05, 0.16);
    const belt = new Color(0.4, 1.4, 0.6);
    const c = new Color();
    for (let i = 0; i < n.count; i++) {
      c.copy(belly).lerp(top, Math.min(1, Math.max(0, 0.5 + 0.6 * n.getY(i))));
      if (Math.abs(p.getY(i)) < 0.09) c.copy(belt);
      col.set([c.r, c.g, c.b], i * 3);
    }
    blimpGeo.setAttribute('color', new Float32BufferAttribute(col, 3));
  }
  const blimpMat = keep(new MeshBasicMaterial({ vertexColors: true }));
  const views: SlotView[] = [];
  const faceGeo = new Map<string, PlaneGeometry>();
  const tmp = new Vector3();

  for (const slot of AD_SLOTS) {
    const root = new Group();
    root.name = `ad-${slot.id}`;
    const key = `${slot.w}x${slot.h}`;
    let geo = faceGeo.get(key);
    if (!geo) {
      geo = keep(new PlaneGeometry(slot.w, slot.h));
      faceGeo.set(key, geo);
    }
    const material = keep(
      new MeshBasicMaterial({
        map: placeholders.get(slot.kind)!,
        // Transparent so an empty slot's "Your ad here" card can fade on desktop (update()).
        transparent: true,
        toneMapped: true,
        fog: slot.kind !== 'moon',
        ...(slot.kind === 'blimp' ? { side: DoubleSide } : {}),
      }),
    );
    const front = new Mesh(geo, material);
    // Moon banners draw after the (transparent) ring round the moon, never under its neon line.
    if (slot.kind === 'moon') front.renderOrder = 2;
    front.userData.adSlot = slot.id;
    front.name = `ad-face-${slot.id}`;
    const faces = [front];
    root.add(front);
    if (slot.twoSided && slot.kind !== 'blimp') {
      const back = new Mesh(geo, material);
      back.rotation.y = Math.PI;
      back.userData.adSlot = slot.id;
      back.name = `ad-face-${slot.id}-back`;
      faces.push(back);
      root.add(back);
    }
    const view: SlotView = { slot, root, faces, material, ad: null, texture: null };

    if (slot.kind === 'moon') {
      // Placed relative to the moon every frame (portrait phones move it). An opaque dark plate just
      // behind the face hides the ring's neon line where it passes behind the (half-faded) banner.
      const plate = new Mesh(geo, darkFog);
      plate.position.z = -0.2;
      plate.scale.set(1.04, 1.1, 1);
      plate.name = `ad-plate-${slot.id}`;
      root.add(plate);
    } else if (slot.kind !== 'blimp') {
      root.position.set(slot.pos[0], slot.pos[1], slot.pos[2]);
      root.rotation.y = slot.yaw;
      root.updateMatrix();
      const place = (g: BufferGeometry) => g.applyMatrix4(root.matrix);
      const bottom = slot.pos[1] - slot.h / 2;
      if (slot.kind === 'screen') {
        darkParts.push(place(new BoxGeometry(slot.w + 0.3, slot.h + 0.3, 0.25).translate(0, 0, -0.14)));
        for (const sx of [-1, 1]) darkParts.push(place(new BoxGeometry(0.28, bottom + 0.2, 0.28).translate((sx * slot.w) / 3, -slot.h / 2 - (bottom + 0.2) / 2 + 0.1, -0.2)));
        neonParts.push(place(new BoxGeometry(slot.w + 0.34, 0.05, 0.05).translate(0, slot.h / 2 + 0.17, 0)));
        neonParts.push(place(new BoxGeometry(slot.w + 0.34, 0.05, 0.05).translate(0, -slot.h / 2 - 0.17, 0)));
      } else if (slot.kind === 'banner') {
        for (const sx of [-1, 1]) {
          darkParts.push(place(new CylinderGeometry(0.06, 0.06, slot.pos[1] + slot.h / 2 + 0.1, 8).translate((sx * (slot.w / 2 + 0.08)), -(slot.pos[1] - (slot.pos[1] + slot.h / 2 + 0.1) / 2), 0)));
        }
        neonParts.push(place(new BoxGeometry(slot.w, 0.04, 0.06).translate(0, slot.h / 2 + 0.04, 0)));
        darkParts.push(place(new BoxGeometry(slot.w + 0.08, slot.h + 0.08, 0.02)));
        for (const f of faces) f.position.z = f === front ? 0.015 : -0.015;
      } else if (slot.kind === 'tower') {
        const towerH = 11;
        darkParts.push(place(new BoxGeometry(slot.w + 0.2, towerH, 0.5).translate(0, towerH / 2 - slot.pos[1], 0)));
        neonParts.push(place(new BoxGeometry(0.06, towerH, 0.06).translate(-(slot.w / 2 + 0.12), towerH / 2 - slot.pos[1], 0.26)));
        neonParts.push(place(new BoxGeometry(0.06, towerH, 0.06).translate(slot.w / 2 + 0.12, towerH / 2 - slot.pos[1], -0.26)));
        neonParts.push(place(new SphereGeometry(0.35, 12, 8).translate(0, towerH - slot.pos[1] + 0.3, 0)));
        for (const f of faces) f.position.z = f === front ? 0.26 : -0.26;
      }
    } else {
      // Blimp: a soft pink envelope above the screen; the screen turns to face the camera.
      const body = new Mesh(blimpGeo, blimpMat);
      body.scale.set(2.6, 0.95, 0.95);
      body.name = `ad-blimp-${slot.index + 1}`;
      group.add(body);
      view.body = body;
    }
    group.add(root);
    views.push(view);
  }


  // Moon ring: a thin neon circle round the disc (never over it), facing the hero camera.
  const ringGeo = keep(new TorusGeometry(MOON_RING_R, 0.55, 6, 160));
  const ring = new Mesh(ringGeo, keep(new MeshBasicMaterial({ color: new Color(0.35, 1.5, 0.55), fog: false, transparent: true, opacity: 0.85 })));
  ring.name = 'ad-moon-ring';
  ring.renderOrder = 1;
  ring.userData.noMirror = true;
  group.add(ring);

  const darkMerged = keep(mergeGeometries(darkParts, false)!);
  const neonMerged = keep(mergeGeometries(neonParts, false)!);
  darkParts.forEach((g) => g.dispose());
  neonParts.forEach((g) => g.dispose());
  const darkMesh = new Mesh(darkMerged, dark);
  darkMesh.name = 'ad-structures';
  const neonMesh = new Mesh(neonMerged, neon);
  neonMesh.name = 'ad-structures-neon';
  group.add(darkMesh, neonMesh);

  // ------------------------------------------------------------------ state
  let selling = false;
  let hovered: string | null = null;
  /** "Your ad here" cards on desktop: half bright, so the boards never read as a billboard wall. */
  const PLACEHOLDER_DIM = 0.5;
  let taken = new Set<string>();
  const emptyFace = (v: SlotView) => (taken.has(v.slot.id) ? soldCards : placeholders).get(v.slot.kind)!;
  const refresh = () => {
    let any = false;
    for (const v of views) {
      const on = !!v.ad || selling;
      v.root.visible = on;
      if (v.body) v.body.visible = on;
      any ||= on;
    }
    const moonOn = views.some((v) => v.slot.kind === 'moon' && v.root.visible);
    ring.visible = moonOn;
    darkMesh.visible = neonMesh.visible = any;
    group.visible = any;
  };
  refresh();

  const setFace = (v: SlotView, tex: Texture) => {
    v.material.map = tex;
    v.material.needsUpdate = true;
  };

  const frustum = new Frustum();
  const proj = new Matrix4();

  const api: AdBoards = {
    group,
    setSelling(on) {
      selling = on;
      refresh();
    },
    setAds(ads) {
      const bySlot = new Map(ads.map((a) => [a.slotId, a]));
      for (const v of views) {
        const next = bySlot.get(v.slot.id) ?? null;
        if (next?.adId === v.ad?.adId && next?.imageUrl === v.ad?.imageUrl) continue;
        v.texture?.dispose();
        v.texture = null;
        v.ad = next;
        if (!next) {
          setFace(v, emptyFace(v));
          continue;
        }
        const wanted = next.adId;
        loader.load(
          next.imageUrl,
          (t) => {
            if (v.ad?.adId !== wanted) return t.dispose();
            t.colorSpace = SRGBColorSpace;
            t.anisotropy = 4;
            v.texture = t;
            setFace(v, t);
          },
          undefined,
          () => {
            if (v.ad?.adId !== wanted) return;
            const t = new CanvasTexture(drawNameCard(v.slot.kind, next.name));
            t.colorSpace = SRGBColorSpace;
            v.texture = t;
            setFace(v, t);
          },
        );
      }
      refresh();
    },
    setTaken(ids) {
      taken = new Set(ids);
      for (const v of views) if (!v.ad) setFace(v, emptyFace(v));
    },
    adFor(slotId) {
      return views.find((v) => v.slot.id === slotId)?.ad ?? null;
    },
    setHover(slotId) {
      hovered = slotId;
    },
    update(time, camera, moonCenter) {
      if (!group.visible) return;
      const aspect = (camera as unknown as { aspect?: number }).aspect;
      const portrait = typeof aspect === 'number' && aspect < PORTRAIT_ASPECT;
      for (const v of views) {
        const s = v.slot;
        // Empty "Your ad here" cards fade to half on desktop (full on hover); phones keep them full,
        // they are small there already. Approved ads and "Sold" cards are always full.
        const dim = !v.ad && !taken.has(s.id) && !portrait && hovered !== s.id;
        v.material.opacity = dim ? PLACEHOLDER_DIM : 1;
        if (s.kind === 'moon') {
          // Portrait phones: higher on the ring, inside the narrow hero frame (slots.ts MOON_RING_DEG).
          const o = portrait ? moonRingOffset(s.index, true) : s.pos;
          v.root.position.set(moonCenter.x + o[0], moonCenter.y + o[1], moonCenter.z + o[2]);
        } else if (s.kind === 'blimp') {
          const p = blimpPosition(s.phase ?? 0, time);
          const bob = Math.sin(time * 0.6 + (s.phase ?? 0)) * 0.15;
          v.root.position.set(p.x, p.y - 1.35 + bob, p.z);
          // Screen faces the camera (yaw only, so it never tilts on its side).
          tmp.copy(camera.position);
          v.root.rotation.set(0, Math.atan2(tmp.x - p.x, tmp.z - p.z), 0);
          if (v.body) {
            v.body.position.set(p.x, p.y + bob, p.z);
            const ahead = blimpPosition(s.phase ?? 0, time + 1);
            v.body.rotation.set(0, Math.atan2(ahead.x - p.x, ahead.z - p.z) - Math.PI / 2, 0);
          }
        }
      }
      ring.position.set(moonCenter.x, moonCenter.y, moonCenter.z + 30);
    },
    pick(ray) {
      if (!group.visible) return null;
      const faces: Object3D[] = [];
      for (const v of views) if (v.root.visible) faces.push(...v.faces);
      const hit = ray.intersectObjects(faces, false)[0];
      return hit ? (hit.object.userData.adSlot as string) : null;
    },
    visibleSlots(camera) {
      camera.updateMatrixWorld();
      proj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(proj);
      const out: string[] = [];
      for (const v of views) {
        if (!v.root.visible) continue;
        v.root.updateMatrixWorld();
        v.faces[0].getWorldPosition(tmp);
        if (frustum.containsPoint(tmp)) out.push(v.slot.id);
      }
      return out;
    },
    liveRects(camera, width, height) {
      const out: { slotId: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      if (!group.visible) return out;
      camera.updateMatrixWorld();
      for (const v of views) {
        if (!v.ad || !v.root.visible) continue;
        v.root.updateMatrixWorld();
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        let front = false;
        for (const [cx, cy] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ] as const) {
          tmp.set((cx * v.slot.w) / 2, (cy * v.slot.h) / 2, 0);
          v.faces[0].localToWorld(tmp);
          tmp.project(camera);
          if (tmp.z < 1) front = true;
          const x = (tmp.x * 0.5 + 0.5) * width;
          const y = (-tmp.y * 0.5 + 0.5) * height;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
        if (!front || x1 < 0 || y1 < 0 || x0 > width || y0 > height) continue;
        out.push({ slotId: v.slot.id, x0, y0, x1, y1 });
      }
      return out;
    },
    slotPosition(slotId, out) {
      const v = views.find((x) => x.slot.id === slotId);
      if (!v) return false;
      v.root.updateMatrixWorld();
      v.faces[0].getWorldPosition(out);
      return true;
    },
    dispose() {
      scene.remove(group);
      for (const v of views) v.texture?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
  return api;
}

/** Image aspect of a slot (re-exported for the sheet). */
export { slotAspect };
