/**
 * Speed lines (GDD 11): radial streaks over the screen. Alpha = clamp((v − 0.6·vmax) / (0.4·vmax)), jumping to 0.9 at
 * boost in the theme's accent colour. A quad parented to the camera, drawn last without depth.
 */
import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial, type PerspectiveCamera } from 'three';

export class SpeedLines {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private alpha = 0;

  constructor(camera: PerspectiveCamera, accent: number) {
    this.mat = new ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 }, uColor: { value: new Color(accent) }, uAspect: { value: 0.5 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; uniform float uTime; uniform vec3 uColor; uniform float uAspect; varying vec2 vUv;
        float h(float n){ return fract(sin(n * 91.345) * 47453.5453); }
        void main(){
          vec2 p = (vUv - 0.5) * vec2(1.0, 1.0);
          float r = length(p);
          float a = atan(p.y, p.x);
          float seg = floor((a + 3.14159) / 6.28318 * 90.0);
          float rnd = h(seg);
          float lane = step(0.55, rnd);
          float run = fract(r * 1.6 - uTime * (1.4 + rnd * 1.8) + rnd * 7.0);
          float streak = smoothstep(0.0, 0.15, run) * smoothstep(0.55, 0.2, run);
          float edge = smoothstep(0.18, 0.5, r);
          float alpha = lane * streak * edge * uAlpha;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.6), alpha * 0.55);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(new PlaneGeometry(3, 3), this.mat);
    this.mesh.position.set(0, 0, -0.6);
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
  }

  update(dt: number, speed: number, top: number, boosting: boolean, reducedMotion: boolean): void {
    const base = Math.max(0, Math.min(1, (speed - 0.6 * top) / (0.4 * top))) * 0.45;
    const target = reducedMotion ? 0 : boosting ? 0.9 : base;
    this.alpha += (target - this.alpha) * Math.min(1, dt * 8);
    this.mat.uniforms.uAlpha.value = this.alpha;
    this.mat.uniforms.uTime.value += dt;
    this.mesh.visible = this.alpha > 0.01;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
