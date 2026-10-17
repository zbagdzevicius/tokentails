/**
 * L-UI: HUD. Counter "$X raised · N cats dancing", next-cat progress paw, "Add a cat" CTA sheet
 * (free treat, wallet gift, adopt), cat card, find my cat, share sheet, shot picker, mute, DEMO
 * banner, DJ shout-outs, the drop stamp, the countries leaderboard and the debug line. SPEC.md "HUD".
 */
import '../fonts/fonts.css';
import './hud.css';
import { LINKS, MICRO } from '../config';
import type { PayoutSnapshot, RaveCat, ShotId } from '../types';
import { isArcChain } from '../arc/arcweek';
import { safeHttpsUrl, type TreatResult } from '../data';
import type { CountryBoard } from '../data/countries';
import { BADGE_ROW_MIN_WIDTH, BOARD_MAX_ROWS, boardKey, boardSummary, chipLabel, flagImg, isTied, rankLabel, type SheetKind } from './board';
import { countryName } from '../data/countries';
import { adoptLine, catCard, counterText, demoHeadline, demoLine, formatToNext, formatUsd, hookLine, plural, sourceLine } from './format';
import { pinkPawBadge } from './pinkPawBadge';

export { formatUsd };
export type { SheetKind };

export type TreatMode = 'inpage' | 'link' | 'hidden';

/** A Moon Rave cat's name and its buyer's X handle (data lane `namesForCat` / `arrivingNames`). */
export interface CatNameInfo {
  name: string | null;
  x: string | null;
  /** `https://x.com/<handle>`, built by the data lane from a re-checked handle. */
  xUrl: string | null;
  /** The buyer's country (ISO alpha-2): the flag the cat holds. Null or absent: no flag. */
  country?: string | null;
}

/** Mounts the in-page checkout into `host` (once; it stays mounted across sheet closes). */
export type CheckoutMount = (host: HTMLElement) => { destroy(): void; onOpen?(): void };

/** User-generated links (X profiles): never pass ranking, never get the opener. */
export const UGC_REL = 'noopener nofollow ugc';
/** Paid ad links: marked sponsored, never get the opener. */
export const SPONSORED_REL = 'noopener nofollow sponsored';

/** An approved ad as the sponsored card shows it (ads lane `LiveAd`). */
export interface SponsoredInfo {
  name: string;
  url: string;
  x: string | null;
  imageUrl: string | null;
  slotLabel: string;
}

/** Mounts the ad purchase sheet into `host` (once); `select` preselects a slot when it opens. */
export type AdSheetMount = (host: HTMLElement) => { destroy(): void; select(slotId: string | null): void };

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/** `<a href="https://x.com/<handle>">@handle</a>`, rebuilt from a re-checked handle; null otherwise. */
export function xHandleLink(handle: string | null | undefined): HTMLAnchorElement | null {
  if (!handle || !X_HANDLE_RE.test(handle)) return null;
  const a = document.createElement('a');
  a.href = `https://x.com/${handle}`;
  a.target = '_blank';
  a.rel = UGC_REL;
  a.className = 'rv-x-link';
  a.textContent = `@${handle}`;
  return a;
}

export interface HudHandlers {
  embed: boolean;
  og?: boolean;
  muted: boolean;
  coarse: boolean;
  onMute(): boolean;
  onShareLink(): Promise<string>;
  onSavePicture(): Promise<string>;
  onFind(query: string): { ok: boolean; message: string };
  onShot(shot: ShotId | 'auto'): void;
  shotState(): { shot: ShotId; auto: boolean };
  onTreat(): Promise<TreatResult>;
  onCardClosed(): void;
  /** A sheet opened or closed (main pauses keyboard shortcuts while one is open). */
  onSheet?(open: boolean): void;
  /** Name + X of a Moon Rave cat (null for every other cat). */
  nameFor?(cat: RaveCat): CatNameInfo | null;
}

/** A tapped cat's pinned card closes itself after this. */
export const CARD_AUTO_CLOSE_MS = 6_000;

