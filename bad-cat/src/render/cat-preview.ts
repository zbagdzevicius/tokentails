/**
 * Cat maker turntable (L4): the procedural cat on a wooden plinth, slowly turning, with idle blinks
 * and tail sway, on its own small canvas. It owns a short-lived WebGL context: call dispose() when
 * the cat maker closes (before the game renderer is created) to keep one context alive at a time.
 */
import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { CatSpec } from '../types';
import { buildCatRig, disposeCatRig, poseCat, type CatRig } from './cat-rig';
import { decalTexture } from './face-decal-material';
import { GeoBuilder } from './geo';
import { PAL } from './palette';

export function createCatPreview(
  canvas: HTMLCanvasElement,
  spec: CatSpec,
): { update(spec: CatSpec, face?: HTMLCanvasElement | ImageBitmap | null): void; dispose(): void } {
  let gl: WebGLRenderer | null = null;
  try {
    gl = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  } catch {
    gl = null;
  }
  // No WebGL: throw so the cat maker's mountPreview switches to its 2D drawing (a do-nothing handle left the canvas blank).
  if (!gl) throw new Error('WebGL unavailable');
  const renderer = gl;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(new Color(PAL.bg), 0);
  const scene = new Scene();
  const cam = new PerspectiveCamera(30, 1, 0.05, 20);
  cam.position.set(0, 0.62, 1.85);
  cam.lookAt(0, 0.2, 0);
  scene.add(new HemisphereLight(0xfff0dc, 0x8a6a6e, 2.0));
  const sun = new DirectionalLight(0xffe0b0, 2.0);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);
  const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pg = new GeoBuilder();
  pg.cylUp(0.42, 0.45, 0.06, 18, PAL.wood, { y: -0.06 });
  pg.cylUp(0.46, 0.46, 0.014, 18, PAL.woodDark, { y: -0.074 });
  pg.cylUp(0.34, 0.34, 0.004, 18, PAL.rug, { y: 0 });
  const plinth = new Mesh(pg.build(), mat);
  scene.add(plinth);

  let rig: CatRig = buildCatRig(spec, null);
  scene.add(rig.root);
  /** Frame the whole cat (ears, tail, Chonk's belly) and the plinth top: fit its bounding sphere with a margin. */
  const fit = (): void => {
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0 });
    rig.root.updateMatrixWorld(true);
    const sph = new Box3().setFromObject(rig.root).getBoundingSphere(new Sphere());
    const r = Math.max(0.2, sph.radius) * 1.12;
    const half = (cam.fov * Math.PI) / 360;
    const halfW = Math.atan(Math.tan(half) * Math.max(0.3, cam.aspect));
    const d = r / Math.sin(Math.min(half, halfW));
    const center = sph.center.clone();
    center.y = Math.max(center.y, r * 0.55); // keep a sliver of the plinth in the shot
    cam.position.copy(center).addScaledVector(new Vector3(0, 0.32, 1).normalize(), d);
    cam.lookAt(center);
  };
  let raf = 0;
  let alive = true;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth || canvas.width);
    const h = Math.max(1, canvas.clientHeight || canvas.height);
    renderer.setPixelRatio(Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    fit();
  };
  resize();

  const loop = () => {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (typeof document !== 'undefined' && document.hidden) return;
    const now = performance.now();
    const T = ((now - t0) / 1000) * 30;
    if (canvas.clientWidth && Math.abs(canvas.clientWidth * renderer.getPixelRatio() - canvas.width) > 2) resize();
    // 3/4 front with a gentle sway: the face (and the photo decal) always faces the player
    rig.root.rotation.y = 0.5 + Math.sin((T / 30) * 0.5) * 0.28;
    poseCat(rig, { T, act: 0, actP: 0, moving: 0, phase: 0, blink: Math.floor(T) % 90 < 4, loaf: 0 });
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);

  return {
    update(next: CatSpec, face?: HTMLCanvasElement | ImageBitmap | null) {
      scene.remove(rig.root);
      disposeCatRig(rig);
      rig = buildCatRig(next, face ? decalTexture(face) : null);
      scene.add(rig.root);
      fit();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      scene.remove(rig.root);
      disposeCatRig(rig);
      plinth.geometry.dispose();
      mat.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
