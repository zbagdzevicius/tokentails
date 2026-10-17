/**
 * Result (GDD 3.1): score counts up, stamp slams, rank title, emoji timeline; Share clip, Dare a friend
 * (disabled until M1a), Play again. The clip renders behind this screen; the Share button shows progress.
 */
import type { RunResult } from '../../types';
import { COPY, STAMP_LABEL, formatScore, seenText } from '../copy';
import { btn, h } from '../dom';

export interface ClipView {
  status: 'idle' | 'rendering' | 'ready' | 'error' | 'unavailable';
  progress: number;
}

export interface ResultProps {
  result: RunResult;
  label: string;
  timeline: string;
  bestNote?: string;
  /** Dare outcome line: "You beat Mochi by 1,240" / "Mochi still rules Kitchen #18". */
  dareNote?: string;
  /** Dare a friend; absent after the first heist (GDD 6.3: ranked or practice runs only). */
  onDare?(): void;
  reduceMotion: boolean;
  onStamp(): void;
  /** Share the clip; absent when there is nothing to clip (a 0-chaos run that was not caught, round 3). */
  onShare?(): void;
  /** A run with nothing to clip (0 chaos): share a "napped through it" line with the room link instead. */
  onShareLine?(): void;
  onPlayAgain(): void;
  onHome(): void;
  // ----- wave 3 -----
  /** Par paws for this room: 0 none, 1 bronze, 2 silver, 3 gold (absent: the room has no par yet). */
  paws?: 0 | 1 | 2 | 3;
  /** Rap Sheet stamps earned for the first time in this run. */
  newStamps?: { icon: string; name: string }[];
  /** Today's Pink Paw accomplice: her wish, and the adopt link (GDD 3.4, 4.6). */
  wish?: { name: string; granted: boolean; onAdopt?(): void };
  /** "+212 season XP · tier 4". */
  xpLine?: string;
  /** Extra dare lines (the second ghost, the replay-only note). */
  dareLines?: string[];
  // ----- Phase 2 -----
  /** A PERFECT CRIME run: "Give a Pink Paw cat a treat" (the existing guest treat page, VITE_BADCAT_TREAT_URL). */
  onTreat?(): void;
}

export interface ResultHandle {
  setClip(v: ClipView): void;
  /** Phase 2: the ranked save line ("Saved: #12 on today's board") and the board button. */
  setOnline?(text: string, onBoard?: () => void): void;
  dispose(): void;
}

/** Ease-out count-up value at time t (0..1). */
export function countUp(target: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return Math.round(target * (1 - Math.pow(1 - k, 3)));
}

