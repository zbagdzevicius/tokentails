/**
 * Home layer L2 (docs/plans/moba/HOME-MODES.md §4): warm motes on a 2D canvas over the key art. Cat side (left) pink
 * and violet sparkles, dog side (right) amber embers, drifting upward. 24 on Med, 48 on High, none on Low or with
 * reduced motion (the caller does not start it). Drawn at most 30 times a second (the menu pacer), paused while the
 * tab is hidden, and the pointer parallax (±18 px) is applied by the caller through a CSS transform on the canvas.
 *
 * Cosmetic only. Pure apart from the canvas it draws on.
 */
export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  hue: number;
  tw: number;
}

const CAT_HUES = [328, 300, 276] as const;
const DOG_HUES = [36, 28, 44] as const;

/** A new mote somewhere along the bottom half (x, y in 0..1 of the canvas). `rnd` returns 0..1. Pure. */
export function spawnMote(rnd: () => number, fresh = false): Mote {
  const x = rnd();
  const cat = x < 0.5;
  const hues = cat ? CAT_HUES : DOG_HUES;
  const max = 5 + rnd() * 6;
  return {
    x,
    y: fresh ? 0.35 + rnd() * 0.7 : 1.02 + rnd() * 0.05,
    vx: (rnd() - 0.5) * 0.012,
    vy: -(0.035 + rnd() * 0.05),
    r: 0.8 + rnd() * 2.2,
    life: fresh ? rnd() * max : 0,
    max,
    hue: hues[Math.floor(rnd() * hues.length)] ?? hues[0],
    tw: rnd() * Math.PI * 2,
  };
}

/** Advance one mote by `dt` seconds; false when it is spent. Pure (mutates the mote). */
export function stepMote(m: Mote, dt: number): boolean {
  m.life += dt;
  m.x += m.vx * dt + Math.sin(m.life * 1.3 + m.tw) * 0.0009;
  m.y += m.vy * dt;
  return m.life < m.max && m.y > -0.05;
}

/** Alpha over a mote's life: fades in, holds, fades out, with a twinkle. Pure. */
export function moteAlpha(m: Mote): number {
  const k = m.life / m.max;
  const env = Math.min(1, k * 5) * Math.min(1, (1 - k) * 3);
  return Math.max(0, env * (0.55 + 0.45 * Math.sin(m.life * 4 + m.tw)));
}

export function startMotes(canvas: HTMLCanvasElement, count: number, rnd: () => number = Math.random): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx || count <= 0) return () => undefined;
  const motes: Mote[] = Array.from({ length: count }, () => spawnMote(rnd, true));
  let raf = 0;
  let last = 0;
  let w = 0;
  let h = 0;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const size = (): void => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width * dpr));
    h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  size();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  ro?.observe(canvas);
  const frame = (t: number): void => {
    raf = requestAnimationFrame(frame);
    if (!canvas.isConnected) {
      stop();
      return;
    }
    if (document.hidden || t - last < 33) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 30;
    last = t;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      if (!stepMote(m, dt)) motes[i] = spawnMote(rnd);
      const a = moteAlpha(m);
      if (a <= 0.01) continue;
      const x = m.x * w;
      const y = m.y * h;
      const r = m.r * dpr;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `hsla(${m.hue}, 100%, 85%, ${a})`);
      g.addColorStop(0.35, `hsla(${m.hue}, 95%, 65%, ${a * 0.5})`);
      g.addColorStop(1, `hsla(${m.hue}, 90%, 55%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    }
  };
  raf = requestAnimationFrame(frame);
  let stopped = false;
  function stop(): void {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
  }
  return stop;
}
