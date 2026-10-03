/**
 * "Sent to shelters": the in-game shelter payouts modal (a DOM overlay like Pause and Results).
 *
 * It reads ShelterSplit's payout events with the same read-only RPC code as the win-screen total
 * (payouts.ts: public/payouts/deployments.json, then eth_getLogs per chain) and shows the total, a
 * row per deployment, the latest payouts, the showcase shelter and the give button. It opens from
 * the title, the pause menu and the win screen, and on load with `?payouts` or `#payouts`.
 *
 * Styled after the tokentails.com landing: the hero sky, Passion One headlines with the gold glow,
 * cream-rimmed cards on night, the gold pill.
 *
 * Keyboard: Escape closes it (and never reaches the game, so it cannot resume a paused run), Tab
 * stays inside it, and focus goes back to the button that opened it.
 */
// copy-lint: web-only the modal and its entry points render only on web hosts (ui.ts checks isWebHost), never in app builds
import { FACTS } from '../facts.generated';
import { h } from './dom';
import { HEIST_BODY_FONT } from './fonts.generated';
import { icon } from './icons';
import { formatAmount, loadShelterPayouts, type ChainRow, type PayoutRow, type ShelterPayouts } from './payouts';

/** `?payouts` (any value but 0) or `#payouts` on the page URL opens the modal on load. */
export function wantsPayoutsDeepLink(loc: { search?: string; hash?: string } | undefined): boolean {
  if (!loc) return false;
  try {
    const q = new URLSearchParams(loc.search ?? '');
    if (q.has('payouts') && q.get('payouts') !== '0' && q.get('payouts') !== 'false') return true;
  } catch {
    /* bad query: ignore */
  }
  return /^#payouts$/i.test(loc.hash ?? '');
}

/** "12.5 USDC + 1 EURC", or '' when nothing has been paid yet. */
export function amountsText(totals: Map<string, bigint>): string {
  return [...totals].filter(([, v]) => v > 0n).map(([s, v]) => formatAmount(v, s)).join(' + ');
}

