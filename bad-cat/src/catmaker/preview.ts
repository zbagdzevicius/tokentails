/**
 * Live preview on the confirm screen. Uses L3's `createCatPreview` (three.js turntable on a plinth); if that
 * throws (no WebGL, lost context, or the render lane is not in yet) it falls back to a flat 2D toon drawing so
 * the flow never breaks. A UI may also pass its own preview factory.
 */
import { createCatPreview } from '../render';
import { rgb888, EYE_COLORS, type CatSpec } from '../types';
import { hex } from './body-colour';

export interface CatPreviewHandle {
  update(spec: CatSpec, face?: HTMLCanvasElement | null): void;
  dispose(): void;
  readonly mode: '3d' | '2d';
}

export type PreviewFactory = (
  canvas: HTMLCanvasElement,
  spec: CatSpec,
) => { update(spec: CatSpec, face?: HTMLCanvasElement | ImageBitmap | null): void; dispose(): void };

export function mountPreview(
  canvas: HTMLCanvasElement,
  spec: CatSpec,
  face: HTMLCanvasElement | null,
  factory: PreviewFactory = createCatPreview,
): CatPreviewHandle {
  try {
    const p = factory(canvas, spec);
    let broken = false;
    let fallback: CatPreviewHandle | null = null;
    p.update(spec, face);
    return {
      mode: '3d',
      update(s, f) {
        if (fallback) return fallback.update(s, f);
        try {
          p.update(s, f ?? null);
        } catch {
          if (!broken) {
            broken = true;
            try {
              p.dispose();
            } catch {
              /* ignore */
            }
            fallback = mount2d(canvas, s, f ?? null);
          }
        }
      },
      dispose() {
        try {
          p.dispose();
        } catch {
          /* ignore */
        }
        fallback?.dispose();
      },
    };
  } catch {
    return mount2d(canvas, spec, face);
  }
}