export interface Hud {
  setSnapshot(snapshot: PayoutSnapshot): void;
  /**
   * DJ shout-out toast ("Cat #10 just landed! Thanks to a wallet gift on Arc"). The link goes after
   * the text, then `after` ("Shout-out to " + "@handle" + "!"). Links get rel="noopener nofollow ugc".
   */
  shout(text: string, link?: { href: string; label: string; after?: string }): void;
  /** New cats landed: the "N cats dancing" line bounces with a "+N" chip. */
  celebrateCats(n: number): void;
  /**
   * `place: 'top'` pins the card just below the top bar (the cat it describes is in the lower half).
   * A pinned card closes itself after `autoCloseMs` (default CARD_AUTO_CLOSE_MS; 0 = never).
   */
  showCat(cat: RaveCat | null, opts?: { mode?: 'hover' | 'pin'; x?: number; y?: number; siblings?: number; place?: 'top' | 'bottom'; autoCloseMs?: number }): void;
  /** A Moon Rave cat still confirming (hologram): its name, buyer's X, and status. */
  showArriving(info: (CatNameInfo & { status: string }) | null, opts?: { mode?: 'hover' | 'pin'; x?: number; y?: number; place?: 'top' | 'bottom' }): void;
  /**
   * In-page checkout (GET /rave/status said enabled): Add a cat opens it instead of today's sheet.
   * null keeps today's sheet.
   */
  setCheckout(mount: CheckoutMount | null): void;
  /** Ad space on sale: the "Advertise here" button opens this sheet; null hides it. */
  setAdSheet(mount: AdSheetMount | null): void;
  /** Opens the ad sheet, with `slotId` preselected when given and free. */
  openAds(slotId?: string | null): void;
  /** The approved ad's card: "Sponsored by X", its image and a sponsored link (new tab). */
  showSponsored(info: SponsoredInfo | null, opts?: { x?: number; y?: number; place?: 'top' | 'bottom' }): void;
  /** The HUD's "Sponsors" strip (ads lane element). */
  mountSponsors(el: HTMLElement): void;
  /** The Arc week badge, under the tool buttons. */
  mountBadge(el: HTMLElement): void;
  /** The arrivals list ("Just joined"), shown above the Add-a-cat button. */
  mountArrivals(el: HTMLElement): void;
  /** Max cats this device draws; above it the HUD says "+N more dancing off-screen". */
  setCapacity(n: number): void;
  setMuted(muted: boolean): void;
  /** "Tap for sound" pill until audio unlocks. */
  setSoundPrompt(visible: boolean): void;
  /** Optimistic micro-USD on its way (a treat sent from this page, not yet indexed). */
  setPending(micro: number): void;
  setTreatMode(mode: TreatMode): void;
  /** Big meme stamp across the screen on drops. */
  stamp(text: string): void;
  hint(text: string): void;
  setDebug(text: string | null): void;
  /**
   * The countries leaderboard (data lane `orders.countries()`): the 🌍 tool button shows how many
   * countries took part and opens the board. null = no rave orders known (the button stays, the board says so).
   */
  setCountries(board: CountryBoard | null): void;
  openSheet(kind: SheetKind): void;
  closeSheet(): void;
  readonly sheetOpen: boolean;
  dispose(): void;
}

