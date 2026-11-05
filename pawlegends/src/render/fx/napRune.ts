/**
 * LoL pass (lane C): the Nap (recall) ground rune, in the style of a LoL recall: a blue-gold rune circle under the
 * napping hero that fills clockwise with the channel progress (the HUD's nap bar reads the same `napChannel`). One small
 * pool of ring meshes (one per hero slot) that lives in the scene for the whole match and is only shown or hidden, so a
 * cancelled nap leaves nothing behind. Render only.
 */
import * as THREE from 'three';

/** The rune's radii (m), before the hero's body scale. */
export const RUNE = Object.freeze({ inner: 1.3, outer: 1.75 });

const VERT = 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// clockwise from 12 o'clock seen from above: the filled arc in gold, the rest a faint blue track with rune notches
const FRAG = `uniform float uProg, uOp, uTime, uIn, uOut; uniform vec3 uA, uB; varying vec2 vP;
void main(){
  float r = length(vP);
  float band = clamp((r - uIn) / (uOut - uIn), 0.0, 1.0);
  float f = fract(atan(vP.x, vP.y) / 6.2831853 + 1.0);
  float filled = step(f, uProg);
  float rune = step(0.45, fract(f * 24.0 + uTime * 0.25));
  float edge = smoothstep(0.0, 0.18, band) * smoothstep(1.0, 0.82, band);
  float rim = smoothstep(0.08, 0.0, abs(band - 0.5) - 0.38);
  vec3 col = mix(uA, uB, filled);
  float lead = filled * smoothstep(0.035, 0.0, uProg - f) ;
  float a = edge * (0.35 + 0.6 * filled) * (0.7 + 0.3 * rune) + rim * 0.3 + lead * 0.5;
  gl_FragColor = vec4(col + lead * 0.5, a * uOp);
}`;

interface Rune {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  used: boolean;
}

export class NapRunes {
  readonly group = new THREE.Group();
  private readonly geo = new THREE.RingGeometry(RUNE.inner, RUNE.outer, 72, 1);
  private readonly runes: Rune[] = [];
  /** Fill per hero id this frame (e2e telemetry), -1 = no rune. */
  readonly fill: number[];

  constructor(slots = 6) {
    this.group.name = 'nap-runes';
    this.fill = new Array(slots).fill(-1);
    for (let i = 0; i < slots; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uProg: { value: 0 },
          uOp: { value: 1 },
          uTime: { value: 0 },
          uIn: { value: RUNE.inner },
          uOut: { value: RUNE.outer },
          uA: { value: new THREE.Color(0x3d6dff) },
          uB: { value: new THREE.Color(0xffc23a) },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.name = 'nap-rune';
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.runes.push({ mesh, mat, used: false });
    }
  }

  begin(): void {
    for (const r of this.runes) r.used = false;
  }

  /** Hero `id` naps at (x, z) m with `prog` 0..1 of the channel; `scale` its body scale. */
  put(id: number, x: number, z: number, prog: number, scale: number, time: number): void {
    const r = this.runes[id];
    if (!r) return;
    r.used = true;
    r.mesh.visible = true;
    r.mesh.position.set(x, 0.085, z);
    r.mesh.scale.setScalar(Math.max(0.6, scale));
    r.mat.uniforms.uProg.value = Math.max(0, Math.min(1, prog));
    r.mat.uniforms.uTime.value = time;
    this.fill[id] = r.mat.uniforms.uProg.value;
  }

  /** Hide every rune not put this frame (the nap ended or was cancelled). */
  end(): void {
    for (let i = 0; i < this.runes.length; i++) {
      const r = this.runes[i];
      if (r.used) continue;
      r.mesh.visible = false;
      this.fill[i] = -1;
    }
  }

  /** Visible runes now. */
  get live(): number {
    let k = 0;
    for (const r of this.runes) if (r.mesh.visible) k++;
    return k;
  }

  dispose(): void {
    this.geo.dispose();
    for (const r of this.runes) r.mat.dispose();
  }
}
