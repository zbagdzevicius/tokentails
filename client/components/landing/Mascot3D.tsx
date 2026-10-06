import { cdnFile } from "@/constants/utils";
import { useEffect, useRef, useState } from "react";

/**
 * The 3D Token Tails mascot ("…and one more cat on the team"). Browser only: import it with
 * next/dynamic and ssr: false. three.js and the GLB (tail/mascot-animated.glb, ~600 KB) load only
 * when the stage comes near the viewport. It waves once on first view, then idles with an
 * occasional tail wag or look around; hover or tap makes it hop. Reduced motion shows a still pose.
 * Renders nothing if WebGL or the model is unavailable.
 */
export const MASCOT_GLB = "tail/mascot-animated.glb";

type Clip = "Idle" | "Wave" | "TailWag" | "Hop" | "Walk" | "LookAround";

export function Mascot3D({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const hopRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    // Needs the observers (absent in old browsers and jsdom): stay an empty, inert box then.
    if (!host || typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      if (disposed) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      // Warm key from the gold glow behind it, cool fill from the night sky.
      scene.add(new THREE.HemisphereLight(0xfff4dc, 0x3b2350, 1.7));
      const key = new THREE.DirectionalLight(0xffe2a8, 2.2);
      key.position.set(1.2, 2.5, 2.2);
      const rim = new THREE.DirectionalLight(0xb48cff, 1.4);
      rim.position.set(-2, 1.5, -1.5);
      scene.add(key, rim);
      // Soft contact shadow (a radial gradient disc, cheaper than a shadow map).
      const shadowTex = (() => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const g = c.getContext("2d")!;
        const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
        grd.addColorStop(0, "rgba(0,0,0,0.45)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
      })();
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.75),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.002;
      scene.add(shadow);

      const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
      camera.position.set(0.35, 0.62, 2.55);
      camera.lookAt(0, 0.5, 0);

      const resize = () => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);

      let gltf: Awaited<ReturnType<InstanceType<typeof GLTFLoader>["loadAsync"]>>;
      try {
        gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(cdnFile(MASCOT_GLB));
      } catch {
        ro.disconnect();
        renderer.dispose();
        renderer.domElement.remove();
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed) {
        ro.disconnect();
        renderer.dispose();
        return;
      }
      const model = gltf.scene;
      model.rotation.y = -0.18; // a slight three-quarter turn towards the CTA
      model.traverse((o) => {
        const m = o as { isMesh?: boolean; frustumCulled?: boolean };
        if (m.isMesh) m.frustumCulled = false;
      });
      scene.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const actions = new Map<string, InstanceType<typeof THREE.AnimationAction>>();
      for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      let current: InstanceType<typeof THREE.AnimationAction> | null = null;
      const play = (name: Clip, once = false) => {
        const next = actions.get(name);
        if (!next) return;
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = once;
        next.enabled = true;
        next.setEffectiveWeight(1);
        next.play();
        if (current && current !== next) current.crossFadeTo(next, 0.35, false);
        current = next;
      };
      mixer.addEventListener("finished", () => play("Idle"));

      let visible = false;
      let waved = false;
      let fidget: ReturnType<typeof setInterval> | null = null;
      hopRef.current = () => {
        if (!reduced && current?.getClip().name !== "Hop") play("Hop", true);
      };

      if (reduced) {
        play("Idle");
        mixer.update(0);
      } else {
        play("Idle");
        fidget = setInterval(() => {
          if (!visible || current?.getClip().name !== "Idle") return;
          play(Math.random() < 0.6 ? "TailWag" : "LookAround", true);
        }, 7000);
      }

      const io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          if (visible && !waved && !reduced) {
            waved = true;
            play("Wave", true);
          }
        },
        { threshold: 0.35 },
      );
      io.observe(host);

      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1);
        if (!visible && waved) return; // skip work off-screen
        if (!reduced) mixer.update(dt);
        renderer.render(scene, camera);
      });

      cleanup = () => {
        renderer.setAnimationLoop(null);
        if (fidget) clearInterval(fidget);
        io.disconnect();
        ro.disconnect();
        mixer.stopAllAction();
        scene.traverse((o) => {
          const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void; map?: { dispose(): void } } };
          m.geometry?.dispose();
          m.material?.map?.dispose();
          m.material?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
        hopRef.current = null;
      };
    };

    // Load only when the stage gets close to the viewport.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        near.disconnect();
        start().catch(() => !disposed && setFailed(true));
      },
      { rootMargin: "400px 0px" },
    );
    near.observe(host);

    return () => {
      disposed = true;
      near.disconnect();
      cleanup?.();
    };
  }, []);

  if (failed) return null;
  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="The Token Tails mascot, a white cat, waving hello"
      data-testid="mascot-3d"
      onPointerEnter={() => hopRef.current?.()}
      onClick={() => hopRef.current?.()}
      className={`cursor-pointer select-none ${className}`}
    />
  );
}

export default Mascot3D;