const ICONS = {
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  find: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

const pawSvg = (fill: string, stroke: string) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="${fill}" stroke="${stroke}" stroke-width="2.5">` +
  '<ellipse cx="32" cy="45" rx="15" ry="12.5"/><ellipse cx="13.5" cy="30" rx="6" ry="7.2"/><ellipse cx="24.5" cy="17.5" rx="6" ry="7.5"/>' +
  '<ellipse cx="39.5" cy="17.5" rx="6" ry="7.5"/><ellipse cx="50.5" cy="30" rx="6" ry="7.2"/></g></svg>';

const SHOT_LABEL: Record<ShotId, [string, string]> = {
  hero: ['Hero', 'the moon view'],
  top: ['Vortex', 'top down'],
  pov: ['In the crowd', 'paws up'],
  dj: ['DJ', 'close up'],
  orbit: ['Orbit', 'around the booth'],
  sweep: ['Sweep', 'through the lasers'],
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The dollar counter's count-up (ms); shout-outs about new money wait for it to finish. */
export const COUNT_UP_MS = 1200;

export function createHud(root: HTMLElement, h: HudHandlers): Hud {
  root.removeAttribute('aria-live');
  root.classList.toggle('rv-embed', h.embed);
  root.classList.toggle('rv-og', !!h.og);
  root.innerHTML = '';

  // ------------------------------------------------------------------ top
  const top = el('div', 'rv-top');
  const counter = el('section', 'rv-counter');
  counter.setAttribute('aria-label', 'Raised for the Pink Paw shelter');
  const demo = el('div', 'rv-demo');
  demo.hidden = true;
  const amountRow = el('div', 'rv-amount');
  const num = el('span', 'rv-num rv-display', '$0.00');
  const lbl = el('span', 'rv-lbl rv-display', 'raised');
  amountRow.append(num, lbl);
  const cats = el('div', 'rv-cats rv-display', '…');
  const live = el('div');
  live.className = 'rv-sr';
  live.setAttribute('aria-live', 'polite');
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
  const hook = el('div', 'rv-hook');
  const next = el('div', 'rv-next');
  const paw = el('div', 'rv-paw');
  const pawBg = el('div', '', pawSvg('rgba(255,79,158,0.12)', 'rgba(255,209,230,0.85)'));
  const pawFill = el('div', 'rv-paw-fill', pawSvg('#ff4f9e', '#ffd1e6'));
  pawBg.style.cssText = pawFill.style.cssText = 'position:absolute;inset:0';
  paw.append(pawBg, pawFill);
  const nextText = el('span');
  next.append(paw, nextText);
  const source = el('a', 'rv-source') as HTMLAnchorElement;
  source.href = LINKS.payouts;
  source.target = '_blank';
  source.rel = 'noopener';
  const dot = el('span', 'rv-dot');
  const sourceText = el('span');
  source.append(dot, sourceText);
  const more = el('div', 'rv-more');
  more.hidden = true;
  // The countries chip (the leaderboard button) sits on the source line: no extra row in the stats
  // block, nothing more in the tool column (both sit next to moon-ring ad slots on phones).
  const sourceRow = el('div', 'rv-source-row');
  const boardBtn = el('button', 'rv-board-btn rv-board-chip') as HTMLButtonElement;
  boardBtn.type = 'button';
  const boardIco = el('span', 'rv-board-ico');
  boardIco.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>';
  const boardText = el('span', '', 'Countries');
  boardBtn.append(boardIco, boardText);
  boardBtn.setAttribute('aria-label', 'Countries leaderboard');
  boardBtn.title = 'Countries leaderboard';
  sourceRow.append(source, boardBtn);
  counter.append(demo, amountRow, cats, hook, next, sourceRow, more, live);

  const tools = el('nav', 'rv-tools');
  tools.setAttribute('aria-label', 'Rave controls');
  const iconBtn = (label: string, svg: string) => {
    const b = el('button', 'rv-icon', svg);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  };
  const muteBtn = iconBtn('Mute', ICONS.sound);
  const shareBtn = iconBtn('Share', ICONS.share);
  const findBtn = iconBtn('Find my cat', ICONS.find);
  const shotBtn = iconBtn('Camera shots', ICONS.camera);
  tools.append(muteBtn, shareBtn, findBtn, shotBtn);
  const side = el('div', 'rv-side');
  side.append(tools);
  top.append(counter, side);


  // ------------------------------------------------------------------ middle
  const shoutBox = el('div', 'rv-shout');
  shoutBox.setAttribute('role', 'status');
  /** Shout-outs never cover the Arc badge (no text on top of the logo): they start below it when it is in their column. */
  const placeShout = () => {
    let min = 0;
    // Only the wide-desktop badge carries the logo; the pill is text and sits in the stats block.
    if (badgeNode && badgeNode.isConnected && !badgeNode.hidden && !phoneMq?.matches) {
      const r = badgeNode.getBoundingClientRect();
      const half = Math.min(window.innerWidth * 0.88, 520) / 2;
      const mid = window.innerWidth / 2;
      if (r.height > 0 && r.bottom < window.innerHeight * 0.5 && r.left < mid + half && r.right > mid - half) min = r.bottom + 16;
    }
    shoutBox.style.setProperty('--rv-shout-min', `${Math.round(min)}px`);
  };
  const stampEl = el('div', 'rv-stamp rv-display');
  stampEl.setAttribute('aria-hidden', 'true');

  // ------------------------------------------------------------------ bottom
  const bottom = el('div', 'rv-bottom');
  const hintEl = el('div', 'rv-hint');
  const soundBtn = el('button', 'rv-sound', '🔊 Tap for sound');
  soundBtn.type = 'button';
  soundBtn.hidden = true;
  const ctaRow = el('div', 'rv-cta-row');
  const cta = el('button', 'rv-cta rv-display', 'Add a cat 🐾');
  cta.type = 'button';
  cta.setAttribute('aria-label', 'Add a cat: every dollar for the shelter adds one dancing cat');
  const advertise = el('button', 'rv-advertise', '📣 Advertise');
  advertise.type = 'button';
  advertise.setAttribute('aria-label', 'Advertise here: buy an ad slot in the Moon Rave');
  advertise.hidden = true;
  ctaRow.append(cta, advertise);
  const arrivalsSlot = el('div', 'rv-arrivals');
  arrivalsSlot.hidden = true;
  const sponsorsSlot = el('div', 'rv-sponsors-slot');
  bottom.append(arrivalsSlot, hintEl, soundBtn, sponsorsSlot, ctaRow);

  // The Arc week badge: on wide desktops (>= 1180 px) in the bottom-right corner above the hint (fixed,
  // arc/arc.css); below that a one-line 32 px pill at the end of the top-left stats block (text only,
  // arc/badge.ts). The top band is where the hero shot puts the moon-ring ad slots and the world's
  // Token Tails logo, and the bottom centre keeps Add a cat and the arrivals list clear.
  let badgeNode: HTMLElement | null = null;
  const phoneMq = typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${BADGE_ROW_MIN_WIDTH - 1}px)`) : null;
  const placeBadge = () => {
    if (!badgeNode) return;
    if (phoneMq?.matches) {
      if (badgeNode.parentElement !== counter || badgeNode.nextSibling !== live) counter.insertBefore(badgeNode, live);
    } else if (badgeNode.parentElement !== root) root.append(badgeNode);
  };
  phoneMq?.addEventListener?.('change', placeBadge);

  // ------------------------------------------------------------------ card
  const card = el('div', 'rv-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Cat details');
  const cardX = el('button', 'rv-x', '×');
  cardX.type = 'button';
  cardX.setAttribute('aria-label', 'Close');
  const cardBody = el('div');
  card.append(cardX, cardBody);

  // ------------------------------------------------------------------ sheet
  const backdrop = el('div', 'rv-backdrop');
  const sheet = el('div', 'rv-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const sheetX = el('button', 'rv-x', '×');
  sheetX.type = 'button';
  sheetX.setAttribute('aria-label', 'Close');
  const sheetBody = el('div');
  // The checkout lives in its own host so the Stripe iframe is never detached (that would reload it).
  const checkoutHost = el('div', 'rv-checkout-host');
  checkoutHost.hidden = true;
  const adsHost = el('div', 'rv-checkout-host rv-ads-host');
  adsHost.hidden = true;
  sheet.append(sheetX, sheetBody, checkoutHost, adsHost);

  const debug = el('div', 'rv-debug');
  debug.hidden = true;

  root.append(top, shoutBox, stampEl, bottom, card, backdrop, sheet, debug);

  // ------------------------------------------------------------------ state
  let snap: PayoutSnapshot | null = null;
  let capacity = Infinity;
  let pending = 0;
  let treatMode: TreatMode = 'link';
  let shownMicro = 0;
  let tween = 0;
  let sheetKind: string | null = null;
  let lastFocus: HTMLElement | null = null;
  let hintTimer = 0;
  let cardTimer = 0;
  let cardMs = 0;
  let checkoutMount: CheckoutMount | null = null;
  let checkout: { destroy(): void; onOpen?(): void } | null = null;
  let adMount: AdSheetMount | null = null;
  let adSheet: ReturnType<AdSheetMount> | null = null;
  let adSelect: string | null = null;
  let board: CountryBoard | null = null;

  const bump = (e: HTMLElement) => {
    e.classList.remove('rv-bump');
    void e.offsetWidth;
    e.classList.add('rv-bump');
  };

  const animateAmount = (to: number) => {
    cancelAnimationFrame(tween);
    const fromV = shownMicro;
    if (fromV === to || fromV === 0) {
      shownMicro = to;
      num.textContent = formatUsd(to);
      return;
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_UP_MS);
      const e = 1 - Math.pow(1 - k, 3);
      shownMicro = Math.round(fromV + (to - fromV) * e);
      num.textContent = formatUsd(shownMicro);
      if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
    bump(num);
  };

  const renderNext = () => {
    if (!snap) return;
    const realNext = snap.realCats + 1;
    const micro = Math.max(0, snap.microToNext - pending);
    const progress = Math.min(1, snap.progressToNext + pending / MICRO);
    pawFill.style.clipPath = `inset(${((1 - progress) * 100).toFixed(1)}% 0 0 0)`;
    nextText.innerHTML =
      micro <= 0
        ? `cat #${realNext} is on its way <span class="rv-pending">✦</span>`
        : `${formatToNext(micro)} to cat #${realNext.toLocaleString('en-US')}` + (pending ? ' <span class="rv-pending">· treat on its way</span>' : '');
    paw.setAttribute('aria-label', `${Math.round(progress * 100)}% of the next cat`);
  };

  const renderMore = () => {
    if (!snap) return;
    // Demo mode says "(2,500 drawn)" in its banner instead; "+N more" is for real crowds only.
    const extra = snap.demo ? 0 : snap.cats - capacity;
    more.hidden = !(extra > 0);
    if (extra > 0) more.textContent = `+${extra.toLocaleString('en-US')} more dancing off-screen`;
  };

  // ------------------------------------------------------------------ sheets
  const openSheet = (kind: SheetKind) => {
    if (h.embed) return;
    if (kind === 'ads' && !adMount) return;
    // One .rv-sheet serves every kind: start each at the top, or a sheet scrolled earlier hides the
    // next one's title and close button.
    sheet.scrollTop = 0;
    lastFocus = document.activeElement as HTMLElement | null;
    sheetKind = kind;
    sheetBody.innerHTML = '';
    sheetBody.classList.remove('rv-board-sheet');
    const inPage = kind === 'add' && !!checkoutMount;
    const ads = kind === 'ads';
    sheetBody.hidden = inPage || ads;
    checkoutHost.hidden = !inPage;
    adsHost.hidden = !ads;
    sheet.classList.toggle('rv-sheet-checkout', inPage || ads);
    if (ads) {
      if (!adSheet) adSheet = adMount!(adsHost);
      adSheet.select(adSelect);
      adSelect = null;
    } else if (inPage) {
      if (checkout) checkout.onOpen?.();
      else {
        try {
          checkout = checkoutMount!(checkoutHost);
        } catch (err) {
          console.warn('[rave] checkout failed to mount; today\'s sheet instead', err);
          checkoutMount = null;
          sheetBody.hidden = false;
          checkoutHost.hidden = true;
          sheet.classList.remove('rv-sheet-checkout');
          buildAdd();
        }
      }
    } else if (kind === 'add') buildAdd();
    else if (kind === 'find') buildFind();
    else if (kind === 'share') buildShare();
    else if (kind === 'countries') buildCountries();
    else buildShots();
    sheet.scrollTop = 0; // again, after the new content replaced the old
    sheet.classList.add('rv-on');
    backdrop.classList.add('rv-on');
    root.classList.add('rv-has-sheet');
    h.onSheet?.(true);
    const focusRoot = ads ? adsHost : inPage && checkout ? checkoutHost : sheetBody;
    requestAnimationFrame(() => (focusRoot.querySelector<HTMLElement>('h2[tabindex], input, button, a') ?? sheetX).focus({ preventScroll: true }));
  };
  const closeSheet = () => {
    if (!sheetKind) return;
    sheetKind = null;
    sheet.classList.remove('rv-on');
    backdrop.classList.remove('rv-on');
    root.classList.remove('rv-has-sheet');
    h.onSheet?.(false);
    lastFocus?.focus?.({ preventScroll: true });
  };

  const opt = (tag: 'a' | 'button', o: { ico: string; title: string; sub: string; go: string; primary?: boolean; href?: string }) => {
    const e = el(tag, `rv-opt${o.primary ? ' rv-primary' : ''}`) as HTMLAnchorElement & HTMLButtonElement;
    e.innerHTML = `<span class="rv-o-ico" aria-hidden="true">${o.ico}</span><span><b>${esc(o.title)}</b><small>${esc(o.sub)}</small></span><span class="rv-o-go" aria-hidden="true">${o.go}</span>`;
    if (tag === 'a') {
      e.href = o.href!;
      e.target = '_blank';
      e.rel = 'noopener';
    } else e.type = 'button';
    return e;
  };

  /**
   * Add a cat. The strongest option first: $1 from a wallet is a whole cat of your own. The free
   * treat is honest about its size (+1¢ toward the next cat). Off tokentails.com the treat and the
   * wallet gift live on the same give page, so it is one link, not two that look different.
   */
  function buildAdd() {
    const n = snap?.realCats ?? 0;
    const nextNo = (n + 1).toLocaleString('en-US');
    sheetBody.append(
      el('h2', 'rv-display', 'Add a cat 🐾'),
      pinkPawBadge('rave'),
      el('p', '', `Every $1 paid out to the Pink Paw shelter on-chain adds one dancing cat. ${n ? `${plural(n, 'cat is', 'cats are')} on the floor.` : 'The floor is empty.'} ${snap ? `${formatToNext(Math.max(0, snap.microToNext - pending))} to cat #${nextNo}.` : ''}`),
    );
    const msg = el('div', 'rv-msg');
    msg.setAttribute('aria-live', 'polite');
    const walletSub =
      treatMode === 'link'
        ? 'USDC or EURC from your wallet, no gas. $5 = 5 cats. The free daily treat is on the same page.'
        : 'USDC or EURC from your wallet, no gas. $5 = 5 cats.';
    sheetBody.append(opt('a', { ico: '💸', title: '$1 = your own cat', sub: walletSub, go: '↗', primary: true, href: LINKS.give }));
    if (treatMode === 'inpage') {
      const b = opt('button', { ico: '🍬', title: 'Send a free treat', sub: `+1¢ toward cat #${nextNo}. Token Tails pays it, once a day, no sign-in.`, go: 'Send' });
      b.addEventListener('click', async () => {
        b.disabled = true;
        msg.className = 'rv-msg';
        msg.textContent = 'Sending your treat…';
        const r = await h.onTreat();
        if (r.ok) {
          msg.className = 'rv-msg rv-ok';
          const href = safeHttpsUrl(r.explorerUrl);
          msg.innerHTML = `Treat sent! ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">View tx ↗</a>` : ''} It reaches the floor in ~2 min.`;
        } else {
          b.disabled = false;
          msg.className = 'rv-msg rv-err';
          msg.textContent = r.message || 'Something went wrong.';
        }
      });
      sheetBody.append(b);
    }
    sheetBody.append(
      msg,
      opt('a', { ico: '🐈', title: 'Adopt a $5 shelter cat', sub: adoptLine(snap?.microToNext ?? MICRO), go: '↗', href: LINKS.adopt }),
      el('p', 'rv-land', 'Your cat lands here in ~2 min. Keep this tab open, or paste your tx in Find my cat 🔍 later.'),
    );
    const foot = el('div', 'rv-foot');
    foot.innerHTML = `<span>Counts come from public on-chain payouts.</span><a href="${LINKS.payouts}" target="_blank" rel="noopener">Every payout ↗</a>`;
    sheetBody.append(foot);
  }

  function buildFind() {
    sheetBody.append(el('h2', 'rv-display', 'Find my cat'), el('p', '', 'Paste the tx hash of your payout, or a cat number like #7.'));
    const form = el('form', 'rv-field');
    const input = el('input');
    input.type = 'text';
    input.placeholder = '0x… or #7';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Tx hash or cat number');
    input.setAttribute('autocapitalize', 'off');
    const go = el('button', 'rv-btn', 'Find');
    go.type = 'submit';
    form.append(input, go);
    const msg = el('div', 'rv-msg');
    msg.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = h.onFind(input.value);
      msg.className = `rv-msg ${r.ok ? 'rv-ok' : 'rv-err'}`;
      msg.textContent = r.message;
      if (r.ok) setTimeout(closeSheet, 350);
    });
    sheetBody.append(form, msg);
  }

  function buildShare() {
    sheetBody.append(el('h2', 'rv-display', 'Share the rave'), el('p', '', 'Every share is another chance at a cat.'));
    const msg = el('div', 'rv-msg');
    msg.setAttribute('aria-live', 'polite');
    const link = opt('button', { ico: '🔗', title: 'Share the link', sub: 'Copies it, or opens your share menu on a phone.', go: '→', primary: true });
    link.addEventListener('click', async () => {
      msg.className = 'rv-msg rv-ok';
      msg.textContent = await h.onShareLink();
    });
    const pic = opt('button', { ico: '📸', title: 'Save a picture', sub: 'This exact moment, with the counter on it.', go: '→' });
    pic.addEventListener('click', async () => {
      pic.disabled = true;
      msg.className = 'rv-msg';
      msg.textContent = 'Snapping…';
      msg.textContent = await h.onSavePicture();
      pic.disabled = false;
    });
    sheetBody.append(link, pic, msg);
  }

  function buildShots() {
    const state = h.shotState();
    sheetBody.append(el('h2', 'rv-display', 'Camera'), el('p', '', 'Drag to orbit, pinch or scroll to zoom. Auto cuts on the beat.'));
    const grid = el('div', 'rv-shots');
    const add = (id: ShotId | 'auto', title: string, sub: string, pressed: boolean) => {
      const b = el('button', '', `${esc(title)}<small>${esc(sub)}</small>`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', () => {
        h.onShot(id);
        closeSheet();
      });
      grid.append(b);
    };
    add('auto', 'Auto', 'cuts on the beat', state.auto);
    (Object.keys(SHOT_LABEL) as ShotId[]).forEach((id, i) => add(id, SHOT_LABEL[id][0], h.coarse ? SHOT_LABEL[id][1] : `${SHOT_LABEL[id][1]} · ${i + 1}`, !state.auto && state.shot === id));
    sheetBody.append(grid);
    if (!h.coarse) sheetBody.append(el('div', 'rv-kbd', 'Keys: hold Space = build · Enter = drop · 1–6 shots · A auto · M mute · F find'));
  }

  /** Countries leaderboard: which countries joined the rave and how many cats each. */
  function buildCountries() {
    sheetBody.classList.add('rv-board-sheet');
    const title = el('h2', 'rv-display', 'Countries at the rave 🌍');
    const sum = el('p', 'rv-board-sum');
    sum.textContent = boardSummary(board);
    sheetBody.append(title, sum);
    const rows = board?.rows ?? [];
    if (!rows.length) {
      const empty = el('p', 'rv-board-empty');
      empty.textContent = 'Add a cat and your country goes on the board. Your cats dance holding its flag.';
      const go = el('button', 'rv-btn rv-board-go', 'Add a cat 🐾');
      go.type = 'button';
      go.addEventListener('click', () => openSheet('add'));
      sheetBody.append(empty, go);
      return;
    }
    const max = Math.max(1, rows[0].cats);
    const shownRows = rows.slice(0, BOARD_MAX_ROWS);
    const list = el('ol', 'rv-board');
    list.setAttribute('aria-label', 'Cats per country');
    shownRows.forEach((r, i) => {
      const tied = isTied(shownRows, i);
      const li = el('li', `rv-board-row${r.rank <= 3 && !tied ? ' rv-board-top' : ''}`);
      const rank = el('span', 'rv-board-rank');
      rank.textContent = rankLabel(r.rank, tied);
      // A painted flag (same designs as the crowd's), not emoji: Windows shows emoji flags as letters.
      const flag = el('span', 'rv-board-flag');
      const img = flagImg(r.code);
      if (img) flag.append(img);
      else flag.textContent = r.code;
      flag.setAttribute('aria-hidden', 'true');
      const name = el('span', 'rv-board-name');
      name.textContent = r.name || r.code;
      const bar = el('span', 'rv-board-bar');
      bar.style.setProperty('--w', `${Math.max(4, Math.round((r.cats / max) * 100))}%`);
      bar.setAttribute('aria-hidden', 'true');
      const n = el('span', 'rv-board-n');
      n.append(document.createTextNode(r.cats.toLocaleString('en-US')), el('small', '', r.cats === 1 ? 'cat' : 'cats'));
      li.setAttribute('aria-label', `${r.rank}. ${r.name || r.code}: ${plural(r.cats, 'cat', 'cats')}`);
      li.append(rank, flag, name, n, bar);
      list.append(li);
    });
    sheetBody.append(list);
    const extra = rows.length - BOARD_MAX_ROWS;
    if (extra > 0) sheetBody.append(el('p', 'rv-board-more', `+${plural(extra, 'more country', 'more countries')}`));
    const unknown = board?.unknownCats ?? 0;
    const foot = el('p', 'rv-board-foot');
    foot.textContent = `Each cat holds its buyer's flag, from the country we see at checkout (or the one you pick).${unknown ? ` ${plural(unknown, 'cat has', 'cats have')} no country yet.` : ''}`;
    sheetBody.append(foot);
  }

  // ------------------------------------------------------------------ events
  cta.addEventListener('click', () => openSheet('add'));
  advertise.addEventListener('click', () => openSheet('ads'));
  shareBtn.addEventListener('click', () => openSheet('share'));
  findBtn.addEventListener('click', () => openSheet('find'));
  shotBtn.addEventListener('click', () => openSheet('shots'));
  boardBtn.addEventListener('click', () => openSheet('countries'));
  muteBtn.addEventListener('click', () => setMuted(h.onMute()));
  soundBtn.addEventListener('click', () => {
    if (h.muted) setMuted(h.onMute());
    soundBtn.hidden = true;
  });
  backdrop.addEventListener('click', closeSheet);
  sheetX.addEventListener('click', closeSheet);
  cardX.addEventListener('click', () => {
    hideCard();
    h.onCardClosed();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (sheetKind) closeSheet();
      else if (card.classList.contains('rv-on')) {
        hideCard();
        h.onCardClosed();
      }
    }
  };
  window.addEventListener('keydown', onKey);

  function setMuted(m: boolean) {
    h.muted = m;
    muteBtn.innerHTML = m ? ICONS.muted : ICONS.sound;
    muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
    muteBtn.title = m ? 'Unmute (M)' : 'Mute (M)';
    muteBtn.setAttribute('aria-pressed', String(m));
  }
  setMuted(h.muted);

  function hideCard() {
    clearTimeout(cardTimer);
    card.classList.remove('rv-on');
  }
  /** A pinned card closes itself after `cardMs` (paused while the pointer is over it). */
  const armCardTimer = () => {
    clearTimeout(cardTimer);
    if (!cardMs || !card.classList.contains('rv-pin')) return;
    cardTimer = window.setTimeout(() => {
      if (!card.classList.contains('rv-on')) return;
      hideCard();
      h.onCardClosed();
    }, cardMs);
  };
  card.addEventListener('pointerenter', () => clearTimeout(cardTimer));
  card.addEventListener('pointerleave', armCardTimer);

  function nameLine(prefix: string | null, x: string | null, country?: string | null): HTMLElement {
    const line = el('div', 'rv-c-who');
    if (prefix) line.append(document.createTextNode(prefix));
    const link = xHandleLink(x);
    if (link) line.append(document.createTextNode(prefix ? ' · from ' : 'From '), link);
    const place = countryName(country);
    if (place) {
      const span = el('span', 'rv-c-country');
      const img = flagImg(country, 'rv-flag rv-flag-inline');
      if (img) span.append(img, document.createTextNode(' '));
      span.append(document.createTextNode(place));
      line.append(document.createTextNode(link ? ' in ' : prefix ? ' · from ' : 'From '), span);
    }
    return line;
  }
  function placeCard(o: { mode?: 'hover' | 'pin'; x?: number; y?: number; place?: 'top' | 'bottom'; autoCloseMs?: number }) {
    const hover = o.mode === 'hover';
    card.classList.toggle('rv-hover', hover);
    card.classList.toggle('rv-pin', !hover);
    card.classList.toggle('rv-below-top', !hover && o.place === 'top');
    // The first-run hint sits where the pinned card goes: hide it while a card is open.
    if (!hover) {
      clearTimeout(hintTimer);
      hintEl.classList.remove('rv-on');
    }
    cardX.hidden = hover;
    if (hover && o.x !== undefined && o.y !== undefined) {
      // Real width (320 px + padding; hidden cards keep their layout), so it never runs off the right edge.
      const w = card.offsetWidth || 352;
      const x = Math.min(window.innerWidth - w - 12, Math.max(12, o.x + 18));
      const y = Math.min(window.innerHeight - 170, Math.max(12, o.y - 40));
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      card.style.bottom = 'auto';
    } else if (!hover && o.place === 'top') {
      // Never over the counter or the tool buttons: just below the whole top bar.
      card.style.left = card.style.bottom = '';
      card.style.top = `${Math.round(top.getBoundingClientRect().bottom + 8)}px`;
    } else {
      card.style.left = card.style.top = card.style.bottom = '';
    }
    card.classList.add('rv-on');
    cardMs = hover ? 0 : (o.autoCloseMs ?? CARD_AUTO_CLOSE_MS);
    armCardTimer();
  }

  return {
    setSnapshot(s) {
      const prev = snap;
      snap = s;
      const t = counterText(s);
      if (s.demo) {
        // Demo crowd: the big line is the demo count, marked; the real total is the small line.
        const d = demoHeadline(s);
        cancelAnimationFrame(tween);
        shownMicro = 0;
        num.textContent = d.headline;
        lbl.textContent = d.tag;
        cats.textContent = d.real;
        cats.classList.add('rv-cats-real');
        hook.textContent = hookLine(s.cats);
      } else {
        animateAmount(s.totalUsdMicro);
        lbl.textContent = 'raised';
        cats.classList.remove('rv-cats-real');
        if (prev && s.realCats !== prev.realCats) bump(cats);
        cats.textContent = t.cats;
        hook.textContent = hookLine(s.realCats);
      }
      demo.hidden = !s.demo;
      // The demo number appears only here, labelled; the counter above is always the real count.
      if (s.demo) demo.textContent = demoLine(s, capacity) ?? '';
      sourceText.textContent = sourceLine(s);
      dot.className = `rv-dot${s.origin === 'snapshot' || s.fetchFailed ? ' rv-dot-snap' : s.stale ? ' rv-dot-stale' : ''}`;
      if (prev && s.totalUsdMicro > prev.totalUsdMicro) {
        paw.classList.remove('rv-sparkle');
        void paw.offsetWidth;
        paw.classList.add('rv-sparkle');
      }
      renderNext();
      renderMore();
      live.textContent = `${t.amount} raised, ${t.cats}.`;
    },
    celebrateCats(n) {
      if (snap?.demo || n <= 0) return;
      cats.classList.remove('rv-bump', 'rv-land');
      void cats.offsetWidth;
      cats.classList.add('rv-land');
      const chip = el('span', 'rv-plus', `+${n.toLocaleString('en-US')}`);
      chip.setAttribute('aria-hidden', 'true');
      cats.append(chip);
      setTimeout(() => chip.remove(), 2700);
    },
    shout(text, link) {
      const item = el('div', 'rv-shout-item rv-display');
      item.textContent = text;
      const href = link ? safeHttpsUrl(link.href) : null;
      if (link && href) {
        const a = el('a') as HTMLAnchorElement;
        a.href = href;
        a.target = '_blank';
        a.rel = UGC_REL;
        a.textContent = link.label;
        item.append(document.createTextNode(' '), a);
        if (link.after) item.append(document.createTextNode(link.after));
      }
      placeShout();
      shoutBox.replaceChildren(item);
      setTimeout(() => item.remove(), 3700);
    },
    showCat(cat, o = {}) {
      if (!cat) {
        hideCard();
        return;
      }
      const arc = !!cat.payout && isArcChain(cat.payout.chainId);
      card.classList.toggle('rv-c-arc', arc);
      const t = catCard(cat, o.siblings ?? 1);
      t.href = safeHttpsUrl(t.href);
      cardBody.innerHTML =
        `<h3 class="rv-display">${esc(t.title)}</h3><div class="rv-c-amount">${esc(t.amount)}</div><div class="rv-c-meta">${esc(t.meta)}</div>` +
        t.extra.map((x) => `<div class="rv-c-extra">${esc(x)}</div>`).join('') +
        (t.href ? `<a class="rv-c-link" href="${esc(t.href)}" target="_blank" rel="noopener">View tx ↗</a>` : '');
      // A Moon Rave cat: its name is the title (text only), the number moves under it, plus the buyer's X.
      let named: CatNameInfo | null = null;
      try {
        named = h.nameFor?.(cat) ?? null;
      } catch {
        named = null;
      }
      if (named?.name || named?.x || named?.country) {
        const h3 = cardBody.querySelector('h3')!;
        if (named.name) {
          h3.textContent = named.name;
          h3.classList.add('rv-c-named');
        }
        cardBody.insertBefore(nameLine(named.name ? t.title : null, named.x, named.country), h3.nextSibling);
      }
      if (arc) {
        const line = el('div', 'rv-c-arcline');
        line.textContent = 'paid on Arc';
        cardBody.append(line);
      }
      placeCard(o);
    },
    showArriving(info, o = {}) {
      if (!info) {
        hideCard();
        return;
      }
      card.classList.remove('rv-c-arc');
      const h3 = el('h3', 'rv-display rv-c-named');
      h3.textContent = info.name ?? 'A new cat';
      const amount = el('div', 'rv-c-amount');
      amount.textContent = 'Confirming the payment…';
      const meta = el('div', 'rv-c-meta');
      meta.textContent = 'Starts dancing the moment the payment is confirmed.';
      cardBody.replaceChildren(h3, nameLine('Moon Rave cat', info.x, info.country), amount, meta);
      placeCard(o);
    },
    setAdSheet(mount) {
      if (mount === adMount) return;
      adSheet?.destroy();
      adSheet = null;
      adMount = mount;
      advertise.hidden = !mount || h.embed;
      if (!mount && sheetKind === 'ads') closeSheet();
    },
    openAds(slotId) {
      if (!adMount) return;
      adSelect = slotId ?? null;
      if (sheetKind === 'ads' && adSheet) {
        adSheet.select(adSelect);
        adSelect = null;
        return;
      }
      if (sheetKind) closeSheet();
      openSheet('ads');
    },
    showSponsored(info, o = {}) {
      if (!info) {
        hideCard();
        return;
      }
      card.classList.remove('rv-c-arc');
      const tag = el('span', 'rv-sponsored-tag', 'Sponsored');
      const h3 = el('h3', 'rv-display rv-c-named');
      h3.textContent = `Sponsored by ${info.name}`;
      const meta = el('div', 'rv-c-meta');
      meta.textContent = `${info.slotLabel} · ads are reviewed by Token Tails`;
      const parts: HTMLElement[] = [tag, h3];
      const who = nameLine(null, info.x);
      if (who.childNodes.length) parts.push(who);
      const img = safeHttpsUrl(info.imageUrl);
      if (img) {
        const pic = el('img', 'rv-sponsored-img') as HTMLImageElement;
        pic.alt = '';
        pic.src = img;
        parts.push(pic);
      }
      parts.push(meta);
      const href = safeHttpsUrl(info.url);
      if (href) {
        const a = el('a', 'rv-c-link') as HTMLAnchorElement;
        a.href = href;
        a.target = '_blank';
        a.rel = SPONSORED_REL;
        try {
          a.textContent = `Visit ${new URL(href).hostname.replace(/^www\./, '')} ↗`;
        } catch {
          a.textContent = 'Visit ↗';
        }
        parts.push(a);
      }
      cardBody.replaceChildren(...parts);
      placeCard({ mode: 'pin', place: o.place, autoCloseMs: 10_000 });
    },
    mountSponsors(node) {
      sponsorsSlot.replaceChildren(node);
    },
    mountBadge(node) {
      badgeNode = node;
      placeBadge();
    },
    setCheckout(mount) {
      if (mount === checkoutMount) return;
      checkout?.destroy();
      checkout = null;
      checkoutMount = mount;
    },
    mountArrivals(node) {
      arrivalsSlot.replaceChildren(node);
      arrivalsSlot.hidden = false;
    },
    setCapacity(n) {
      capacity = n;
      if (snap?.demo) demo.textContent = demoLine(snap, capacity) ?? '';
      renderMore();
    },
    setMuted,
    setSoundPrompt(v) {
      soundBtn.hidden = !v || h.embed;
    },
    setPending(micro) {
      pending = micro;
      renderNext();
    },
    setTreatMode(m) {
      treatMode = m;
    },
    stamp(text) {
      stampEl.textContent = text;
      stampEl.classList.remove('rv-on');
      void stampEl.offsetWidth;
      stampEl.classList.add('rv-on');
    },
    hint(text) {
      hintEl.textContent = text;
      hintEl.classList.add('rv-on');
      clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => hintEl.classList.remove('rv-on'), 6500);
    },
    setDebug(text) {
      debug.hidden = text === null;
      if (text !== null) debug.textContent = text;
    },
    setCountries(b) {
      const prevKey = boardKey(board);
      board = b;
      const n = b?.countries ?? 0;
      boardText.textContent = `${b?.demo && n ? 'DEMO · ' : ''}${chipLabel(b)}`;
      const label = n > 0 ? `Countries leaderboard: ${plural(n, 'country', 'countries')}` : 'Countries leaderboard';
      boardBtn.setAttribute('aria-label', label);
      boardBtn.title = label;
      // Live update while the board is open (keeps its scroll position).
      if (sheetKind === 'countries' && boardKey(b) !== prevKey) {
        const y = sheet.scrollTop;
        sheetBody.replaceChildren();
        buildCountries();
        sheet.scrollTop = y;
      }
    },
    openSheet,
    closeSheet,
    get sheetOpen() {
      return sheetKind !== null;
    },
    dispose() {
      cancelAnimationFrame(tween);
      window.removeEventListener('keydown', onKey);
      root.innerHTML = '';
    },
  };
}
