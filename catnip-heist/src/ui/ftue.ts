/**
 * First-run overlays for a heist (plan G10 "Heist"): the brief card that opens a level the first
 * time, and the "Rewind 5 s" offer after a detection on the first three levels. The route hint
 * itself is drawn in the scene (src/onboarding/ghost-paws.ts) and toggled from the objective chip
 * (ui.ts).
 *
 * The brief is the run's start gate: the sim clock does not run while it is open (App), and the key
 * or tap that closes it is consumed, so the cat never jumps.
 */
import type { BriefContent } from '../onboarding/brief';
import { h } from './dom';
import { icon } from './icons';
import { HEIST_BODY_FONT } from './fonts.generated';

export interface FtueOverlay {
  readonly briefOpen: boolean;
  /** Show the brief; `onGo` runs once, when the player closes it (button, tap, Enter, Space or a move key). */
  showBrief(content: BriefContent, opts: { touch: boolean; pawSrc: string; onGo(via: 'button' | 'key' | 'backdrop'): void }): void;
  hideBrief(): void;
  readonly rewindOffered: boolean;
  /**
   * Offer "Rewind 5 s"; `onRewind` runs on the button or the R key and returns whether it rewound.
   * The offer hides only when it did, so a press the app refuses (paused, brief open) keeps it.
   * `ms` sizes the drain bar; the
   * caller hides the offer (App counts it in sim ticks, so pausing never eats it). With `expireMs`
   * the overlay also hides it on its own after that long.
   */
  offerRewind(opts: { ms: number; expireMs?: number; onRewind(): boolean }): void;
  hideRewind(): void;
  /** Hide everything (leaving the HUD). */
  hideAll(): void;
  dispose(): void;
}

