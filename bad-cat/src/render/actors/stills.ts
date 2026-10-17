/**
 * Stills (GDD 7.4, 11.2): a cat portrait (the turntable plinth pose, or a mugshot: front pose in front of a height
 * chart with the smug half-blink) for the cat, cameo and Rap Sheet cards, and a whole-room still (OG 1200 × 630,
 * picker thumbnails, `tools/render-og.mjs`).
 *
 * One WebGL context (GDD 11.2): when a GameRenderer is alive it lends its context through the module registry
 * (`registerStillHost`): the still is drawn at w × h into its canvas, copied to a 2D canvas in the same task, and
 * the live frame is redrawn before the task ends, so nothing flickers. Without a live renderer a temporary
 * renderer is created and disposed right after. Both resolve null without WebGL or a DOM.
 */
import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { initSim } from '../../sim';
import { CELL_M, DEFAULT_CAT, type CatSpec, type PlayableRoom } from '../../types';
import { buildCatRig, disposeCatRig, poseCat } from '../cat-rig';
import { OUTLINE_UNIFORMS } from '../cat-outline';
import { decalTexture } from '../face-decal-material';
import { GeoBuilder } from '../geo';
import { HumanView } from '../human-rig';
import { PAL } from '../palette';
import { PropsView } from '../props-view';
import { buildRoom } from '../room-view';
import { roomPose } from '../camera';
import { createWorldDynamics } from '../world-dynamics';
import { cellX, cellZ, levelY } from '../space';

/** A live renderer that can lend its context for one draw. */
export interface StillHost {
  /** Draw `scene` with `cam` at w × h and return a 2D copy, then restore the live frame. null when lost. */
  drawStill(scene: Scene, cam: PerspectiveCamera, w: number, h: number, clear: number | null): HTMLCanvasElement | null;
}

let host: StillHost | null = null;
export function registerStillHost(h: StillHost): void {
  host = h;
}
export function unregisterStillHost(h: StillHost): void {
  if (host === h) host = null;
}
export function stillHost(): StillHost | null {
  return host;
}

/** Copy a WebGL canvas into a new 2D canvas (call in the same task as the draw). */
export function copyCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(src, 0, 0, w, h);
  return c;
}

/** Draw with the live host, else with a temporary context. */
function draw(scene: Scene, cam: PerspectiveCamera, w: number, h: number, clear: number | null): HTMLCanvasElement | null {
  if (host) return host.drawStill(scene, cam, w, h, clear);
  if (typeof document === 'undefined') return null;
  let gl: WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    gl = new WebGLRenderer({ canvas, antialias: true, alpha: clear === null, preserveDrawingBuffer: true });
    gl.outputColorSpace = SRGBColorSpace;
    gl.setPixelRatio(1);
    gl.setSize(w, h, false);
    if (clear === null) gl.setClearColor(0x000000, 0);
    else gl.setClearColor(clear, 1);
    OUTLINE_UNIFORMS.uRes.value.set(w, h);
    gl.render(scene, cam);
    return copyCanvas(canvas, w, h);
  } catch {
    return null;
  } finally {
    if (gl) {
      gl.forceContextLoss();
      gl.dispose();
    }
  }
}

function lights(scene: Scene): void {
  scene.add(new HemisphereLight(0xfff0dc, 0x8a6a6e, 2.0));
  const sun = new DirectionalLight(0xffe0b0, 2.0);
  sun.position.set(1, 2, 1.8);
  scene.add(sun);
}

function heightChartTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#d9dde6';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#5b6170';
    g.fillStyle = '#5b6170';
    g.font = '700 22px system-ui, sans-serif';
    // the plane is CHART_H tall from the floor: a line every 0.05 m, labelled every 0.1 m
    const px = 512 / (CHART_H / 0.05);
    for (let i = 0; i * px <= 512; i++) {
      const y = 512 - i * px;
      const major = i % 2 === 0;
      g.lineWidth = major ? 4 : 2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(major ? 512 : 70, y);
      g.stroke();
      if (major && i > 0) g.fillText(`${i * 5}`, 8, y + 22);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}
const CHART_H = 1.0;

/**
 * Aim `cam` along `dir` at the posed cat's box (plus `extra` world boxes, e.g. the plinth) so it fills the frame
 * with `margin`; the box centre is the aim point.
 */
function fitCat(cam: PerspectiveCamera, root: Group, aspect: number, margin: number, dir: Vector3, extra?: Box3): void {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root, true);
  if (extra) box.union(extra);
  const size = box.getSize(new Vector3());
  const c = box.getCenter(new Vector3());
  const half = (cam.fov * Math.PI) / 360;
  const needH = (Math.max(size.y, size.x / Math.max(0.3, aspect)) / 2) * margin;
  const d = needH / Math.tan(half) + Math.max(size.x, size.z) / 2;
  cam.aspect = aspect;
  cam.position.copy(c).addScaledVector(dir.clone().normalize(), d);
  cam.lookAt(c);
}

