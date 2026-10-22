/**
 * Race HUD, iteration 4 juice layer (juice lane; F4, F5, F6). DOM only, diffed writes, every string through `t()`.
 * The `Hud` owns one `JuiceHud` (`hud.fx`); the juice director (`src/juice/index.ts`) drives it from the race.
 *
 *  - final-lap gap chips under the place badge: gold "▲ +0.4 s" to the cat ahead, red "▼ −0.3 s" to the cat behind;
 *    within 0.5 s the chip turns hot ("CATCH!" / "DEFEND!") and the matching screen edge glows (top gold, bottom red)
 *  - the photo-finish shutter flash and stamp ("PHOTO FINISH" / "by 0.07 s"), the "WON BY 1.8 s" banner
 *  - the slipstream charge ring (bottom centre, above the drift meter) and the ON FIRE badge
 *  - the purple FASTEST LAP flash
 *
 * Reduced motion: no flash, no edge glow, no animation; the chips, stamp, banner and badges still show.
 */
import { t } from '../../ui/i18n';
import { reducedMotion } from '../../ui/a11y';

export type EdgeGlow = 'defend' | 'catch' | null;

/** One gap chip's text: "▲ +0.4 s" (ahead) / "▼ −0.3 s" (behind); within the glow range the call word leads. */
export function gapChipText(sec: number, ahead: boolean, hot: boolean): string {
  const v = `${ahead ? '+' : '−'}${Math.abs(sec).toFixed(1)} s`;
  if (hot) return `${ahead ? t('CATCH!') : t('DEFEND!')} ${v}`;
  return `${ahead ? '▲' : '▼'} ${v}`;
}

/** The chain numbers the results row needs (the shape of `juice/boost-chain.ts` `BoostChainSummary`). */
export interface ChainRow {
  best: number;
  fires: number;
}

/**
 * The "Best chain" results row (F6): "⚡ Best chain ×4 · ON FIRE ×1". Null in a battle or when no two boosts chained.
 */
export function chainSection(s: Readonly<ChainRow> | null, ctx: { mode: string }): HTMLElement | null {
  if (!s || ctx.mode === 'battle' || s.best < 2) return null;
  const el = document.createElement('div');
  el.className = 'fm-line fm-chain';
  el.dataset.chain = String(s.best);
  const parts = [t('Best chain ×{n}', { n: s.best })];
  if (s.fires > 0) parts.push(t('ON FIRE ×{n}', { n: s.fires }));
  el.textContent = `⚡ ${parts.join(' · ')}`;
  return el;
}

const RING_C = 2 * Math.PI * 19;

export class JuiceHud {
  readonly root: HTMLDivElement;
  private gapA: HTMLSpanElement;
  private gapB: HTMLSpanElement;
  private edgeTop: HTMLDivElement;
  private edgeBot: HTMLDivElement;
  private shutterEl: HTMLDivElement;
  private stampEl: HTMLDivElement;
  private ring: HTMLDivElement;
  private ringArc: SVGCircleElement;
  private fireEl: HTMLDivElement;
  private fastEl: HTMLDivElement;
  private last = { a: '', b: '', glow: '' as string, ring: -1, fire: '' };
  private stampTimer: ReturnType<typeof setTimeout> | null = null;
  private fastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(hudRoot: HTMLElement, gapsParent: HTMLElement, bottom: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'fm-jx';
    this.root.innerHTML = `
      <div class="fm-edge top" aria-hidden="true"></div>
      <div class="fm-edge bot" aria-hidden="true"></div>
      <div class="fm-shutter" aria-hidden="true"></div>
      <div class="fm-stamp" role="status" aria-live="polite"><b></b><small></small></div>
      <div class="fm-fastest fm-outline" aria-hidden="true"></div>`;
    hudRoot.appendChild(this.root);
    const q = <T extends Element>(s: string) => this.root.querySelector(s) as T;
    this.edgeTop = q('.fm-edge.top');
    this.edgeBot = q('.fm-edge.bot');
    this.shutterEl = q('.fm-shutter');
    this.stampEl = q('.fm-stamp');
    this.fastEl = q('.fm-fastest');
    this.fastEl.textContent = t('FASTEST LAP');

    const gaps = document.createElement('div');
    gaps.className = 'fm-gaps';
    gaps.setAttribute('aria-hidden', 'true');
    gaps.innerHTML = '<span class="fm-gap ahead"></span><span class="fm-gap behind"></span>';
    gapsParent.appendChild(gaps);
    this.gapA = gaps.querySelector('.ahead') as HTMLSpanElement;
    this.gapB = gaps.querySelector('.behind') as HTMLSpanElement;

    // the slipstream ring and the ON FIRE badge sit above the drift meter
    this.fireEl = document.createElement('div');
    this.fireEl.className = 'fm-fire fm-outline';
    this.fireEl.setAttribute('aria-hidden', 'true');
    this.ring = document.createElement('div');
    this.ring.className = 'fm-slipring';
    this.ring.setAttribute('aria-hidden', 'true');
    this.ring.innerHTML = `<svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="19"/><circle class="arc" cx="24" cy="24" r="19" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}"/></svg><span>💨</span>`;
    this.ringArc = this.ring.querySelector('.arc') as SVGCircleElement;
    bottom.prepend(this.ring);
    bottom.prepend(this.fireEl);
  }