const STYLE_ID = 'ch-ftue-styles';
const CSS = /* css */ `
.ch-brief { align-items: center; justify-content: center; z-index: 6;
  padding: calc(var(--ch-sat) + 12px) calc(var(--ch-sar) + 16px) calc(var(--ch-sab) + 12px) calc(var(--ch-sal) + 16px);
  background: radial-gradient(ellipse at 50% 45%, rgba(48,25,52,.35), rgba(11,8,32,.78) 78%); }
.ch-brief.ch-on { animation: ch-screen-in .25s ease-out both; }
.ch-briefing .ch-hint, .ch-briefing .ch-toasts { visibility: hidden; }
.ch-brief-card { width: min(460px, 100%); max-height: 100%; overflow-y: auto; overscroll-behavior: contain; gap: 12px; text-align: left; align-items: stretch; }
/* Two columns on short landscape screens; in portrait the wrappers vanish and CSS order sets the stack. */
.ch-brief-col { display: contents; }
.ch-brief-card .ch-brief-kicker { order: 1; } .ch-brief-card .ch-h2 { order: 2; } .ch-brief-card .ch-brief-intro { order: 3; }
.ch-brief-card .ch-brief-plan { order: 4; } .ch-brief-card .ch-brief-keys { order: 5; } .ch-brief-card .ch-brief-tips { order: 6; } .ch-brief-card .ch-brief-go { order: 7; }
.ch-brief-kicker { margin: 0; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; color: var(--ch-coin); text-shadow: 0 2px 0 var(--ch-ol); }
.ch-brief-card .ch-h2 { margin: -4px 0 0; font-size: clamp(26px, 3vmin + 14px, 38px); line-height: 1.02; }
.ch-brief-intro { margin: 0; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: clamp(15px, .6vmin + 13px, 18px); line-height: 1.35; color: var(--ch-lilac); letter-spacing: 0; }
.ch-brief-plan { padding: 10px 14px 12px; border-radius: 14px; background: rgba(11,8,32,.5); box-shadow: inset 0 0 0 1px rgba(153,102,204,.4); }
.ch-brief-plan small { display: block; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--ch-lav); margin-bottom: 6px; }
.ch-brief-plan ol { margin: 0; padding: 0; list-style: none; counter-reset: ch-step; display: flex; flex-direction: column; gap: 6px; }
.ch-brief-plan li { counter-increment: ch-step; position: relative; padding-left: 32px; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 15px; line-height: 1.3; letter-spacing: 0; color: var(--ch-cream); }
.ch-brief-plan li::before { content: counter(ch-step); position: absolute; left: 0; top: -1px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
  font-family: 'Cat Paw', ui-rounded, system-ui, sans-serif; font-weight: normal; font-size: 13px; color: var(--ch-ol); background: var(--ch-coin); border: 2px solid var(--ch-ol); }
.ch-brief-keys { display: flex; flex-wrap: wrap; gap: 6px 12px; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 13px; color: var(--ch-lilac); letter-spacing: 0; }
.ch-brief-keys span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.ch-brief-keys kbd { display: inline-block; font-family: inherit; font-weight: 800; color: var(--ch-cream); background: linear-gradient(180deg, #4a2a5c, #2c1538); border: 2px solid var(--ch-ol);
  border-bottom-width: 4px; border-radius: 7px; padding: 1px 7px; font-size: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.ch-brief-tips { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.ch-brief-tips li { display: flex; align-items: center; gap: 8px; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 14px; color: var(--ch-mint); letter-spacing: 0; }
.ch-brief-tips img { width: 18px; height: 18px; object-fit: contain; image-rendering: pixelated; flex: none; }
.ch-brief-go { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 2px; }
/* Portrait: when a long plan makes the card scroll, Go! stays pinned to its foot. */
.ch-brief-go { position: sticky; bottom: calc(-1 * clamp(16px, 3vmin, 28px)); z-index: 1; margin-bottom: calc(-1 * clamp(16px, 3vmin, 28px));
  padding: 8px 0 clamp(16px, 3vmin, 28px); background: linear-gradient(180deg, rgba(30,14,38,0), rgba(30,14,38,.95) 30%); }
@media (max-height: 700px) and (min-height: 561px) {
  .ch-brief-card { gap: 9px; }
  .ch-brief-card .ch-h2 { font-size: clamp(24px, 3vmin + 12px, 32px); }
  .ch-brief-intro { font-size: 14px; line-height: 1.3; }
  .ch-brief-plan { padding: 8px 12px 10px; }
  .ch-brief-plan li { font-size: 14px; }
  .ch-brief-tips li { font-size: 13px; line-height: 1.25; }
  .ch-brief-go .ch-btn.ch-big { min-height: 52px; padding: 10px 24px; }
}
.ch-brief-go .ch-btn { width: 100%; }
.ch-brief-go small { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 12px; color: var(--ch-lav); letter-spacing: 0; }
@media (max-height: 560px) {
  .ch-brief-card { width: min(760px, 100%); display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; align-items: stretch; padding: 14px 18px; }
  .ch-brief-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .ch-brief-card .ch-h2 { font-size: clamp(22px, 3vmin + 12px, 30px); }
  .ch-brief-intro { font-size: 14px; line-height: 1.3; }
  .ch-brief-plan { padding: 8px 12px 10px; }
  .ch-brief-plan li { font-size: 14px; }
  .ch-brief-tips li { font-size: 13px; line-height: 1.25; }
  .ch-brief-keys { gap: 4px 10px; font-size: 12px; }
  /* The plan and Go! share the right column; Go! sits at its foot so it is never under the fold. */
  .ch-brief-go { position: static; margin: auto 0 0; padding: 0; background: none; }
  .ch-brief-go .ch-btn.ch-big { min-height: 52px; padding: 10px 24px; font-size: clamp(20px, 3vmin + 8px, 28px); }
  .ch-brief-go small { display: none; }
}

.ch-rewind { position: absolute; left: 50%; bottom: calc(var(--ch-sab) + 96px); transform: translateX(-50%); z-index: 4; pointer-events: auto; display: none;
  --bg: var(--ch-sky); --bg2: #95c6f2; --fg: var(--ch-ol); --hi: rgba(255,255,255,.6); text-shadow: none; padding: 10px 20px 14px; min-height: 52px; }
.ch-rewind.ch-on { display: inline-flex; animation: ch-rewind-in .35s var(--ch-ease-pop) both; }
.ch-rewind kbd { font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 12px; padding: 1px 6px; border-radius: 6px; border: 2px solid var(--ch-ol); background: rgba(255,255,255,.55); }
.ch-rewind .ch-rewind-bar { position: absolute; left: 10px; right: 10px; bottom: 5px; height: 4px; border-radius: 2px; background: rgba(42,15,31,.25); overflow: hidden; }
.ch-rewind .ch-rewind-bar i { position: absolute; inset: 0; background: var(--ch-ol); transform-origin: left center; }
.ch-rewind.ch-on .ch-rewind-bar i { animation: ch-rewind-drain var(--ch-rewind-ms, 6000ms) linear both; }
.ch-paused-run .ch-rewind .ch-rewind-bar i { animation-play-state: paused; }
.ch-touching .ch-rewind { bottom: calc(var(--ch-sab) + 214px); }
.ch-touching .ch-rewind kbd { display: none; }
@keyframes ch-rewind-in { 0% { opacity: 0; transform: translate(-50%, 14px) scale(.9); } 100% { opacity: 1; transform: translate(-50%, 0); } }
@keyframes ch-rewind-drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) { .ch-rewind.ch-on { animation: none; } .ch-rewind.ch-on .ch-rewind-bar i { animation: none; } }
`;

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** Keys that close the brief (and are swallowed so the first press never moves the cat). */
const GO_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape']);