export const shortAddress = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** "just now", "5 min ago", "3 h ago", "2 d ago", then a date ("2 Oct 2026"). */
export function timeAgo(unixSec: number, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.round(nowMs / 1000 - unixSec));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  const d = new Date(unixSec * 1000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The showcase shelter (client/public/shelter-payouts/campaign.json). */
const SHELTER_NAME = 'Pink Paw (Rožinė pėdutė)';
const LATEST = 8;

export interface PayoutsModalOptions {
  /** Deployment list (DEPLOYMENTS_URL). */
  deploymentsUrl: string;
  /** Asset base (ASSET_BASE): the hero sky, the display face and the brand images live under it. */
  base: string;
  /** The full payouts page, linked small in the footer; '' hides the link. */
  payoutsUrl?: string;
  /** The give button (or the rail's "Opens soon" badge) for the shelter card; null shows none. */
  giveCta?: () => HTMLElement | null;
  /** The rail's small print under the shelter goal (railCopy().line), cited at the call site. */
  railLine?: () => string;
  /** The heart image for the shelter card (the manifest's brand heart). */
  heartSrc?: string;
  /** Data source. Default loadShelterPayouts (cached per page load). */
  load?: (deploymentsUrl: string) => Promise<ShelterPayouts>;
  onClick?(): void;
  onOpen?(): void;
  onClose?(): void;
  now?: () => number;
}

export interface PayoutsModal {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  /** Open it (focus moves in) and read the chain; resolves once the data is painted. */
  show(): Promise<void>;
  hide(): void;
  /** Repaint the shelter card (the rail state changed: the give link or its badge). */
  refreshShelter(): void;
  dispose(): void;
}

const STYLE_ID = 'ch-pay-styles';
const DISPLAY = "'Passion One', 'Cat Paw', ui-rounded, system-ui, sans-serif";
const GLOW = '0 0 5px #ffe89a, 0 0 12px #ffcf66, 0 0 25px #ffb84d';

function css(base: string): string {
  return /* copy-lint-ignore R2 a stylesheet, not visible copy */ `
@font-face { font-family: 'Passion One'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}fonts/passion-one-latin-700-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: 'Passion One'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}fonts/passion-one-latin-ext-700-normal.woff2') format('woff2');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
.ch-ui { --tt-night: #0b0820; --tt-night-950: #07051a; --tt-night-700: #1e1633; --tt-night-600: #2a1f45; --tt-night-500: #3a2d5c;
  --tt-gold: #ffcc55; --tt-cream: #fcecbb; --tt-lilac: #f0c5fd; --tt-muted: #9a88c9; --tt-pink: #ff7aa2; --tt-mint: #7fd66b; }
.ch-pay { z-index: 40; align-items: center; justify-content: center; user-select: text; -webkit-user-select: text;
  padding: calc(var(--ch-sat) + 10px) calc(var(--ch-sar) + 10px) calc(var(--ch-sab) + 10px) calc(var(--ch-sal) + 10px);
  background: radial-gradient(ellipse at 50% 40%, rgba(30,22,51,.55), rgba(7,5,26,.9) 75%); }
.ch-pay.ch-on { animation: ch-screen-in .22s ease-out both; }
.ch-pay-card { position: relative; width: min(800px, 100%); max-height: 100%; display: flex; flex-direction: column; overflow: hidden; outline: none;
  border: 4px solid var(--tt-cream); border-radius: 22px; background: var(--tt-night); color: var(--tt-cream);
  box-shadow: 0 0 0 3px var(--tt-night-950), 0 8px 0 var(--tt-night-950), 0 26px 60px rgba(0,0,0,.6), 0 0 28px rgba(255,204,85,.22);
  animation: ch-dialog-in .4s var(--ch-ease-pop) both; }
.ch-pay-scroll { overflow-y: auto; overscroll-behavior: contain; min-height: 0; flex: 1 1 auto; -webkit-overflow-scrolling: touch; }
.ch-pay-hero { position: relative; text-align: center; padding: 18px 56px 22px; overflow: hidden;
  background: #1a1030 url('${base}images/payouts-hero.webp') center 70% / cover no-repeat; image-rendering: pixelated; }
.ch-pay-hero::before { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(11,8,32,.35) 0%, rgba(11,8,32,.1) 40%, rgba(11,8,32,.55) 75%, var(--tt-night) 100%); }
.ch-pay-hero > * { position: relative; }
.ch-pay-close { position: absolute; top: 10px; right: 10px; width: 44px; height: 44px; min-width: 44px; min-height: 44px; font-size: 18px; z-index: 2; }
.ch-pay-title:focus { outline: none; }
.ch-pay-pill, .ch-pay-open { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; border: 1px solid rgba(255,204,85,.55); background: rgba(11,8,32,.72);
  padding: 6px 14px; font-family: ${DISPLAY}; font-weight: 700; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: var(--tt-gold);
  box-shadow: 0 0 18px rgba(255,204,85,.25); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
.ch-pay-pill i, .ch-pay-open i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--tt-gold); box-shadow: 0 0 8px var(--tt-gold); }
.ch-pay-title { margin: 10px 0 2px; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .01em;
  font-size: clamp(30px, 5vw + 12px, 54px); line-height: .92; color: #fff; text-shadow: 0 3px 0 var(--tt-night-950), 0 8px 22px rgba(0,0,0,.65); }
.ch-pay-total { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; min-height: 96px; justify-content: center; }
.ch-pay-amount { font-family: ${DISPLAY}; font-weight: 700; font-size: clamp(46px, 9vw + 18px, 104px); line-height: .9; color: var(--tt-cream); text-shadow: ${GLOW}; text-wrap: balance; }
.ch-pay-amount.ch-soon { font-size: clamp(28px, 4vw + 14px, 46px); line-height: 1; }
.ch-pay-amount.ch-pay-err { color: var(--tt-lilac); text-shadow: 0 3px 0 var(--tt-night-950), 0 6px 16px rgba(0,0,0,.6); }
.ch-pay-caption { margin: 0; max-width: 34em; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; font-size: clamp(14px, 1vw + 11px, 19px); color: rgba(252,236,187,.92); text-shadow: 0 2px 6px rgba(0,0,0,.7); }
.ch-pay-note { margin: 0; max-width: 32em; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 14px; line-height: 1.35; color: var(--tt-lilac); letter-spacing: 0; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
.ch-pay-skel { display: inline-block; width: 4.2em; height: .85em; border-radius: 14px; font-size: clamp(46px, 9vw + 18px, 104px);
  background: linear-gradient(90deg, rgba(252,236,187,.1) 0%, rgba(252,236,187,.32) 50%, rgba(252,236,187,.1) 100%); background-size: 200% 100%; animation: ch-pay-shimmer 1.2s linear infinite; }
@keyframes ch-pay-shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.ch-pay-retry { min-height: 44px; padding: 8px 18px; font-size: 18px; margin-top: 4px; }
.ch-pay-body { padding: 4px 14px 16px; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.ch-pay-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ch-pay-side { order: -1; }
.ch-pay-box { border-radius: 16px; border: 3px solid rgba(252,236,187,.6); background: rgba(0,0,0,.35); padding: 12px 14px; }
.ch-pay-box h3 { margin: 0 0 4px; font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 19px; color: var(--tt-gold); }
.ch-pay-list { list-style: none; margin: 0; padding: 0; }
.ch-pay-list li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid rgba(154,136,201,.28); }
.ch-pay-list li:first-child { border-top: 0; }
.ch-pay-badge { flex: none; display: inline-block; vertical-align: 1px; margin-right: 6px; white-space: nowrap; padding: 2px 7px; border-radius: 999px; background: var(--tt-night-600); border: 1px solid var(--tt-night-500);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--tt-lilac); }
.ch-pay-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ch-pay-main b { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.25; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 15px; color: var(--tt-cream); letter-spacing: 0; }
.ch-pay-main small, .ch-pay-main a { font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 12px; color: var(--tt-muted); letter-spacing: 0; }
.ch-pay-ui a { color: var(--tt-lilac); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; pointer-events: auto; }
.ch-pay-ui a:hover, .ch-pay-ui a:focus-visible { color: var(--tt-cream); }
.ch-pay-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; }
.ch-pay-amt { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.ch-pay-amt b { font-family: ${DISPLAY}; font-weight: 700; font-size: 21px; line-height: 1; color: var(--tt-gold); letter-spacing: .01em; white-space: nowrap; }
.ch-pay-amt small, .ch-pay-amt a { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 12px; letter-spacing: 0; }
.ch-pay-amt small { color: var(--tt-muted); }
.ch-pay-amt .ch-pay-down { color: #ee642a; }
.ch-pay-empty { margin: 6px 0 2px; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 14px; line-height: 1.4; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pay-steps { margin: 6px 0 0; padding: 0; list-style: none; counter-reset: ch-pay; display: flex; flex-direction: column; gap: 8px; }
.ch-pay-steps li { counter-increment: ch-pay; position: relative; padding-left: 34px; font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 14px; line-height: 1.35; color: var(--tt-cream); letter-spacing: 0; }
.ch-pay-steps li::before { content: counter(ch-pay); position: absolute; left: 0; top: -1px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
  font-family: ${DISPLAY}; font-weight: 700; font-size: 15px; color: #4a1d08; background: var(--tt-gold); box-shadow: 0 0 10px rgba(255,204,85,.45); }
.ch-pay-shelter { position: relative; border-color: rgba(255,122,162,.8); background: linear-gradient(180deg, rgba(255,122,162,.24), rgba(255,122,162,.07) 70%), rgba(0,0,0,.35); text-align: left; }
.ch-pay-shelter .ch-pay-kicker { margin: 0; font-family: ${DISPLAY}; font-weight: 700; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--tt-pink); }
.ch-pay-shelter h3 { display: flex; align-items: center; gap: 8px; margin: 2px 0 6px; font-size: 24px; line-height: 1; letter-spacing: .02em; color: var(--tt-cream); text-shadow: 0 2px 0 var(--tt-night-950); }
.ch-pay-shelter h3 img { width: 26px; height: 26px; object-fit: contain; flex: none; filter: drop-shadow(0 2px 0 var(--tt-night-950)); }
.ch-pay-goal { margin: 0; font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 15px; color: var(--tt-gold); letter-spacing: 0; }
.ch-pay-shelter p.ch-pay-small { margin: 6px 0 0; font-family: ${HEIST_BODY_FONT}; font-weight: 600; font-size: 13px; line-height: 1.4; color: var(--tt-lilac); letter-spacing: 0; }
.ch-pay-cta { margin-top: 12px; display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.ch-pay .ch-give { display: flex; align-items: center; justify-content: center; min-height: 50px; padding: 12px 16px; border: 3px solid var(--ch-ol); border-radius: 14px; background: var(--tt-pink); color: var(--ch-ol);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 16px; letter-spacing: 0; text-decoration: none; text-align: center; text-wrap: balance; box-shadow: 0 4px 0 var(--ch-ol), inset 0 2px 0 rgba(255,255,255,.45); pointer-events: auto; }
.ch-pay .ch-give:hover, .ch-pay .ch-give:focus-visible { background: #ffb3cf; color: var(--ch-ol); transform: translateY(-1px); }
.ch-pay .ch-give:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--ch-ol); }
.ch-pay .ch-rail-chip { align-self: flex-start; display: inline-block; padding: 4px 10px; border: 1px dashed var(--tt-lilac); border-radius: 6px; color: var(--tt-lilac);
  font-family: ${HEIST_BODY_FONT}; font-weight: 800; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.ch-pay-foot { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 2px; }
.ch-pay-foot .ch-btn { width: min(360px, 100%); }
.ch-pay-foot a { font-family: ${HEIST_BODY_FONT}; font-weight: 700; font-size: 13px; letter-spacing: 0; }
/* Entry points: the gold pill on the title (the landing's HeistPill), a plain button elsewhere. */
.ch-pay-open { align-self: center; min-height: 44px; cursor: pointer; pointer-events: auto; transition: background .15s ease, color .15s ease, transform .1s ease; }
.ch-pay-open:hover, .ch-pay-open:focus-visible { background: rgba(11,8,32,.92); color: var(--tt-cream); }
.ch-pay-open:active { transform: translateY(2px); }
.ch-pay-open img { width: 18px; height: 18px; object-fit: contain; }
.ch-rescue .ch-pay-open-sm { display: flex; width: fit-content; margin-top: 8px; min-height: 40px; padding: 6px 14px; font-size: 12px; align-self: flex-start; }
@media (min-width: 720px) {
  .ch-pay-hero { padding: 22px 64px 26px; }
  .ch-pay-body { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); padding: 4px 22px 20px; align-items: start; gap: 16px; }
  .ch-pay-side { order: 0; }
  .ch-pay-foot { grid-column: 1 / -1; flex-direction: row-reverse; justify-content: space-between; }
  .ch-pay-foot .ch-btn { width: auto; min-width: 260px; }
}
@media (max-height: 560px) and (min-width: 600px) {
  .ch-pay-hero { padding: 10px 60px 12px; }
  .ch-pay-title { font-size: 30px; margin-top: 6px; }
  .ch-pay-total { min-height: 0; }
  .ch-pay-amount { font-size: 54px; }
}
@media (prefers-reduced-motion: reduce) { .ch-pay-skel { animation: none; } }
`;
}

function ensureStyles(base: string): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css(base);
  document.head.appendChild(el);
}

