/**
 * HIGHLIGHTS.md §5.1: the results screen's highlights strip, its own lazy chunk. Three skeleton cards ("Finding
 * highlights…") while the sim Worker scans the match, then the reel's 3 best and a Funniest card, each with a
 * one-tap Clip (long-press or right-click: Vertical / Wide), and a Montage button. A scan that fails or takes longer
 * than SCAN_CAP_MS leaves the best-moment line as it was (a late reel still fills the strip). Solo matches only.
 */
import type { HeroId, ReplayRecord } from '../sim/api';
import { clipSupported } from '../share/clipSupport';
import { mmss, highlightSeconds, montageSegments, type Highlight, type HighlightReel } from './highlights/rules';
import { scanReel, type Scan } from './scan';
import '../ui/css/highlights-strip.css';

/** The strip falls back to the best-moment line after this long (a late reel still fills it). */
export const SCAN_CAP_MS = 15_000;

export type StripFraming = 'vertical' | 'wide';

export interface StripOpts {
  /** The results' `[data-slot="highlights"]`. */
  slot: HTMLElement;
  record: ReplayRecord;
  /** Display name per slot (the results' names). */
  names: readonly string[];
  /** gaps5 polish 3: ticks of the player's emotes (the "Emote storm" highlight). */
  emotes?: readonly number[];
  /** Heroes per slot (the welcome's picks). */
  picks: readonly HeroId[];
  /** The history row's cached reel when it is still valid. */
  cached: HighlightReel | null;
  portrait(hero: HeroId, slot: number): string;
  onOpen(h: Highlight): void;
  /** Record highlight `h` (null framing: the device's default). */
  onClip(h: Highlight, framing: StripFraming | null): void;
  onMontage(framing: StripFraming | null): void;
  onReel(reel: HighlightReel): void;
  track?(event: string, props: Record<string, string | number | boolean>): void;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const STAR = '<svg class="pl-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 L29 18 L44 19 L32 28 L36 43 L24 34 L12 43 L16 28 L4 19 L19 18 Z" fill="currentColor"/></svg>';
const KIND: Readonly<Record<Highlight['category'], string>> = Object.freeze({ epic: 'Epic', teamfight: 'Teamfight', clutch: 'Clutch', objective: 'Objective', funny: 'Funny', story: 'Story' });
const band = (h: Highlight): string => (h.category === 'funny' ? 'funny' : h.category === 'teamfight' ? 'fight' : h.category === 'clutch' || h.category === 'objective' ? 'bolt' : 'epic');

/** The cards the strip shows: the top 3 (best first) and the Funniest. Pure. */
export function stripCards(reel: HighlightReel): { h: Highlight; funniest: boolean }[] {
  const byId = (id: string): Highlight | undefined => reel.list.find((x) => x.id === id);
  const out: { h: Highlight; funniest: boolean }[] = [];
  for (const id of reel.top) {
    const h = byId(id);
    if (h) out.push({ h, funniest: false });
  }
  const f = reel.funniest ? byId(reel.funniest) : undefined;
  if (f) out.push({ h: f, funniest: true });
  return out;
}

export function mountHighlights(o: StripOpts): { dispose(): void } {
  const html = document.documentElement;
  const canClip = clipSupported();
  const best = o.slot.parentElement?.querySelector<HTMLElement>('.pl-best') ?? null;
  let scan: Scan | null = null;
  let disposed = false;
  let lastReel: HighlightReel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const t0 = performance.now();
  o.slot.innerHTML = `<div class="pl-hl" data-testid="hl-strip" aria-busy="true"><div class="pl-hl-head">${STAR}<span>Finding highlights…</span></div><div class="pl-hl-row"><i class="pl-hl-sk"></i><i class="pl-hl-sk"></i><i class="pl-hl-sk"></i></div></div>`;
  html.dataset.hl = 'scanning';

  const face = (slot: number): string => {
    const hero = o.picks[slot];
    if (!hero) return '';
    return `<span><img src="${esc(o.portrait(hero, slot))}" alt="${esc(o.names[slot] ?? hero)}">${slot !== 0 ? '<i>BOT</i>' : ''}</span>`;
  };

  const render = (reel: HighlightReel): void => {
    const cards = stripCards(reel);
    if (!cards.length) return fallback('empty');
    const segs = montageSegments(reel, o.record.ticks);
    const mont = canClip && segs.length >= 3 ? segs.reduce((n, s) => n + s.seconds, 0) : 0;
    o.slot.innerHTML = `<div class="pl-hl" data-testid="hl-strip"><div class="pl-hl-head">${STAR}<span>Highlights</span>${mont ? `<button type="button" class="pl-btn ghost small pl-hl-mont" data-hl-mont data-testid="hl-montage" title="Record the match montage">${STAR}Montage · ${mont} s</button>` : ''}</div><div class="pl-hl-row">${cards
      .map(({ h, funniest }) => {
        const who = [...new Set([...h.actors, ...h.victims])].slice(0, 3);
        return `<div class="pl-hl-card ${band(h)}${funniest ? ' funniest' : ''}" role="button" tabindex="0" data-hl-card="${esc(h.id)}" data-testid="hl-card" aria-label="${esc(`${h.title}, ${mmss(h.start)}, ${highlightSeconds(h)} seconds`)}">
          <span class="k">${funniest ? '😹 Funniest' : KIND[h.category]}</span><b>${esc(h.title)}</b><small>${mmss(h.start)} · ${highlightSeconds(h)} s</small>
          <span class="pl-hl-faces">${who.map(face).join('')}</span>
          ${canClip ? `<button type="button" class="pl-hl-clip" data-hl-clip="${esc(h.id)}" data-testid="hl-clip" title="Record this highlight (hold or right-click: Vertical / Wide)">Clip</button>` : ''}
        </div>`;
      })
      .join('')}</div></div>`;
    // the best-moment line becomes the strip
    if (best) best.style.display = 'none';
    html.dataset.hl = 'ready';
    html.dataset.hlCount = String(cards.length);
  };

  const fallback = (why: string): void => {
    if (disposed || html.dataset.hl === 'ready') return;
    o.slot.innerHTML = '';
    if (best) best.style.display = '';
    html.dataset.hl = `fallback:${why}`;
    html.dataset.hlCount = '0';
  };

  const done = (reel: HighlightReel | null, ms: number, cached: boolean): void => {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!cached) o.track?.('hl_scan', { ms: Math.round(ms), count: reel?.list.length ?? 0, ok: !!reel });
    if (!reel) return fallback('failed');
    lastReel = reel;
    if (!cached) o.onReel(reel);
    render(reel);
  };

