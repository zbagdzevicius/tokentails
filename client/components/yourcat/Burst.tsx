/**
 * A one-shot burst of gold pixels (docs/plans/yourcat-polish.md §4.2, §11): a short-lived 2D canvas
 * 1.4x the size of its parent, centred on it. 3–6 px squares in gold, cream and lilac leave the
 * centre at 220–420 px/s, fall with gravity 900 px/s², slow with drag .92 (per 60 Hz frame) and fade
 * over 700–1,000 ms. One rAF loop; the canvas is removed when the last particle dies (≤ 1.2 s).
 * Reduced motion: nothing (null), and `onDone` still fires.
 */
import { GOLD, INK } from "@/design/tokens";
import { useEffect, useRef, useState } from "react";

export const BURST_COLOURS = [GOLD[400], INK.cream, INK.lilac] as const;
export const BURST_GRAVITY = 900;
export const BURST_DRAG = 0.92;
export const BURST_SPEED = [220, 420] as const;
export const BURST_LIFE_MS = [700, 1000] as const;
export const BURST_SIZE_PX = [3, 6] as const;
/** The canvas is 1.4x its parent. */
export const BURST_SPREAD = 1.4;

export interface BurstProps {
  count: number;
  reducedMotion: boolean;
  onDone?(): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  colour: string;
  life: number;
}

const between = (range: readonly [number, number]) => range[0] + Math.random() * (range[1] - range[0]);

/** The particles, all starting at (cx, cy); speeds in px/s. */
export function makeParticles(count: number, cx: number, cy: number, dpr = 1): Particle[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = between(BURST_SPEED) * dpr;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      // A slight upward bias, so the burst reads as "out of the frame", not "down the drain".
      vy: Math.sin(angle) * speed - 80 * dpr,
      size: Math.round(between(BURST_SIZE_PX)) * dpr,
      colour: BURST_COLOURS[i % BURST_COLOURS.length],
      life: between(BURST_LIFE_MS),
    };
  });
}

/** Advances every particle by `dt` ms. */
export function stepParticles(particles: Particle[], dt: number, dpr = 1): void {
  const s = dt / 1000;
  const drag = Math.pow(BURST_DRAG, dt / (1000 / 60));
  for (const p of particles) {
    p.vx *= drag;
    p.vy = p.vy * drag + BURST_GRAVITY * dpr * s;
    p.x += p.vx * s;
    p.y += p.vy * s;
  }
}

export function Burst({ count, reducedMotion, onDone }: BurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [alive, setAlive] = useState(true);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (reducedMotion) {
      doneRef.current?.();
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || typeof requestAnimationFrame === "undefined") {
      setAlive(false);
      doneRef.current?.();
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const particles = makeParticles(count, canvas.width / 2, canvas.height / 2, dpr);
    const started = performance.now();
    let last = started;
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(48, Math.max(0, now - last));
      last = now;
      const age = now - started;
      stepParticles(particles, dt, dpr);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let living = 0;
      for (const p of particles) {
        if (age >= p.life) continue;
        living++;
        ctx.globalAlpha = Math.max(0, 1 - age / p.life);
        ctx.fillStyle = p.colour;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
      if (living > 0 && age < 1200) {
        raf = requestAnimationFrame(frame);
      } else {
        setAlive(false);
        doneRef.current?.();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // One shot per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion || !alive) return null;
  const inset = `${((1 - BURST_SPREAD) / 2) * 100}%`;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="yourcat-burst"
      className="pointer-events-none absolute"
      style={{ left: inset, top: inset, width: `${BURST_SPREAD * 100}%`, height: `${BURST_SPREAD * 100}%` }}
    />
  );
}

export default Burst;