export function mountResult(host: HTMLElement, p: ResultProps): ResultHandle {
  const r = p.result;
  const score = h('div', { class: 'bc-result-score' }, '0');
  const stamp = h('div', { class: `bc-stamp bc-stamp-${r.stamp}` }, STAMP_LABEL[r.stamp]);
  const rank = h('div', { class: 'bc-rank' }, r.rank);
  const share = btn(
    COPY.shareClip,
    () => {
      share.classList.add('is-used');
      p.onShare?.();
    },
    'bc-cta bc-cta-big bc-share-btn',
  );
  const bar = h('i', { class: 'bc-progress' });
  share.appendChild(bar);
  const onlineEl = h('p', { class: 'bc-small bc-online-line', 'aria-live': 'polite', hidden: true });
  const root = h(
    'div',
    { class: 'bc-screen bc-result' },
    // short room name ("Kitchen #18", not the whole title) so the kicker stays on one line on a phone
    h('div', { class: 'bc-kicker' }, shortRoomLabel(p.label), ' ', h('span', { class: 'bc-nowrap' }, r.mode === 'ranked' ? '· ranked' : r.mode === 'ftue' ? '· first heist' : '· practice')),
    score,
    h('div', { class: 'bc-muted' }, 'chaos'),
    stamp,
    rank,
    h('div', { class: 'bc-timeline', 'aria-label': 'timeline' }, p.timeline),
    h(
      'div',
      { class: 'bc-stats' },
      h('span', {}, `×${r.maxCombo} combo`),
      h('span', {}, `🎯 ${r.targets}/3`),
      h('span', {}, seenText(r.seenCount, r.stamp)),
    ),
    p.paws !== undefined ? pawsEl(p.paws) : null,
    p.dareNote ? h('p', { class: 'bc-dare-note' }, p.dareNote) : null,
    ...(p.dareLines ?? []).map((t) => h('p', { class: 'bc-muted bc-small bc-dare-extra' }, t)),
    p.wish ? wishEl(p.wish) : null,
    p.newStamps?.length
      ? h(
          'div',
          { class: 'bc-new-stamps' },
          h('span', { class: 'bc-kicker' }, p.newStamps.length === 1 ? 'New on the Rap Sheet' : `${p.newStamps.length} new on the Rap Sheet`),
          ...p.newStamps.slice(0, 4).map((x) => h('span', { class: 'bc-stamp-mini' }, `${x.icon} ${x.name}`)),
          p.newStamps.length > 4 ? h('span', { class: 'bc-stamp-mini bc-stamp-more', 'aria-label': `${p.newStamps.length - 4} more` }, `+${p.newStamps.length - 4}`) : null,
        )
      : null,
    p.bestNote ? h('p', { class: 'bc-muted bc-small' }, p.bestNote) : null,
    p.xpLine ? h('p', { class: 'bc-muted bc-small bc-xp' }, p.xpLine) : null,
    onlineEl,
    p.onTreat && r.stamp === 'perfect' ? btn('🐟 Give a Pink Paw cat a treat', p.onTreat, 'bc-cta bc-cta-soft bc-treat') : null,
    h(
      'div',
      { class: 'bc-actions' },
      p.onShare ? share : null,
      !p.onShare && p.onShareLine ? btn('Share: my cat napped through it 😴', p.onShareLine, 'bc-cta bc-cta-big bc-share-line') : null,
      p.onDare ? btn(COPY.dare, p.onDare, 'bc-cta bc-cta-soft') : null,
      btn(COPY.playAgain, p.onPlayAgain, p.onShare || p.onShareLine ? 'bc-cta bc-cta-soft' : 'bc-cta bc-cta-big'),
      btn('Home', p.onHome, 'bc-link'),
    ),
  );
  host.appendChild(root);

  const dur = p.reduceMotion ? 1 : 1200;
  const t0 = performance.now();
  let raf = 0;
  let stamped = false;
  const tick = (): void => {
    const t = (performance.now() - t0) / dur;
    score.textContent = formatScore(countUp(r.score, t));
    if (t >= 1) {
      if (!stamped) {
        stamped = true;
        stamp.classList.add('is-in');
        rank.classList.add('is-in');
        p.onStamp();
      }
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setClip(v) {
      share.classList.toggle('is-rendering', v.status === 'rendering');
      share.classList.toggle('is-ready', v.status === 'ready');
      bar.style.width = v.status === 'rendering' ? `${Math.round(v.progress * 100)}%` : '0';
      share.firstChild!.textContent =
        v.status === 'ready' ? COPY.shareClip : v.status === 'rendering' ? COPY.clipRendering : v.status === 'error' ? COPY.clipError : COPY.shareClip;
    },
    setOnline(text, onBoard) {
      onlineEl.innerHTML = '';
      onlineEl.hidden = !text;
      onlineEl.append(text);
      if (onBoard) onlineEl.append(' ', btn('See the board', onBoard, 'bc-link bc-online-board'));
    },
    dispose() {
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}

const PAW_LABEL = ['No paws yet', 'Bronze paw', 'Silver paws', 'Gold paws'] as const;

function pawsEl(n: 0 | 1 | 2 | 3): HTMLElement {
  return h(
    'div',
    { class: `bc-paws is-${n}`, 'aria-label': PAW_LABEL[n] },
    ...[1, 2, 3].map((i) => h('span', { class: `bc-paw${i <= n ? ' is-on' : ''}`, 'aria-hidden': 'true' }, '🐾')),
    h('small', {}, PAW_LABEL[n]),
  );
}

function wishEl(w: NonNullable<ResultProps['wish']>): HTMLElement {
  return h(
    'div',
    { class: `bc-wish${w.granted ? ' is-granted' : ''}` },
    // round 3: no pronoun for every Pink Paw cat (the shelter data has none): the cat's name carries the line
    h('span', {}, w.granted ? `💖 Wish granted! ${w.name} is thrilled.` : `${w.name} is still hoping for that wish.`),
    w.onAdopt ? btn(`Meet ${w.name} at Pink Paw ›`, w.onAdopt, 'bc-link bc-adopt') : null,
  );
}

/**
 * The result kicker's room name: "Kitchen #18" from "Kitchen #18: Leftovers"; a boss room keeps its name
 * ("👑 Christmas Tree #20", round 2: it read "BOSS · RANKED").
 */
export function shortRoomLabel(label: string): string {
  const boss = /^boss:\s*/i.exec(label);
  if (boss) return `👑 ${label.slice(boss[0].length).split(':')[0].trim()}`;
  return label.split(':')[0].trim() || label;
}