  /** A new race: everything off. */
  reset(): void {
    this.gaps(null, null, null);
    this.slip(0);
    this.fire(null);
    if (this.stampTimer) clearTimeout(this.stampTimer);
    if (this.fastTimer) clearTimeout(this.fastTimer);
    this.stampTimer = this.fastTimer = null;
    this.stampEl.className = 'fm-stamp';
    this.fastEl.classList.remove('on');
    this.shutterEl.classList.remove('on');
  }

  /** The final-lap gap chips (seconds, null hides one) and the edge glow. */
  gaps(ahead: number | null, behind: number | null, glow: EdgeGlow): void {
    const a = ahead == null ? '' : gapChipText(ahead, true, glow === 'catch');
    const b = behind == null ? '' : gapChipText(behind, false, glow === 'defend');
    if (a !== this.last.a) {
      this.last.a = a;
      this.gapA.textContent = a;
      this.gapA.classList.toggle('on', !!a);
      this.gapA.classList.toggle('hot', glow === 'catch');
    }
    if (b !== this.last.b) {
      this.last.b = b;
      this.gapB.textContent = b;
      this.gapB.classList.toggle('on', !!b);
      this.gapB.classList.toggle('hot', glow === 'defend');
    }
    const g = reducedMotion() ? '' : (glow ?? '');
    if (g !== this.last.glow) {
      this.last.glow = g;
      this.edgeTop.classList.toggle('on', g === 'catch');
      this.edgeBot.classList.toggle('on', g === 'defend');
    }
  }

  /** The visible glow ('' when none; QA, e2e). */
  get glow(): string {
    return this.last.glow;
  }

  /** The photo-finish camera flash (never under reduced motion). */
  shutter(): void {
    if (reducedMotion()) return;
    this.shutterEl.classList.remove('on');
    void this.shutterEl.offsetWidth;
    this.shutterEl.classList.add('on');
  }

  /** The finish stamp: 'photo' ("PHOTO FINISH" with the margin) or 'won' (the gold "WON BY" banner). */
  stamp(kind: 'photo' | 'won', title: string, sub: string, ms = 2600): void {
    (this.stampEl.firstChild as HTMLElement).textContent = title;
    (this.stampEl.lastChild as HTMLElement).textContent = sub;
    this.stampEl.className = 'fm-stamp';
    void this.stampEl.offsetWidth;
    this.stampEl.className = `fm-stamp on ${kind}`;
    if (this.stampTimer) clearTimeout(this.stampTimer);
    this.stampTimer = setTimeout(() => this.stampEl.classList.remove('on'), ms);
  }

  /** Change the stamp's words in place (no new slam): the exact margin replacing a projection. */
  retitle(title: string, sub: string): void {
    if (!this.stampEl.classList.contains('on')) return;
    (this.stampEl.firstChild as HTMLElement).textContent = title;
    (this.stampEl.lastChild as HTMLElement).textContent = sub;
  }

  /** The stamp on screen now ('' when none; QA, e2e). */
  get stamped(): string {
    return this.stampEl.classList.contains('on') ? (this.stampEl.textContent ?? '') : '';
  }

  /** The slipstream charge 0..1 (0 hides the ring; full = it fires when you pull out). */
  slip(frac: number): void {
    const f = frac <= 0.04 ? 0 : Math.min(1, frac);
    const q = Math.round(f * 40);
    if (q === this.last.ring) return;
    this.last.ring = q;
    this.ring.classList.toggle('on', q > 0);
    this.ring.classList.toggle('full', q >= 40);
    this.ringArc.setAttribute('stroke-dashoffset', (RING_C * (1 - q / 40)).toFixed(1));
  }

  /** ON FIRE badge: null hides it, else the text ("🔥 ON FIRE") and 0..1 of the time left. */
  fire(text: string | null, left = 1): void {
    const key = text ? `${text}|${Math.round(left * 10)}` : '';
    if (key === this.last.fire) return;
    const was = !!this.last.fire;
    this.last.fire = key;
    if (!text) {
      this.fireEl.classList.remove('on');
      return;
    }
    this.fireEl.textContent = text;
    this.fireEl.style.setProperty('--left', left.toFixed(2));
    if (!was) {
      this.fireEl.classList.remove('on');
      void this.fireEl.offsetWidth;
    }
    this.fireEl.classList.add('on');
  }

  /** The purple FASTEST LAP flash. */
  fastest(): void {
    this.fastEl.classList.remove('on');
    void this.fastEl.offsetWidth;
    this.fastEl.classList.add('on');
    if (this.fastTimer) clearTimeout(this.fastTimer);
    this.fastTimer = setTimeout(() => this.fastEl.classList.remove('on'), 1800);
  }

  dispose(): void {
    if (this.stampTimer) clearTimeout(this.stampTimer);
    if (this.fastTimer) clearTimeout(this.fastTimer);
    this.root.remove();
  }
}