export function createFtueOverlay(root: HTMLElement, hooks: { onClick?(): void } = {}): FtueOverlay {
  ensureStyles();
  let onGo: ((via: 'button' | 'key' | 'backdrop') => void) | null = null;
  const card = h('div.ch-panel.ch-dialog.ch-brief-card');
  const brief = h('section.ch-screen.ch-brief', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ch-brief-title', 'data-testid': 'heist-brief' }, card);
  root.appendChild(brief);

  const close = (via: 'button' | 'key' | 'backdrop') => {
    const go = onGo;
    if (!go) return;
    onGo = null;
    brief.classList.remove('ch-on');
    root.classList.remove('ch-briefing');
    go(via);
  };
  brief.addEventListener('pointerdown', (e) => {
    if (e.target === brief) {
      e.preventDefault();
      close('backdrop');
    }
  });

  const rewindBtn = h('button.ch-btn.ch-rewind', { type: 'button', 'data-testid': 'heist-rewind', 'aria-label': 'Rewind 5 seconds' }, icon('retry'), h('span', null, 'Rewind 5 s'), h('kbd', { 'aria-hidden': 'true' }, 'R'), h('span.ch-rewind-bar', { 'aria-hidden': 'true' }, h('i')));
  root.querySelector('.ch-hud')?.appendChild(rewindBtn) ?? root.appendChild(rewindBtn);
  let onRewind: (() => boolean) | null = null;
  let rewindTimer: ReturnType<typeof setTimeout> | null = null;
  const rewind = () => {
    const fn = onRewind;
    if (!fn) return false;
    if (!fn()) return false;
    hideRewind();
    return true;
  };
  rewindBtn.addEventListener('click', () => {
    hooks.onClick?.();
    rewind();
  });

  const onKey = (e: KeyboardEvent) => {
    if (onGo && GO_KEYS.has(e.code || e.key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) close('key');
      return;
    }
    if (onRewind && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') && !e.repeat) {
      // Only swallow the key when it rewound; a refused press (paused) keeps the offer and the key.
      if (rewind()) e.preventDefault();
    }
  };
  // Capture: runs before the input controller and the UI's own Escape handler.
  window.addEventListener('keydown', onKey, true);

  function showBrief(content: BriefContent, opts: { touch: boolean; pawSrc: string; onGo(via: 'button' | 'key' | 'backdrop'): void }) {
    onGo = opts.onGo;
    const goBtn = h('button.ch-btn.ch-primary.ch-big', { type: 'button', 'data-testid': 'heist-brief-go' }, h('span', null, 'Go!'));
    goBtn.addEventListener('click', () => {
      hooks.onClick?.();
      close('button');
    });
    const keys = content.controls
      ? h(
          'div.ch-brief-keys',
          { 'aria-label': 'Controls' },
          ...(opts.touch
            ? [h('span', null, h('kbd', null, 'Stick'), 'move'), h('span', null, h('kbd', null, 'SWAP'), 'other cat'), h('span', null, h('kbd', null, 'ACT'), 'use, free'), h('span', null, h('kbd', null, 'MEOW'), 'lure')]
            : [h('span', null, h('kbd', null, 'WASD'), 'move'), h('span', null, h('kbd', null, 'Q'), 'swap cat'), h('span', null, h('kbd', null, 'E'), 'use, free'), h('span', null, h('kbd', null, 'Space'), 'meow')]),
        )
      : null;
    const only = (xs: (HTMLElement | null)[]) => xs.filter((p): p is HTMLElement => p !== null);
    // Two columns (display: contents in portrait, where CSS order stacks them as kicker, title,
    // intro, plan, controls, tips, Go!): the story on the left, the plan and Go! on the right.
    const story = h(
      'div.ch-brief-col',
      null,
      ...only([
        h('p.ch-brief-kicker', null, content.kicker),
        h('h2.ch-h2#ch-brief-title', null, content.title),
        h('p.ch-brief-intro', null, content.intro),
        keys,
        h('ul.ch-brief-tips', null, ...content.tips.map((t) => h('li', null, h('img', { src: opts.pawSrc, alt: '' }), t))),
      ]),
    );
    const plan = h(
      'div.ch-brief-col',
      null,
      h('div.ch-brief-plan', null, h('small', null, 'The plan'), h('ol', null, ...content.steps.map((s) => h('li', null, s)))),
      h('div.ch-brief-go', null, goBtn, opts.touch ? null : h('small', null, 'Enter, Space or any move key')),
    );
    card.replaceChildren(story, plan);
    card.scrollTop = 0;
    brief.classList.add('ch-on');
    root.classList.add('ch-briefing');
    goBtn.focus({ preventScroll: true });
  }

  function hideBrief() {
    onGo = null;
    brief.classList.remove('ch-on');
    root.classList.remove('ch-briefing');
  }

  function offerRewind(opts: { ms: number; expireMs?: number; onRewind(): boolean }) {
    onRewind = opts.onRewind;
    rewindBtn.style.setProperty('--ch-rewind-ms', `${opts.ms}ms`);
    rewindBtn.classList.remove('ch-on');
    void rewindBtn.offsetWidth;
    rewindBtn.classList.add('ch-on');
    if (rewindTimer) clearTimeout(rewindTimer);
    rewindTimer = null;
    if (opts.expireMs) rewindTimer = setTimeout(hideRewind, opts.expireMs);
  }

  function hideRewind() {
    onRewind = null;
    if (rewindTimer) clearTimeout(rewindTimer);
    rewindTimer = null;
    rewindBtn.classList.remove('ch-on');
  }

  return {
    get briefOpen() {
      return onGo !== null;
    },
    showBrief,
    hideBrief,
    get rewindOffered() {
      return onRewind !== null;
    },
    offerRewind,
    hideRewind,
    hideAll() {
      hideBrief();
      hideRewind();
    },
    dispose() {
      window.removeEventListener('keydown', onKey, true);
      hideRewind();
      brief.remove();
      rewindBtn.remove();
    },
  };
}
