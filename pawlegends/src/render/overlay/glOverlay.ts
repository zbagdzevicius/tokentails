/**
 * PERF-IOS §8 Track A: draws a QuadBatch over the scene with the game's own WebGLRenderer, in one draw call, right
 * after the 3D frame (same rAF callback, so the plates never lag the bodies by a frame). No second canvas, no
 * full-screen CPU raster: the GPU blends a few hundred small quads.
 *
 * The atlas texture is re-uploaded only when a stamp was painted (rare after the first seconds); the vertex buffer
 * uploads only the quads used this frame. renderer.info keeps the scene's counts plus this draw (the perf readout and
 * `data-draws` read them after the frame).
 */
import * as THREE from 'three';
import { QUAD_FLOATS, VERT_FLOATS, MAX_QUADS, type QuadBatch } from './quadBatch';
import type { StampAtlas } from './atlas';

const VERT = /* glsl */ `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUv;
attribute vec4 aColor;
attribute vec2 aAux;
uniform vec2 uRes;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vAux;
void main() {
  vUv = aUv;
  vColor = aColor;
  vAux = aAux;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vAux;
void main() {
  vec4 c = texture2D(uAtlas, vUv) * vColor;
  // lines: a 1 px anti-aliased edge (vAux.x = signed px across, vAux.y = half width)
  if (vAux.y > 0.0) c *= clamp(vAux.y - abs(vAux.x) + 0.5, 0.0, 1.0);
  gl_FragColor = c;
}`;

export class GlOverlay {
  readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly buf: THREE.InterleavedBuffer;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.RawShaderMaterial;
  private readonly tex: THREE.CanvasTexture | null;
  private readonly mesh: THREE.Mesh;
  private gen = -1;
  /** Draws issued (tests, the perf readout). */
  draws = 0;
  /** Atlas uploads so far. */
  uploads = 0;

  constructor(
    private readonly batch: QuadBatch,
    private readonly atlas: StampAtlas,
  ) {
    this.buf = new THREE.InterleavedBuffer(batch.data, VERT_FLOATS);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', new THREE.InterleavedBufferAttribute(this.buf, 2, 0));
    this.geo.setAttribute('aUv', new THREE.InterleavedBufferAttribute(this.buf, 2, 2));
    this.geo.setAttribute('aColor', new THREE.InterleavedBufferAttribute(this.buf, 4, 4));
    this.geo.setAttribute('aAux', new THREE.InterleavedBufferAttribute(this.buf, 2, 8));
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) {
      const v = q * 4;
      idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.tex = atlas.canvas ? new THREE.CanvasTexture(atlas.canvas) : null;
    if (this.tex) {
      this.tex.premultiplyAlpha = true;
      this.tex.generateMipmaps = false;
      this.tex.minFilter = THREE.LinearFilter;
      this.tex.magFilter = THREE.LinearFilter;
      this.tex.flipY = false;
    }
    this.mat = new THREE.RawShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAtlas: { value: this.tex }, uRes: { value: new THREE.Vector2(1, 1) } },
      transparent: true,
      // screen y runs down, so the quads wind clockwise in clip space: no face culling
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.scene.add(this.mesh);
    this.scene.matrixWorldAutoUpdate = false;
  }

  /** Draw this frame's batch over what `renderer` drew (call after the scene's render, same frame). */
  draw(renderer: THREE.WebGLRenderer): void {
    const n = this.batch.count;
    if (n === 0 || !this.tex) return;
    if (this.atlas.dirty || this.atlas.generation !== this.gen) {
      this.tex.needsUpdate = true;
      this.atlas.dirty = false;
      this.gen = this.atlas.generation;
      this.uploads++;
    }
    this.buf.clearUpdateRanges();
    this.buf.addUpdateRange(0, n * QUAD_FLOATS);
    this.buf.needsUpdate = true;
    this.geo.setDrawRange(0, n * 6);
    const el = renderer.domElement;
    (this.mat.uniforms.uRes.value as THREE.Vector2).set(Math.max(1, el.width), Math.max(1, el.height));
    const info = renderer.info;
    const calls = info.render.calls;
    const tris = info.render.triangles;
    const frame = info.render.frame;
    const autoClear = renderer.autoClear;
    const shadow = renderer.shadowMap.autoUpdate;
    const tone = renderer.toneMapping;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadow;
    renderer.toneMapping = tone;
    // keep the scene's counts (the perf readout reads them after the frame) plus this one draw
    if (info.autoReset) {
      info.render.calls += calls;
      info.render.triangles += tris;
      info.render.frame = frame;
    }
    this.draws++;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.tex?.dispose();
  }
}
