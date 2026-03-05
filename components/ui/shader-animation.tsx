"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function ShaderAnimation() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    camera: THREE.Camera;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    uniforms: any;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Vertex shader
    const vertexShader = `
      void main() {
        gl_Position = vec4( position, 1.0 );
      }
    `;

    // Fragment shader
    const fragmentShader = `
      #define TAU 6.28318530718

      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      mat2 rot(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float sdSegment(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      float pawSdf(vec2 p) {
        float pad = length((p - vec2(0.0, -0.08)) * vec2(1.0, 1.2)) - 0.19;
        float t1 = length(p - vec2(-0.18, 0.14)) - 0.085;
        float t2 = length(p - vec2(-0.06, 0.23)) - 0.075;
        float t3 = length(p - vec2(0.06, 0.23)) - 0.075;
        float t4 = length(p - vec2(0.18, 0.14)) - 0.085;
        float toes = min(min(t1, t2), min(t3, t4));
        return min(pad, toes);
      }

      float pawLayer(vec2 uv, float scale, float speed, float seed) {
        vec2 p = uv * scale;
        p.y += time * speed;
        vec2 id = floor(p);
        vec2 gv = fract(p) - 0.5;

        float n = hash21(id + seed);
        float angle = n * TAU + 0.35 * sin(time * 0.25 + n * 10.0);
        float size = mix(0.9, 1.25, hash21(id + seed + 4.1));

        gv = rot(angle) * (gv * size);
        float d = pawSdf(gv * 1.7);

        float fill = smoothstep(0.05, -0.02, d);
        float rim = smoothstep(0.09, 0.0, abs(d) - 0.012);

        return fill * (0.55 + 0.45 * n) + rim * 0.65;
      }

      float catAccent(vec2 uv) {
        vec2 p = uv;
        p *= vec2(1.0, 1.12);
        p += vec2(0.0, 0.02);

        float eyeL = smoothstep(0.022, 0.0, length(p - vec2(-0.12, 0.02)) - 0.01);
        float eyeR = smoothstep(0.022, 0.0, length(p - vec2(0.12, 0.02)) - 0.01);
        float nose = smoothstep(0.03, 0.0, max(abs(p.x) * 1.2 + p.y + 0.055, -p.y - 0.095));

        float whiskerA = smoothstep(0.01, 0.0, sdSegment(p, vec2(-0.04, -0.015), vec2(-0.32, 0.06)));
        float whiskerB = smoothstep(0.01, 0.0, sdSegment(p, vec2(-0.04, -0.03), vec2(-0.34, -0.01)));
        float whiskerC = smoothstep(0.01, 0.0, sdSegment(p, vec2(0.04, -0.015), vec2(0.32, 0.06)));
        float whiskerD = smoothstep(0.01, 0.0, sdSegment(p, vec2(0.04, -0.03), vec2(0.34, -0.01)));

        float pulse = 0.75 + 0.25 * sin(time * 0.8);
        return (eyeL + eyeR + nose * 0.9 + whiskerA + whiskerB + whiskerC + whiskerD) * pulse;
      }

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float t = time * 0.2;

        vec3 bgA = vec3(0.03, 0.02, 0.04);
        vec3 bgB = vec3(0.12, 0.06, 0.03);
        float wave = 0.5 + 0.5 * sin(uv.x * 2.2 + uv.y * 2.8 - t);
        vec3 color = mix(bgA, bgB, wave * 0.35);

        float pawFar = pawLayer(uv + vec2(0.0, 0.08 * sin(t * 0.7)), 3.6, 0.18, 1.3);
        float pawMid = pawLayer(uv + vec2(0.18 * sin(t * 0.4), 0.0), 5.3, 0.27, 9.7);
        float pawNear = pawLayer(uv + vec2(-0.15 * cos(t * 0.35), 0.0), 7.4, 0.38, 17.1);

        vec3 pawColor1 = vec3(1.0, 0.55, 0.25);
        vec3 pawColor2 = vec3(1.0, 0.72, 0.42);
        vec3 pawColor3 = vec3(0.94, 0.36, 0.42);

        color += pawFar * pawColor1 * 0.45;
        color += pawMid * mix(pawColor1, pawColor2, 0.5 + 0.5 * sin(t + uv.x)) * 0.55;
        color += pawNear * mix(pawColor2, pawColor3, 0.5 + 0.5 * sin(t * 1.3 - uv.y)) * 0.65;

        float cat = catAccent(uv * 1.05);
        color += cat * vec3(1.0, 0.84, 0.52) * 0.26;

        float glare = pow(max(0.0, 1.0 - length(uv - vec2(0.0, 0.05))), 2.5);
        color += glare * vec3(1.0, 0.62, 0.35) * 0.18;

        float vignette = smoothstep(1.45, 0.25, length(uv));
        color *= vignette;
        color = pow(color, vec3(0.95));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Initialize Three.js scene
    const camera = new THREE.Camera();
    camera.position.z = 1;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);

    const uniforms = {
      time: { type: "f", value: 1.0 },
      resolution: { type: "v2", value: new THREE.Vector2() },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    container.appendChild(renderer.domElement);

    // Handle window resize
    const onWindowResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      uniforms.resolution.value.x = renderer.domElement.width;
      uniforms.resolution.value.y = renderer.domElement.height;
    };

    // Initial resize
    onWindowResize();
    window.addEventListener("resize", onWindowResize, false);

    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;
      renderer.render(scene, camera);

      if (sceneRef.current) {
        sceneRef.current.animationId = animationId;
      }
    };

    // Store scene references for cleanup
    sceneRef.current = {
      camera,
      scene,
      renderer,
      uniforms,
      animationId: 0,
    };

    // Start animation
    animate();

    // Cleanup function
    return () => {
      window.removeEventListener("resize", onWindowResize);

      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);

        if (container && sceneRef.current.renderer.domElement) {
          container.removeChild(sceneRef.current.renderer.domElement);
        }

        sceneRef.current.renderer.dispose();
        geometry.dispose();
        material.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-screen"
      style={{
        background: "#000",
        overflow: "hidden",
      }}
    />
  );
}
