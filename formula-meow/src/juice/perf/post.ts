/**
 * Post-processing (feel lane, lazy chunk, high quality tier only): a cheap single-chain bloom plus a boost grade.
 *
 *   scene → full-res target (4× MSAA where WebGL2 has it)
 *   1. threshold + 4-tap box downsample → half res          (1 draw)
 *   2. 8-tap ring blur → quarter res                        (1 draw)
 *   3. composite: scene + bloom, saturation and a vignette that deepen while boosting, sRGB out (1 draw)
 *
 * Three extra draw calls and two small targets. The speed-lines pass (juice/vfx/speed-lines.ts) is part of the scene,
 * so it is graded too. `PostFx.render` is called instead of `renderer.render` for the race camera only.
 */
import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Texture,
  type WebGLRenderer,
} from 'three';

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const THRESH_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
vec3 pick(vec2 o){
  vec3 c = texture2D(tSrc, vUv + o * uTexel).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  return c * k;
}
void main(){
  vec3 c = pick(vec2(-1.0, -1.0)) + pick(vec2(1.0, -1.0)) + pick(vec2(-1.0, 1.0)) + pick(vec2(1.0, 1.0));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const BLUR_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 o = vec2(cos(a), sin(a)) * (i < 4 ? 1.5 : 3.0);
    c += texture2D(tSrc, vUv + o * uTexel).rgb * 0.1;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const COMP_FS = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uSat; uniform float uVig; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tBloom, vUv).rgb;
  c += b * uBloom;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  vec2 p = vUv - 0.5;
  c *= 1.0 - uVig * smoothstep(0.25, 0.75, length(p * vec2(1.0, 1.3)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export class PostFx {
  private readonly main: WebGLRenderTarget;
  private readonly half: WebGLRenderTarget;
  private readonly quarter: WebGLRenderTarget;
  private readonly quad: Mesh;
  private readonly scene = new Scene();
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly thresh: ShaderMaterial;
  private readonly blur: ShaderMaterial;
  private readonly comp: ShaderMaterial;
  private readonly size = new Vector2();
  /** 0..1: boost grade (saturation up, deeper vignette), eased by the caller */
  boost = 0;
  enabled = true;

  /** the target the scene itself is drawn into (the shell's grid compile builds the programs for it) */
  get sceneTarget(): WebGLRenderTarget {
    return this.main;
  }

  constructor(private readonly renderer: WebGLRenderer) {
    const opts = { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, type: HalfFloatType };
    this.main = new WebGLRenderTarget(4, 4, { minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, samples: 4, type: HalfFloatType });
    this.half = new WebGLRenderTarget(2, 2, opts);
    this.quarter = new WebGLRenderTarget(1, 1, opts);
    const texel = () => ({ value: new Vector2(1, 1) });
    this.thresh = new ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: texel(), uThreshold: { value: 0.9 } }, vertexShader: QUAD_VS, fragmentShader: THRESH_FS, depthTest: false, depthWrite: false });
    this.blur = new ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: texel() }, vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false });
    this.comp = new ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.85 }, uSat: { value: 1.05 }, uVig: { value: 0.12 } },
      vertexShader: QUAD_VS,
      fragmentShader: COMP_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.thresh);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  private resize(): void {
    this.renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (this.main.width === w && this.main.height === h) return;
    this.main.setSize(w, h);
    this.half.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.quarter.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }

  private pass(mat: ShaderMaterial, src: Texture, target: WebGLRenderTarget | null, draw: (s: Scene, c: Camera) => void): void {
    this.quad.material = mat;
    if (mat.uniforms.tSrc) mat.uniforms.tSrc.value = src;
    const img = src.image as { width?: number; height?: number } | undefined;
    if (mat.uniforms.uTexel) (mat.uniforms.uTexel.value as Vector2).set(1 / Math.max(1, img?.width ?? 1), 1 / Math.max(1, img?.height ?? 1));
    this.renderer.setRenderTarget(target);
    draw(this.scene, this.cam);
  }

  /** Render `scene` through the post chain. `draw` is the renderer's own render (unwrapped). */
  render(scene: Scene, camera: Camera, draw: (s: Scene, c: Camera) => void): void {
    const r = this.renderer;
    this.resize();
    const info = r.info;
    info.reset();
    info.autoReset = false;
    try {
      r.setRenderTarget(this.main);
      draw(scene, camera);
      this.pass(this.thresh, this.main.texture, this.half, draw);
      this.pass(this.blur, this.half.texture, this.quarter, draw);
      const u = this.comp.uniforms;
      u.tScene.value = this.main.texture;
      u.tBloom.value = this.quarter.texture;
      u.uSat.value = 1.05 + 0.25 * this.boost;
      u.uVig.value = 0.1 + 0.25 * this.boost;
      u.uBloom.value = 0.65 + 0.35 * this.boost;
      this.quad.material = this.comp;
      r.setRenderTarget(null);
      draw(this.scene, this.cam);
    } finally {
      info.autoReset = true;
      r.setRenderTarget(null);
    }
  }

  dispose(): void {
    this.main.dispose();
    this.half.dispose();
    this.quarter.dispose();
    this.thresh.dispose();
    this.blur.dispose();
    this.comp.dispose();
    this.quad.geometry.dispose();
  }
}
