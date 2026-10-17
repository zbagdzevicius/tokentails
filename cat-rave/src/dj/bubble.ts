/**
 * L-DJ: comic speech bubble over the DJ's head ("CAT #10 JUST LANDED!", "NO SLEEP. JUST GRIND.").
 * A camera-facing sprite with a canvas texture; pops in elastic, bobs on the kick, fades out.
 * Higher-priority shouts (a new cat) are never cut off by lower ones (drop catchphrases).
 */
import { CanvasTexture, LinearFilter, Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { easeOutElastic, clamp01 } from './motion';

export interface Bubble {
  sprite: Sprite;
  /** Show `text` for `seconds`. Returns false when a higher-priority bubble is still up. */
  say(text: string, seconds: number, priority: number, time: number): boolean;
  /** `size`: world width of the bubble this frame (scale with camera distance). */
  update(time: number, kick: number, size?: number): void;
  /**
   * Which side of the DJ the bubble grows towards on screen: 1 = right (tail bottom-left),
   * -1 = left (tail bottom-right). Used to keep it off the raised sword.
   */
  setSide(side: 1 | -1): void;
  readonly text: string | null;
  dispose(): void;
}

const W = 768;
const H = 384;
/** World size of the bubble (metres). */
const WORLD_W = 2.0;

/** Word-wrap `text` into at most 3 lines that fit `maxW` at the largest font size that fits. */
export function layoutBubble(text: string, measure: (s: string, px: number) => number, maxW: number, maxH: number): { lines: string[]; px: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let px = 92; px >= 30; px -= 4) {
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (measure(next, px) <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    const tooWide = lines.some((l) => measure(l, px) > maxW);
    if (!tooWide && lines.length * px * 1.08 <= maxH && lines.length <= 3) return { lines, px };
  }
  return { lines: [text.slice(0, 40)], px: 30 };
}

export function buildBubble(): Bubble {
  const hasDom = typeof document !== 'undefined';
  const canvas = hasDom ? document.createElement('canvas') : null;
  if (canvas) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas?.getContext('2d') ?? null;
  const tex = canvas ? new CanvasTexture(canvas) : null;
  if (tex) {
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
  }
  const mat = new SpriteMaterial({ map: tex ?? undefined, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
  mat.color.setScalar(0.96);
  const sprite = new Sprite(mat);
  sprite.name = 'dj-bubble';
  // Anchor at the tail (bottom-left), so the bubble grows up-right from the DJ's head.
  sprite.center.set(0.14, 0.02);
  sprite.renderOrder = 60; // after lasers (20) and haze (30+), so beams never cut through the text
  sprite.visible = false;
  sprite.frustumCulled = false;

  let current: string | null = null;
  let start = 0;
  let until = 0;
  let prio = -1;
  let pending: { text: string; seconds: number; priority: number } | null = null;

  const font = (px: number) => `900 ${px}px "Arial Black", "Arial Rounded MT Bold", Impact, system-ui, sans-serif`;

  let side: 1 | -1 = 1;
  const draw = (text: string) => {
    if (!ctx || !tex) return;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Mirror only the balloon outline for a left-side bubble (the text is drawn unmirrored below).
    if (side < 0) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    const pad = 16;
    const bx = pad;
    const by = pad;
    const bw = W - pad * 2;
    const bh = H - pad * 2 - 70;
    const r = 70;
    // Bubble with a tail pointing down-left at the DJ.
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + 230, by + bh);
    ctx.lineTo(bx + 70, H - pad);
    ctx.lineTo(bx + 150, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#ff4f9e';
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#141414';
    ctx.stroke();
    ctx.restore();

    const measure = (s: string, px: number) => {
      ctx.font = font(px);
      return ctx.measureText(s).width;
    };
    const { lines, px } = layoutBubble(text.toUpperCase(), measure, bw - 70, bh - 40);
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = px * 1.08;
    const cy = by + bh / 2 - ((lines.length - 1) * lh) / 2 + px * 0.04;
    lines.forEach((l, i) => {
      const y = cy + i * lh;
      // Pink drop shadow, then ink.
      ctx.fillStyle = '#ff4f9e';
      ctx.fillText(l, bx + bw / 2 + 4, y + 5);
      ctx.fillStyle = '#121212';
      ctx.fillText(l, bx + bw / 2, y);
    });
    tex.needsUpdate = true;
  };

  const show = (text: string, seconds: number, priority: number, time: number) => {
    current = text;
    start = time;
    until = time + seconds;
    prio = priority;
    draw(text);
    sprite.visible = !!tex;
  };

  return {
    sprite,
    get text() {
      return current;
    },
    setSide(s) {
      if (s === side) return;
      side = s;
      sprite.center.set(s > 0 ? 0.14 : 0.86, 0.02);
      if (current) draw(current);
    },
    say(text, seconds, priority, time) {
      if (current && time < until && priority < prio) return false;
      // Called between frames: defer to update() so the pop uses the frame clock.
      pending = { text, seconds, priority };
      void time;
      return true;
    },
    update(time, kick, size = WORLD_W) {
      if (pending) {
        show(pending.text, pending.seconds, pending.priority, time);
        pending = null;
      }
      if (!current) return;
      const t = time - start;
      const left = until - time;
      if (left <= 0) {
        current = null;
        prio = -1;
        sprite.visible = false;
        return;
      }
      const pop = easeOutElastic(t / 0.55);
      const out = clamp01(left / 0.25);
      const bob = 1 + 0.04 * kick;
      const k = Math.max(0.001, pop * out * bob);
      sprite.scale.set(size * k, ((size * H) / W) * k, 1);
      mat.opacity = out;
      mat.rotation = 0.04 * Math.sin(time * 2.3);
    },
    dispose() {
      tex?.dispose();
      mat.dispose();
    },
  };
}