/** Cat portrait still (see the module comment). */
export async function renderCatPortrait(
  spec: CatSpec,
  face: HTMLCanvasElement | ImageBitmap | null,
  opts: { w: number; h: number; pose: 'plinth' | 'mugshot' },
): Promise<HTMLCanvasElement | null> {
  if (typeof document === 'undefined') return null;
  const w = Math.max(16, Math.round(opts.w));
  const h = Math.max(16, Math.round(opts.h));
  const scene = new Scene();
  lights(scene);
  const disposers: (() => void)[] = [];
  const rig = buildCatRig(spec, face ? decalTexture(face) : null);
  disposers.push(() => disposeCatRig(rig));
  scene.add(rig.root);
  const cam = new PerspectiveCamera(28, w / h, 0.05, 20);
  let clear: number | null = null;
  if (opts.pose === 'mugshot') {
    // front pose, sitting tall, the smug half-blink, head a touch tilted
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0, sit: 1, lid: 'half', headYaw: 0, headPitch: -0.05 });
    rig.head.rotation.z = 0.12;
    const tex = heightChartTexture();
    // a square chart, CHART_H tall from the floor, behind the cat
    const bg = new Mesh(new PlaneGeometry(CHART_H, CHART_H), tex ? new MeshBasicMaterial({ map: tex }) : new MeshBasicMaterial({ color: 0xd9dde6 }));
    bg.position.set(0, CHART_H / 2, -0.3);
    scene.add(bg);
    disposers.push(() => {
      bg.geometry.dispose();
      (bg.material as MeshBasicMaterial).dispose();
      tex?.dispose();
    });
    fitCat(cam, rig.root, w / h, 1.3, new Vector3(0, 0.05, 1));
    clear = 0xd9dde6;
  } else {
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0, sit: 1, headYaw: -0.25 });
    rig.root.rotation.y = 0.5;
    const pg = new GeoBuilder();
    pg.cylUp(0.42, 0.45, 0.06, 18, PAL.wood, { y: -0.06 });
    pg.cylUp(0.46, 0.46, 0.014, 18, PAL.woodDark, { y: -0.074 });
    pg.cylUp(0.34, 0.34, 0.004, 18, PAL.rug, { y: 0 });
    const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const plinth = new Mesh(pg.build(), mat);
    scene.add(plinth);
    disposers.push(() => {
      plinth.geometry.dispose();
      mat.dispose();
    });
    fitCat(cam, rig.root, w / h, 1.15, new Vector3(0, 0.35, 1), new Box3(new Vector3(-0.46, -0.074, -0.46), new Vector3(0.46, 0, 0.46)));
  }
  cam.updateProjectionMatrix();
  try {
    return draw(scene, cam, w, h, clear);
  } finally {
    for (const d of disposers) d();
  }
}

/** Whole-room still as a PNG Blob (OG cards, picker thumbnails). */
export async function renderRoomStill(play: PlayableRoom, opts: { w: number; h: number }): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const w = Math.max(16, Math.round(opts.w));
  const h = Math.max(16, Math.round(opts.h));
  const scene = new Scene();
  scene.background = new Color(PAL.bg);
  lights(scene);
  const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const room = buildRoom(play, mat);
  const props = new PropsView(play, mat);
  const dyn = createWorldDynamics(play, mat);
  const group = new Group();
  group.add(room.group, props.group, dyn.group);
  scene.add(group);
  const humans: HumanView[] = [new HumanView(play, mat, 0)];
  if (play.routine2) humans.push(new HumanView(play, mat, 1));
  const rig = buildCatRig(DEFAULT_CAT, null);
  try {
    const s = initSim(play, DEFAULT_CAT);
    props.update(s, 0, 0, null, false);
    dyn.update(s, 0, []);
    const W = play.shell.width;
    const D = play.shell.depth;
    const heads: Vector3[] = [];
    humans.forEach((hv, i) => {
      const hs = s.humans[i] ?? s.humans[0];
      scene.add(hv.rig.root);
      hv.update(hs, { T: 0, alpha: 0, dtTicks: 0, seen: false, scooping: false, caughtOther: false, caughtTicks: 0, catWorld: new Vector3(), w: W, d: D });
      heads.push(hv.headTop(new Vector3()));
    });
    const sp = play.room.spawn;
    rig.root.position.set(cellX(sp.x, W), levelY(play.shell.levels[sp.z * W + sp.x] ?? 0), cellZ(sp.z, D));
    rig.root.rotation.y = Math.PI * 0.85;
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0, sit: 1 });
    scene.add(rig.root);
    const pose = roomPose(w / h, (W * CELL_M) / 2, (D * CELL_M) / 2, heads);
    const cam = new PerspectiveCamera(pose.fov, w / h, 0.05, 60);
    cam.position.copy(pose.position);
    cam.lookAt(pose.target);
    cam.updateProjectionMatrix();
    const c = draw(scene, cam, w, h, PAL.bg);
    if (!c) return null;
    return await new Promise<Blob | null>((resolve) => {
      try {
        c.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  } finally {
    room.dispose();
    props.dispose();
    dyn.dispose();
    for (const hv of humans) hv.dispose();
    disposeCatRig(rig);
    mat.dispose();
  }
}
