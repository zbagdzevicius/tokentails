/** Pointer-follow foil and tilt for champion cards (ui/cards/frame.ts); its own small chunk, loaded by the pick screen. */
const reduced = (): boolean => {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const tilted = new WeakSet<HTMLElement>();
/**
 * Pointer-follow tilt and glare for every `.tt-card.foil-hover` / `.foil-sweep` under `root` (one delegated listener,
 * rAF-throttled, no per-move allocation beyond the event). Idempotent per root; nothing under reduced motion.
 */
export function attachCardTilt(root: HTMLElement): void {
  if (tilted.has(root) || reduced()) return;
  tilted.add(root);
  let card: HTMLElement | null = null;
  let px = 0;
  let py = 0;
  let raf = 0;
  const paint = (): void => {
    raf = 0;
    if (!card || !card.isConnected) return;
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    const x = Math.min(1, Math.max(0, (px - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (py - r.top) / r.height));
    card.style.setProperty('--mx', `${(x * r.width).toFixed(1)}px`);
    card.style.setProperty('--my', `${(y * r.height).toFixed(1)}px`);
    card.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
  };
  const leave = (c: HTMLElement | null): void => {
    if (!c) return;
    c.classList.remove('tt-hover');
    c.style.removeProperty('--rx');
    c.style.removeProperty('--ry');
  };
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const c = (e.target as HTMLElement | null)?.closest<HTMLElement>('.tt-card.foil-hover, .tt-card.foil-sweep') ?? null;
    if (c !== card) {
      leave(card);
      card = c;
      card?.classList.add('tt-hover');
    }
    px = e.clientX;
    py = e.clientY;
    if (card && !raf) raf = requestAnimationFrame(paint);
  });
  root.addEventListener('pointerleave', () => {
    leave(card);
    card = null;
  });
}