/** Flat toon cat on a plinth, gently swaying (no WebGL). */
function mount2d(canvas0: HTMLCanvasElement, spec0: CatSpec, face0: HTMLCanvasElement | null): CatPreviewHandle {
  let spec = spec0;
  let face = face0;
  let raf = 0;
  let alive = true;
  let canvas = canvas0;
  let ctx = canvas.getContext('2d');
  if (!ctx && canvas.parentNode) {
    // The canvas already holds a (failed) WebGL context: swap in a fresh one.
    const fresh = document.createElement('canvas');
    fresh.className = canvas.className;
    canvas.replaceWith(fresh);
    canvas = fresh;
    ctx = canvas.getContext('2d');
  }
  const t0 = performance.now();

  const draw = (now: number): void => {
    if (!alive || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const u = Math.min(cw, ch * 0.9) / 100; // drawing unit
    const t = (now - t0) / 1000;
    ctx.translate(cw / 2, ch * 0.58);
    drawCat(ctx, u, spec, face, t);
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return {
    mode: '2d',
    update(s, f) {
      spec = s;
      face = f ?? null;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
    },
  };
}

function drawCat(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CatSpec,
  face: HTMLCanvasElement | null,
  t: number,
): void {
  const base = hex(rgb888(spec.base));
  const sec = hex(rgb888(spec.secondary));
  const eye = hex(EYE_COLORS[spec.eyes] ?? EYE_COLORS[0]);
  const bodyW = spec.body === 'chonk' ? 30 : spec.body === 'slim' ? 20 : 25;
  const sway = Math.sin(t * 1.4) * 0.06;
  const ink = '#2b1d2e';
  ctx.lineWidth = 1.6 * u;
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'round';

  // plinth
  ctx.fillStyle = '#6b4a5e';
  ellipse(ctx, 0, 30 * u, 38 * u, 8 * u);
  ctx.fill();
  ctx.fillStyle = '#8a6177';
  ellipse(ctx, 0, 27 * u, 38 * u, 8 * u);
  ctx.fill();

  ctx.save();
  ctx.rotate(sway);
  // tail
  const tailW = spec.tail === 'fluffy' ? 7 : 4;
  const point = spec.pattern === 'colorpoint' ? sec : base;
  ctx.fillStyle = point;
  ctx.beginPath();
  if (spec.tail === 'bob') {
    ellipse(ctx, bodyW * u * 0.95, 14 * u, 5 * u, 4 * u);
  } else {
    const wag = Math.sin(t * 2.2) * 4;
    ctx.moveTo(bodyW * 0.8 * u, 16 * u);
    ctx.quadraticCurveTo((bodyW + 16) * u, 10 * u, (bodyW + 10 + wag) * u, -14 * u);
    ctx.lineTo((bodyW + 10 + wag - tailW) * u, -13 * u);
    ctx.quadraticCurveTo((bodyW + 8) * u, 8 * u, bodyW * 0.6 * u, 20 * u);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // body
  ctx.fillStyle = base;
  ellipse(ctx, 0, 12 * u, bodyW * u, 15 * u);
  ctx.fill();
  ctx.stroke();
  if (spec.pattern === 'tabby') {
    ctx.save();
    ellipse(ctx, 0, 12 * u, bodyW * u, 15 * u);
    ctx.clip();
    ctx.fillStyle = sec;
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect((i * 8 - 2) * u, -4 * u, 3.5 * u, 14 * u);
    }
    ctx.restore();
  }
  const ter = hex(rgb888(spec.tertiary));
  // flat approximations of the other five coats (the 3D shader does the real thing)
  if (spec.pattern !== 'solid' && spec.pattern !== 'tabby') {
    ctx.save();
    ellipse(ctx, 0, 12 * u, bodyW * u, 15 * u);
    ctx.clip();
    if (spec.pattern === 'tuxedo' || spec.pattern === 'bicolor') {
      ctx.fillStyle = ter;
      const k = spec.pattern === 'bicolor' ? 1 : 0.75;
      ellipse(ctx, 0, 22 * u, bodyW * k * u, 12 * k * u + 4 * u);
      ctx.fill();
    } else if (spec.pattern === 'calico' || spec.pattern === 'tortie') {
      if (spec.pattern === 'calico') {
        ctx.fillStyle = ter;
        ctx.fillRect(-bodyW * u, 4 * u, bodyW * 2 * u, 30 * u);
      }
      const blobs: [number, number, number, boolean][] = [[-0.5, 2, 9, true], [0.45, 8, 8, false], [-0.1, 20, 6, false], [0.6, 22, 6, true], [-0.7, 16, 5, false]];
      for (const [bx, by, br, useBase] of blobs) {
        ctx.fillStyle = useBase ? base : sec;
        ellipse(ctx, bx * bodyW * u, by * u, br * u, br * 0.8 * u);
        ctx.fill();
      }
    } else if (spec.pattern === 'colorpoint') {
      ctx.fillStyle = sec;
      ctx.fillRect(-bodyW * u, 22 * u, bodyW * 2 * u, 8 * u);
    }
    ctx.restore();
  }
  // chest (a tortie has no white)
  if (spec.pattern !== 'tortie') {
    ctx.fillStyle = ter;
    ellipse(ctx, 0, 16 * u, bodyW * 0.42 * u, 9 * u);
    ctx.fill();
  }

  // head
  const hy = -14 * u;
  const hr = 17 * u;
  ctx.fillStyle = point;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    if (spec.ears === 'fold') {
      ctx.moveTo(s * 13 * u, hy - 9 * u);
      ctx.quadraticCurveTo(s * 15 * u, hy - 18 * u, s * 5 * u, hy - 15 * u);
    } else {
      ctx.moveTo(s * 15 * u, hy - 6 * u);
      ctx.lineTo(s * 13 * u, hy - 24 * u);
      ctx.lineTo(s * 3 * u, hy - 15 * u);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = base;
  ellipse(ctx, 0, hy, hr, hr * 0.92);
  ctx.fill();
  ctx.stroke();
  // round 2: a tuxedo card read as a plain grey cat: the white muzzle (and the tuxedo's socks) match the 3D coat
  if ((spec.pattern === 'tuxedo' || spec.pattern === 'bicolor' || spec.pattern === 'calico') && !face) {
    ctx.fillStyle = ter;
    ellipse(ctx, 0, hy + 6 * u, hr * 0.6, hr * 0.45);
    ctx.fill();
    if (spec.pattern === 'tuxedo') {
      for (const sx of [-0.55, 0.55]) {
        ellipse(ctx, sx * bodyW * u, 25 * u, 5 * u, 3.2 * u);
        ctx.fill();
      }
    }
  }
  if (spec.pattern === 'colorpoint' && !face) {
    ctx.fillStyle = sec;
    ellipse(ctx, 0, hy + 3 * u, hr * 0.55, hr * 0.5);
    ctx.fill();
  }
  if (spec.pattern === 'tabby' && !face) {
    ctx.fillStyle = sec;
    for (const dx of [-5, 0, 5]) ctx.fillRect((dx - 1) * u, hy - hr * 0.9, 2.2 * u, 7 * u);
  }
  if (face) {
    ctx.save();
    ellipse(ctx, 0, hy + 1 * u, hr * 0.86, hr * 0.84);
    ctx.clip();
    ctx.drawImage(face, -hr * 0.95, hy - hr * 0.95 + u, hr * 1.9, hr * 1.9);
    ctx.restore();
  } else {
    ctx.fillStyle = eye;
    for (const s of [-1, 1]) {
      ellipse(ctx, s * 6.5 * u, hy - 1 * u, 3.2 * u, 3.8 * u);
      ctx.fill();
      ctx.fillStyle = ink;
      ellipse(ctx, s * 6.5 * u, hy - 1 * u, 1.2 * u, 3 * u);
      ctx.fill();
      ctx.fillStyle = eye;
    }
    ctx.fillStyle = '#e88a9a';
    ctx.beginPath();
    ctx.moveTo(-2 * u, hy + 4 * u);
    ctx.lineTo(2 * u, hy + 4 * u);
    ctx.lineTo(0, hy + 6.5 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}
