/**
 * Screen pass (GDD 11 post-FX: "one combined pass for speed lines, vignette, flash and catnip tint"): one quad
 * parented to the camera, drawn last without depth, so the whole post stack is a single draw call and also shows up
 * in recorded clips.
 *  - speed lines: alpha = clamp((v − 0.6·vmax) / (0.4·vmax)), jumping to 0.9 at boost in the boost colour
 *  - vignette: deepens with speed, tinted by the boost colour while boosting, red pulse on the final lap closing
 *  - flash: hit (white-red), mini-turbo (tier colour), finish (gold)
 *  - catnip tint: a rainbow wash for 0.6 s
 * Keeps the core's constructor / update / dispose API; `SpeedLines.current` lets the juice lane reach the live pass.
 */
import { Color, Mesh, PlaneGeometry, ShaderMaterial, type PerspectiveCamera } from 'three';

const PULSE = new Color(0xc0103a);

export class SpeedLines {
  /** the pass of the current race (set on construct, cleared on dispose) */
  static current: SpeedLines | null = null;

  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private alpha = 0;
  private flashA = 0;
  private flashDecay = 4;
  private tintT = 0;
  private vig = 0;
  private boostColor = new Color();
  private pulse = 0;
  /** 0..1 from the quality tier (low = no speed streak texture work) */
  detail = 1;
  /** iteration 3 (set pieces, set by the juice install each frame): streak strength × `gain` (tunnels: 1.3), and at
   *  least `floor` (a loop's rail keeps the speed lines on) */
  gain = 1;
  floor = 0;
  /** 0..1: a tunnel closes the vignette in a little (the walls are near) */
  dark = 0;

  constructor(camera: PerspectiveCamera, accent: number) {
    this.boostColor.setHex(accent);
    this.mat = new ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uColor: { value: new Color(accent) },
        uFlash: { value: 0 },
        uFlashColor: { value: new Color(0xffffff) },
        uVig: { value: 0.25 },
        uVigColor: { value: new Color(0x1a1238) },
        uTint: { value: 0 },
        uDetail: { value: 1 },
      },
      vertexShader: /* glsl */ `varying vec2 vS; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); vS = gl_Position.xy / gl_Position.w; }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform float uTime; uniform vec3 uColor; uniform float uFlash; uniform vec3 uFlashColor;
        uniform float uVig; uniform vec3 uVigColor; uniform float uTint; uniform float uDetail; varying vec2 vS;
        float h(float n){ return fract(sin(n * 91.345) * 47453.5453); }
        vec3 hue(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void over(inout vec4 dst, vec3 c, float a){ dst.rgb = mix(dst.rgb, c, a); dst.a = dst.a + a * (1.0 - dst.a); }
        void main(){
          vec2 p = vS * 0.5;
          float r = length(p);
          vec4 o = vec4(0.0);
          // vignette
          float v = smoothstep(0.32, 0.85, r) * uVig;
          over(o, uVigColor, v);
          // speed streaks
          if (uAlpha > 0.01 && uDetail > 0.0) {
            float a = atan(p.y, p.x);
            float seg = floor((a + 3.14159) / 6.28318 * 90.0);
            float rnd = h(seg);
            float lane = step(0.55, rnd);
            float run = fract(r * 1.6 - uTime * (1.4 + rnd * 1.8) + rnd * 7.0);
            float streak = smoothstep(0.0, 0.15, run) * smoothstep(0.55, 0.2, run);
            float edge = smoothstep(0.18, 0.5, r);
            over(o, mix(vec3(1.0), uColor, 0.6), lane * streak * edge * uAlpha * 0.5);
          }
          // catnip: a rainbow wash, strongest at the edges
          if (uTint > 0.0) over(o, hue(r * 1.5 - uTime * 0.8 + p.x), uTint * (0.03 + 0.24 * smoothstep(0.35, 0.85, r))); // playtest round 2: edges only, the track stays readable
          // flash
          if (uFlash > 0.0) over(o, uFlashColor, uFlash * (0.55 + 0.45 * smoothstep(0.1, 0.7, r)));
          if (o.a < 0.004) discard;
          gl_FragColor = vec4(o.rgb, o.a);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(4, 4), this.mat);
    this.mesh.position.set(0, 0, -0.6);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
    SpeedLines.current = this;
  }

  /** A full-screen flash that decays over `seconds`. */
  flash(color: number, strength: number, seconds = 0.25): void {
    if (strength < this.flashA) return;
    this.flashA = Math.min(0.9, strength);
    this.flashDecay = this.flashA / Math.max(0.05, seconds);
    (this.mat.uniforms.uFlashColor.value as Color).setHex(color);
  }

  /** The catnip rainbow wash for `seconds`. */
  tint(seconds: number): void {
    this.tintT = Math.max(this.tintT, seconds);
  }

  /** The current boost colour (speed streaks and the vignette edge take it while boosting). */
  setBoostColor(c: number): void {
    this.boostColor.setHex(c);
  }

  /** Red heartbeat pulse in the vignette (final-lap closing stretch while not leading). */
  setPulse(on: boolean): void {
    this.pulse = on ? 1 : 0;
  }

  update(dt: number, speed: number, top: number, boosting: boolean, reducedMotion: boolean): void {
    const u = this.mat.uniforms;
    const frac = Math.max(0, Math.min(1, (speed - 0.6 * top) / (0.4 * top)));
    const target = reducedMotion ? 0 : Math.min(1, Math.max(this.floor, boosting ? 0.9 : frac * 0.45) * this.gain);
    this.alpha += (target - this.alpha) * Math.min(1, dt * 8);
    u.uAlpha.value = this.alpha;
    u.uTime.value += dt;
    u.uDetail.value = this.detail;
    (u.uColor.value as Color).copy(this.boostColor);
    // vignette: 0.22 at rest → 0.45 at top speed → 0.6 boosting
    const vt = 0.22 + 0.23 * Math.min(1, speed / top) + (boosting ? 0.15 : 0) + this.pulse * (0.12 + 0.12 * Math.sin(u.uTime.value * 9)) + this.dark * 0.14;
    this.vig += (vt - this.vig) * Math.min(1, dt * 5);
    u.uVig.value = this.vig;
    const vc = u.uVigColor.value as Color;
    vc.setHex(0x1a1238);
    if (boosting) vc.lerp(this.boostColor, 0.35);
    if (this.pulse) vc.lerp(PULSE, 0.5);
    this.flashA = Math.max(0, this.flashA - this.flashDecay * dt);
    u.uFlash.value = reducedMotion ? this.flashA * 0.4 : this.flashA;
    this.tintT = Math.max(0, this.tintT - dt);
    u.uTint.value = Math.min(1, this.tintT / 0.2) * (reducedMotion ? 0.4 : 1);
    this.mesh.visible = true;
  }

  /** Stop drawing now (a torn-down race: its overlay must not stay frozen over the next grid); `dispose` frees it later. */
  detach(): void {
    if (SpeedLines.current === this) SpeedLines.current = null;
    this.mesh.removeFromParent();
  }

  dispose(): void {
    this.detach();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