  if (o.cached) done(o.cached, 0, true);
  else {
    scan = scanReel(o.record, { names: o.names.slice(), ...(o.emotes?.length ? { emotes: o.emotes.slice() } : {}) });
    void scan.done.then((r) => done(r.reel, r.ms || performance.now() - t0, false));
    timer = setTimeout(() => fallback('slow'), SCAN_CAP_MS);
  }

  // one tap opens the highlight; Clip records it; a long-press or right-click on Clip asks Vertical or Wide
  let press: { id: string; at: ReturnType<typeof setTimeout> } | null = null;
  let longFired = false;
  const reelNow = (): HighlightReel | null => (html.dataset.hl === 'ready' ? lastReel : null);
  const find = (id: string | undefined): Highlight | null => (id ? (reelNow()?.list.find((h) => h.id === id) ?? null) : null);
  const askFraming = (card: HTMLElement, h: Highlight): void => {
    card.querySelector('.pl-hl-fr')?.remove();
    const pop = document.createElement('span');
    pop.className = 'pl-hl-fr';
    pop.innerHTML = `<button type="button" class="pl-hl-clip" data-fr="vertical" data-testid="hl-clip-vertical">9:16</button><button type="button" class="pl-hl-clip" data-fr="wide" data-testid="hl-clip-wide" style="top:36px">16:9</button>`;
    pop.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = (e.target as HTMLElement).closest<HTMLElement>('[data-fr]')?.dataset.fr;
      if (f === 'vertical' || f === 'wide') o.onClip(h, f);
    });
    card.appendChild(pop);
  };
  o.slot.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (longFired) {
      longFired = false;
      return;
    }
    if (t.closest('[data-hl-mont]')) return o.onMontage(null);
    const clip = t.closest<HTMLElement>('[data-hl-clip]');
    if (clip) {
      e.stopPropagation();
      const h = find(clip.dataset.hlClip);
      if (h) o.onClip(h, null);
      return;
    }
    const h = find(t.closest<HTMLElement>('[data-hl-card]')?.dataset.hlCard);
    if (h) o.onOpen(h);
  });
  o.slot.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const h = find((e.target as HTMLElement).closest<HTMLElement>('[data-hl-card]')?.dataset.hlCard);
    if (h && (e.target as HTMLElement).matches('[data-hl-card]')) {
      e.preventDefault();
      o.onOpen(h);
    }
  });
  o.slot.addEventListener('contextmenu', (e) => {
    const clip = (e.target as HTMLElement).closest<HTMLElement>('[data-hl-clip]');
    const h = find(clip?.dataset.hlClip);
    if (!clip || !h) return;
    e.preventDefault();
    askFraming(clip.closest<HTMLElement>('[data-hl-card]')!, h);
  });
  o.slot.addEventListener('pointerdown', (e) => {
    const clip = (e.target as HTMLElement).closest<HTMLElement>('[data-hl-clip]');
    const id = clip?.dataset.hlClip;
    if (!clip || !id || e.pointerType === 'mouse') return;
    press = {
      id,
      at: setTimeout(() => {
        const h = find(id);
        if (!h) return;
        longFired = true;
        askFraming(clip.closest<HTMLElement>('[data-hl-card]')!, h);
      }, 500),
    };
  });
  const endPress = (): void => {
    if (press) clearTimeout(press.at);
    press = null;
  };
  o.slot.addEventListener('pointerup', endPress);
  o.slot.addEventListener('pointercancel', endPress);

  return {
    dispose: () => {
      disposed = true;
      scan?.cancel();
      if (timer !== null) clearTimeout(timer);
      endPress();
      delete html.dataset.hl;
      delete html.dataset.hlCount;
    },
  };
}
