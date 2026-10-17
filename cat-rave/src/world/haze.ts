/**
 * L-WORLD: haze. Camera-facing sheets at fixed view depths (drawn in clip space, depth-tested so
 * nearer cats stay crisp) with world-anchored drifting noise: ground mist that is thicker near the
 * floor and lit green towards the moon and the booth. Plus the full-screen flash quad.
 */
import { AdditiveBlending, Matrix4, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Camera } from 'three';
import { NOISE, OUTPUT, SHARED_DECL, type SharedUniforms } from './glsl';
import { LASER_RIGS } from './show';

/** View depths of the sheets per layer count. */
export function hazeDepths(layers: number): number[] {
  if (layers <= 1) return [12];
  if (layers === 2) return [8, 26];
  return [6, 15, 38];
}

export function createHaze(shared: SharedUniforms, layers: number) {
  const meshes: Mesh[] = [];
  const geometry = new PlaneGeometry(2, 2);
  const invProj = new Matrix4();
  const camWorld = new Matrix4();
  const camPos = new Vector3();
  const depths = hazeDepths(layers);
  depths.forEach((depth, i) => {
    const material = new ShaderMaterial({
      name: `rave-haze-${i}`,
      uniforms: {
        ...shared,
        uDepth: { value: depth },
        uLayer: { value: i },
        uAmount: { value: 0.45 / Math.sqrt(depths.length) },
        uInvProj: { value: invProj },
        uCamWorld: { value: camWorld },
        uCamPos: { value: camPos },
      },
      vertexShader: /* glsl */ `
        uniform float uDepth;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        varying vec3 vWorld;
        void main() {
          vec4 c = projectionMatrix * vec4(0.0, 0.0, -uDepth, 1.0);
          float z = c.z / c.w;
          gl_Position = vec4(position.xy, z, 1.0);
          vec4 v = uInvProj * vec4(position.xy, z, 1.0);
          v /= v.w;
          vWorld = (uCamWorld * v).xyz;
        }
      `,
      fragmentShader: /* glsl */ `
        ${SHARED_DECL}
        uniform float uDepth;
        uniform float uLayer;
        uniform float uAmount;
        uniform vec3 uCamPos;
        varying vec3 vWorld;
        ${NOISE}
        void main() {
          vec3 rd = normalize(vWorld - uCamPos);
          float t = uTime * (0.25 + 0.75 * uMotion);
          vec2 p = vWorld.xz * 0.07 + vec2(t * 0.05, -t * 0.03) + uLayer * 3.7;
          float n = fbm2(p + fbm2(p * 1.7 + t * 0.04) * 0.8);
          float wisps = smoothstep(0.32, 0.85, n);
          float ground = exp(-max(vWorld.y, 0.0) / 3.0);
          float below = step(0.0, vWorld.y); // nothing under the floor
          vec3 md = normalize(uMoonCenter - uCamPos);
          float scatter = pow(max(dot(rd, md), 0.0), 6.0);
          float booth = exp(-length(vWorld.xz) / 9.0);
          // Laser emitters on the horizon: the haze thickens and glows round them.
          float emit = pow(max(dot(rd, normalize(vec3(${LASER_RIGS.left.join(', ')}) - uCamPos)), 0.0), 40.0)
            + pow(max(dot(rd, normalize(vec3(${LASER_RIGS.right.join(', ')}) - uCamPos)), 0.0), 40.0);
          vec3 lit = uFogColor * 1.2 + uMoonGlow * (0.06 + scatter * 0.32 + booth * 0.14 + emit * 0.35);
          float density = (0.15 + 0.85 * wisps) * (0.05 + 0.95 * ground) * below * 0.35 * (1.0 + 0.6 * emit);
          // Little haze above the horizon: the sky stays near-black and the moon keeps its disc and
          // maria (the green glow belongs to the moon's halo and the beams). The emitters keep theirs.
          density *= 1.0 - 0.85 * smoothstep(0.0, 0.1, rd.y) * (1.0 - min(1.0, emit));
          vec3 col = lit * density * uAmount * (0.55 + 0.25 * uEnergy + 0.25 * uKick * uDrop);
          col += uFlash * density * 0.25;
          gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
          ${OUTPUT}
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      fog: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `haze-${i}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 30 + i;
    meshes.push(mesh);
  });

  // Full-screen flash: additive colour at the near plane, only drawn while flashing.
  const flashMat = new ShaderMaterial({
    name: 'rave-flash',
    uniforms: { ...shared },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, -1.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SHARED_DECL}
      varying vec2 vUv;
      void main() {
        float v = 1.0 - 0.45 * length(vUv - 0.5);
        gl_FragColor = vec4(max(uFlash * 0.22 * v, vec3(0.0)), 1.0);
        ${OUTPUT}
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
    fog: false,
  });
  const flash = new Mesh(geometry, flashMat);
  flash.name = 'flash';
  flash.frustumCulled = false;
  flash.renderOrder = 1000;
  flash.visible = false;

  return {
    meshes,
    flash,
    /** Per frame, before render: camera matrices for world reconstruction. */
    sync(camera: Camera) {
      invProj.copy(camera.projectionMatrixInverse);
      camWorld.copy(camera.matrixWorld);
      camPos.setFromMatrixPosition(camera.matrixWorld);
    },
    dispose() {
      geometry.dispose();
      meshes.forEach((m) => (m.material as ShaderMaterial).dispose());
      flashMat.dispose();
    },
  };
}