const ext = (href: string, text: string, attrs: Record<string, string> = {}) =>
  h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, text);

export function createPayoutsModal(root: HTMLElement, opts: PayoutsModalOptions): PayoutsModal {
  ensureStyles(opts.base);
  const load = opts.load ?? loadShelterPayouts;
  const now = opts.now ?? (() => Date.now());
  let open = false;
  let opener: HTMLElement | null = null;
  let run = 0;

  const close = h('button.ch-btn.ch-icon.ch-ghost.ch-pay-close', { type: 'button', 'aria-label': 'Close', 'data-testid': 'payouts-close' }, icon('close'));
  close.addEventListener('click', () => {
    opts.onClick?.();
    hide();
  });
  // claim: L-disbursed (the modal shows the live on-chain payouts)
  const title = h('h2.ch-pay-title#ch-pay-title', { tabindex: '-1' }, 'Sent to shelters');
  const total = h('div.ch-pay-total', { 'aria-live': 'polite', 'data-testid': 'payouts-total' });
  const hero = h(
    'header.ch-pay-hero',
    null,
    h('p.ch-pay-pill', { style: 'margin:0' }, h('i', { 'aria-hidden': 'true' }), 'Public, on-chain'),
    title,
    total,
  );
  const lists = h('div.ch-pay-col');
  const side = h('div.ch-pay-col.ch-pay-side');
  const back = h('button.ch-btn.ch-primary', { type: 'button', 'data-testid': 'payouts-back' }, h('span', null, 'Back to the heist'));
  back.addEventListener('click', () => {
    opts.onClick?.();
    hide();
  });
  const fullPage = opts.payoutsUrl ? ext(opts.payoutsUrl, 'Open the full payouts page ↗', { 'data-testid': 'payouts-full-page' }) : null;
  const body = h('div.ch-pay-body', null, lists, side, h('div.ch-pay-foot', null, back, fullPage));
  // One scroller for the hero and the lists (the hero scrolls away on a phone); Close stays put.
  const scroller = h('div.ch-pay-scroll', null, hero, body);
  const card = h('div.ch-pay-card', null, close, scroller);
  const el = h(
    'section.ch-screen.ch-modal.ch-pay.ch-pay-ui',
    { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ch-pay-title', 'data-testid': 'payouts-modal' },
    card,
  );
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) {
      e.preventDefault();
      hide();
    }
  });
  root.appendChild(el);

  function shelterCard(): HTMLElement {
    const goal = FACTS['C-001'];
    const cta = opts.giveCta?.() ?? null;
    const line = opts.railLine?.() ?? '';
    return h(
      'section.ch-pay-box.ch-pay-shelter',
      { 'data-testid': 'payouts-shelter' },
      h('p.ch-pay-kicker', null, 'Showcase shelter'),
      h('h3', null, h('img', { src: opts.heartSrc ?? `${opts.base}images/heart.webp`, alt: '' }), SHELTER_NAME),
      // claim: C-001 (the campaign goal, wording from the facts registry)
      h('p.ch-pay-goal', { 'data-claim': 'C-001' }, goal.display),
      // claim: C-004, L-rail (the rail line from railCopy)
      line ? h('p.ch-pay-small', { 'data-claim': 'L-rail' }, line) : null,
      h('p.ch-pay-small', null, "Token Tails holds this shelter's wallet on its behalf until handover. Every payout is listed here."),
      cta ? h('div.ch-pay-cta', null, cta) : null,
    );
  }

  function paintLoading() {
    total.setAttribute('aria-busy', 'true');
    total.replaceChildren(h('span.ch-pay-skel', { 'aria-hidden': 'true' }), h('p.ch-pay-note', null, 'Reading the chain…'));
    lists.replaceChildren(h('section.ch-pay-box', null, h('h3', null, 'Latest payouts'), h('p.ch-pay-empty', null, 'Loading the latest payouts…')));
  }

  function payoutItem(p: PayoutRow): HTMLElement {
    const label = p.memo || (p.shelter ? `To ${shortAddress(p.shelter)}` : 'Payout');
    const when = p.time !== undefined ? timeAgo(p.time, now()) : p.block ? `block ${p.block.toLocaleString('en-US')}` : '';
    return h(
      'li',
      { 'data-testid': 'payout-row' },
      h('span.ch-pay-main', null, h('b', { title: label }, label), h('small', null, h('span.ch-pay-badge', null, p.chainName), when)),
      h(
        'span.ch-pay-amt',
        null,
        h('b', null, formatAmount(p.amount18, p.symbol)),
        p.tx && p.explorer ? ext(`${p.explorer}/tx/${p.tx}`, 'View tx ↗', { 'aria-label': `View transaction on ${p.chainName}` }) : null,
      ),
    );
  }

  function chainItem(c: ChainRow): HTMLElement {
    const amount = amountsText(c.totals);
    return h(
      'li',
      { 'data-testid': 'chain-row' },
      h(
        'span.ch-pay-main',
        null,
        h('b', null, c.name),
        c.explorer ? ext(`${c.explorer}/address/${c.address}`, shortAddress(c.address), { class: 'ch-pay-mono', 'aria-label': `Contract ${c.address} on ${c.name}` }) : h('small.ch-pay-mono', null, shortAddress(c.address)),
      ),
      h(
        'span.ch-pay-amt',
        null,
        !c.ok ? h('small.ch-pay-down', null, 'Could not read') : amount ? h('b', null, amount) : h('small', null, 'No payouts yet'),
        c.ok && c.count ? h('small', null, `${c.count} payout${c.count === 1 ? '' : 's'}`) : null,
      ),
    );
  }

  function howItWorks(): HTMLElement {
    return h(
      'section.ch-pay-box',
      { 'data-testid': 'payouts-how' },
      h('h3', null, 'How it works'),
      h(
        'ol.ch-pay-steps',
        null,
        // claim:fiction the first step is the in-game rescue, no money moves in the game itself
        h('li', null, 'Free the shelter cat in a heist.'),
        // claim: C-004, L-rail (the treat is Token Tails' own, and only while the rail is open)
        h('li', null, 'Tap the rescue treat and Token Tails sends Pink Paw a small treat.'),
        // claim: L-disbursed (every payout is a public chain event, listed here)
        h('li', null, 'Every payout shows up right here, with a link to check it on the chain.'),
      ),
    );
  }

  function paint(data: ShelterPayouts) {
    total.removeAttribute('aria-busy');
    const amount = amountsText(data.totals);
    if (data.status === 'error') {
      const retry = h('button.ch-btn.ch-ghost.ch-pay-retry', { type: 'button', 'data-testid': 'payouts-retry' }, h('span', null, 'Try again'));
      retry.addEventListener('click', () => {
        opts.onClick?.();
        // The button is about to be replaced: keep focus inside the dialog.
        title.focus({ preventScroll: true });
        void refresh();
      });
      total.replaceChildren(
        h('b.ch-pay-amount.ch-soon.ch-pay-err', null, "Can't reach the chain"),
        h('p.ch-pay-note', null, "We couldn't read the payouts just now. Check your connection and try again."),
        retry,
      );
    } else if (amount) {
      total.replaceChildren(
        h('b.ch-pay-amount', { 'data-testid': 'payouts-amount' }, amount),
        // claim: L-disbursed (the live on-chain total; "Token Tails has sent {amount} to shelters")
        h('p.ch-pay-caption', { 'data-claim': 'L-disbursed' }, 'Token Tails has sent this to shelters so far'),
      );
    } else {
      total.replaceChildren(
        h('b.ch-pay-amount.ch-soon', { 'data-testid': 'payouts-soon' }, 'First payouts land soon'),
        // claim: L-disbursed (future tense: nothing has been paid out yet)
        h('p.ch-pay-note', null, 'Each one will show up here the moment it happens, with a link to check it on the chain.'),
      );
    }

    const sections: HTMLElement[] = [];
    if (data.payouts.length) {
      sections.push(h('section.ch-pay-box', { 'data-testid': 'payouts-latest' }, h('h3', null, 'Latest payouts'), h('ul.ch-pay-list', null, ...data.payouts.slice(0, LATEST).map(payoutItem))));
    }
    if (data.chains.length) {
      sections.push(h('section.ch-pay-box', { 'data-testid': 'payouts-chains' }, h('h3', null, 'Where it goes'), h('ul.ch-pay-list', null, ...data.chains.map(chainItem))));
    }
    if (!data.payouts.length && data.status !== 'error') sections.unshift(howItWorks());
    if (!sections.length) sections.push(howItWorks());
    lists.replaceChildren(...sections);
    el.dataset.state = data.status === 'ok' && !amount ? 'empty' : data.status;
  }

  async function refresh(): Promise<void> {
    const mine = ++run;
    paintLoading();
    el.dataset.state = 'loading';
    const attempt = async (): Promise<ShelterPayouts> => {
      try {
        return await load(opts.deploymentsUrl);
      } catch {
        return { status: 'error', totals: new Map(), chains: [], payouts: [] };
      }
    };
    // One quiet retry before showing the error (a slow first load at boot can time out).
    let data = await attempt();
    if (data.status === 'error' && mine === run) data = await attempt();
    if (mine !== run) return;
    paint(data);
  }

  const focusables = () =>
    Array.from(card.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter((n) => !n.closest('[hidden]'));

  // Capture on window: runs before the input controller (Escape = pause/resume) and the UI's own
  // Escape handler, so no key reaches the game while the modal is open.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) hide();
      return;
    }
    e.stopImmediatePropagation();
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && card.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (open) e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  function show(): Promise<void> {
    if (!open) {
      open = true;
      const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      opener = active && active !== document.body ? active : null;
      side.replaceChildren(shelterCard());
      el.classList.add('ch-on');
      scroller.scrollTop = 0;
      // The heading takes focus (the dialog is announced by name); Tab moves on from there.
      title.focus({ preventScroll: true });
      opts.onOpen?.();
    }
    return refresh();
  }

  function hide() {
    if (!open) return;
    open = false;
    run++;
    el.classList.remove('ch-on');
    const back = opener;
    opener = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    opts.onClose?.();
  }

  return {
    el,
    get isOpen() {
      return open;
    },
    show,
    hide,
    refreshShelter() {
      if (open) side.replaceChildren(shelterCard());
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      el.remove();
    },
  };
}
