/**
 * DOM overlay UI: Title, Cat pick, HUD, Pause, Results, Cat Yard bar, Loading, toasts.
 *
 *   const ui = createUI(document.getElementById('app')!, {
 *     manifest, input,
 *     handlers: { onStart: (ids) => startRun(ids), onYard, onResume, onRetry, onMenu, onPause, onMuteChange },
 *   });
 *   ui.showTitle();
 *   // run start:  ui.showHUD(level, catIds)
 *   // every tick: ui.handleEvents(state.events, state)   (toasts, flashes, counter bumps)
 *   // every frame: ui.updateHUD(state)
 *   // pause:      ui.showPause() / ui.hidePause()
 *   // finish:     ui.showResults(result, level)
 *
 * The UI owns no game state. Navigation between Title and Cat pick is internal; everything that
 * affects the game goes out through `handlers`.
 */
import { TESTNET_DEPLOYMENTS_URL, giveHref, shelterTotalLine } from './payouts';
import { ASSET_BASE, DEPLOYMENTS_URL, GIVE_URL, PAYOUTS_URL, TICK_HZ, type AssetManifest, type LevelDef, type RunResult, type SheetEntry, type SimEvent, type SimState } from '../types';
import { formatTime, h, hashHex, isCoarsePointer, prefersReducedMotion, safeStorageGet, safeStorageSet, setText } from './dom';
import type { InputController } from './input';
import { hudHintText, objectiveText, pawRating, scoreBreakdown } from './logic';
import { partnerCatchAhead, partnerDanger } from '../sim/telegraph';
import { catAtExit, plateIndexAt } from '../sim/sim';
import { createPortrait } from './portraits';
import { icon } from './icons';
import { ensureStyles } from './styles';
import { createDiorama, type Diorama } from '../render/diorama';
import { createTouchControls, type TouchControls } from './touch';
import { BAKED_RAIL, heistRuntimeConfig, isWebHost, mergeRail, railCopy, watchRail, type RailInfo } from './rail';
import { createFtueOverlay, type FtueOverlay } from './ftue';
import { createPayoutsModal, type PayoutsModal } from './shelter-payouts';
import type { ShelterPayouts } from './payouts';

export type ScreenName = 'none' | 'title' | 'pick' | 'hud' | 'yard' | 'results';

export interface UIHandlers {
  /** Cat pick confirmed: start a heist with these two breed ids. */
  onStart(catIds: [string, string]): void;
  /** Title -> Cat Yard. */
  onYard?(): void;
  /** Leave the Cat Yard (back to title). The UI shows the title itself afterwards. */
  onYardBack?(): void;
  /** HUD pause button or Escape while the HUD is shown (the app decides; call showPause()). */
  onPause?(): void;
  onResume?(): void;
  onRetry?(): void;
  /** Back to the title from Pause or Results. The UI shows the title itself afterwards. */
  onMenu?(): void;
  onMuteChange?(muted: boolean): void;
  /** First pointer/key interaction with the UI (unlock WebAudio here). */
  onUserGesture?(): void;
  /** Any button click (for a UI click sound). */
  onClick?(): void;
  /** The objective chip was tapped (or H pressed) during a heist: toggle the ghost-paw route. */
  onObjectiveTap?(): void;
}

/** Route hint state shown on the objective chip: off, on, or on for the other cat (swap first). */
export type RouteChipState = 'off' | 'on' | 'swap';

export interface UIOptions {
  manifest: AssetManifest;
  handlers: UIHandlers;
  /** Input controller: HUD crew tap -> swap, touch controls feed it. */
  input?: InputController;
  /** Asset base URL. Default ASSET_BASE. */
  base?: string;
  /** Preselected pair on the cat pick screen (else the last pick, else two defaults). */
  defaultCats?: [string, string];
  muted?: boolean;
  /** Force touch controls on/off; default auto (coarse pointer or touch input). */
  touch?: boolean;
  /** Full shelter payouts page, linked small from the payouts modal. Default PAYOUTS_URL; '' hides the link. */
  payoutsUrl?: string;
  /** Payouts modal data source (tests, the UI bench). Default: read the chain (payouts.ts). */
  loadPayouts?: (deploymentsUrl: string) => Promise<ShelterPayouts>;
  /** Deployment list for the win screen's on-chain "sent to shelters" total. Default DEPLOYMENTS_URL; '' hides it. */
  deploymentsUrl?: string;
  /** Testnet list for the payouts modal's "Testnet proof" section. Default TESTNET_DEPLOYMENTS_URL; '' hides it. */
  testnetDeploymentsUrl?: string;
  /** Testnet proof data source (tests, the UI bench). Default: read the testnets; none when `loadPayouts` is set. */
  loadTestnetPayouts?: (testnetUrl: string) => Promise<ShelterPayouts>;
  /** Give page behind the win screen's "rescue treat" button. Default GIVE_URL; '' hides the button. */
  giveUrl?: string;
  /**
   * Treat rail state (plan G11). Default: start from the baked facts (pre-launch) and load the live
   * state at boot (src/ui/rail.ts). Pass a state to fix it (tests, the UI bench), or `false` to
   * skip the network and keep the baked state.
   */
  rail?: RailInfo | false;
  /**
   * Embedded in the `/heist` host page (plan G2 layer 1). `onExit` adds a "Token Tails" back button
   * to the title; `onSignIn` adds "Sign in to keep your stars" to the results while signed out.
   */
  embed?: { onExit?(): void; onSignIn?(): void };
}

export interface UI {
  readonly root: HTMLElement;
  readonly screen: ScreenName;
  readonly paused: boolean;
  showTitle(): void;
  showCatPick(): void;
  /** Show the in-game HUD for a run. */
  showHUD(level: LevelDef, catIds: [string, string]): void;
  /** Cheap per-frame refresh (only touches changed text). */
  updateHUD(state: SimState): void;
  /** Per-tick event feedback: toasts, spotted flash, counter bumps. */
  handleEvents(events: readonly SimEvent[], state?: SimState): void;
  showPause(): void;
  hidePause(): void;
  showResults(result: RunResult, level?: LevelDef): void;
  /** Cat Yard overlay (title + back + mute); the yard draws its own name card. */
  showYard(catCount?: number): void;
  hideAll(): void;
  setLoading(text: string | null): void;
  toast(text: string, kind?: 'good' | 'bad' | 'info'): void;
  setMuted(muted: boolean): void;
  /** Embed: whether the host has an account (or guest) session; hides the results sign-in button. */
  setSignedIn(signedIn: boolean): void;
  /** Currently chosen pair on the cat pick screen. */
  getPickedCats(): [string, string];
  /** First-run overlays: the level brief and the rewind offer (plan G10). */
  readonly ftue: FtueOverlay;
  /** Mark the objective chip while the ghost-paw route is on. */
  setRoute(state: RouteChipState): void;
  /**
   * The "Sent to shelters" modal (web hosts with a deployment list only; a no-op elsewhere). It
   * opens over the current screen; a running heist is paused first.
   */
  showPayouts(): void;
  hidePayouts(): void;
  readonly payoutsOpen: boolean;
  readonly touch: TouchControls | null;
  dispose(): void;
}

const PICK_KEY = 'catnip-heist.pick';
const DEFAULT_PAIR: [string, string] = ['bob', 'oreo'];

/** Restart a one-shot CSS animation class on an element. */
function restartAnim(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const tweens = new WeakMap<Element, number>();
/** Count an element's number from `from` to `to` over `ms` (ease-out). Instant under reduced motion. */
function tweenCount(el: Element, from: number, to: number, fmt: (v: number) => string, ms: number, onDone?: () => void): void {
  const prev = tweens.get(el);
  if (prev) cancelAnimationFrame(prev);
  if (ms <= 0 || from === to || prefersReducedMotion()) {
    setText(el, fmt(to));
    onDone?.();
    return;
  }
  const t0 = performance.now();
  const stepFn = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    setText(el, fmt(Math.round(from + (to - from) * e)));
    if (k < 1) tweens.set(el, requestAnimationFrame(stepFn));
    else {
      tweens.delete(el);
      onDone?.();
    }
  };
  tweens.set(el, requestAnimationFrame(stepFn));
}

export function createUI(parent: HTMLElement, opts: UIOptions): UI {
  const base = opts.base ?? ASSET_BASE;
  const payoutsUrl = opts.payoutsUrl ?? PAYOUTS_URL;
  const deploymentsUrl = opts.deploymentsUrl ?? DEPLOYMENTS_URL;
  const giveUrl = opts.giveUrl ?? GIVE_URL;
  // Treat rail state: the baked fallback first, then the live status when it arrives.
  const web = isWebHost(typeof window === 'undefined' ? undefined : (window as never));
  let rail: RailInfo = opts.rail || (typeof window === 'undefined' ? BAKED_RAIL : { ...BAKED_RAIL, pending: true });
  const footText = h('span', null, railCopy(rail, web).foot);
  // The win screen's rail line and give link, while it shows (set by showResults).
  let resultsRailPaint: (() => void) | null = null;
  const paintRail = () => {
    setText(footText, railCopy(rail, web).foot);
    payoutsModal?.refreshShelter();
    resultsRailPaint?.();
  };
  if (opts.rail === undefined) {
    // The first paint comes within 3 s; a slow status (slow phones, the game loading at the same
    // time) still arrives later and flips every surface to the live rail. A live status seen once
    // is never replaced by the pre-launch fallback (mergeRail).
    void watchRail(heistRuntimeConfig(window as never, document), (info) => {
      const next = mergeRail(rail, info);
      if (next === rail) return;
      rail = next;
      paintRail();
    });
  }
  // The one-tap "rescue treat" for the showcase shelter (the give page does the rest).
  const giveButton = (catName: string) => {
    // `?chain=<id>` on the game's own URL (the /heist host forwards it) preselects the treat network.
    const href = giveHref(giveUrl, catName, new URLSearchParams(window.location.search).get('chain'));
    if (!href) return null;
    const a = h('a.ch-give', { href, target: '_blank', rel: 'noopener', 'data-testid': 'give-treat' }, 'Send Pink Paw a rescue treat 🐾');
    a.addEventListener('click', () => handlers.onClick?.());
    return a;
  };
  // Read-only on-chain total under the rescue line; stays empty (hidden) until it resolves. Web host
  // only: the line names coins and the chain, which app builds never show (claims rule R10).
  const shelterTotal = () => {
    if (!web) return null;
    const el = h('span.ch-payouts-total', { 'data-testid': 'shelter-total' });
    void shelterTotalLine(deploymentsUrl).then((text) => { el.textContent = text; });
    return el;
  };
  ensureStyles(base);
  const { manifest, handlers, input } = opts;
  const cats = manifest.cats;
  const byId = new Map<string, SheetEntry>(cats.map((c) => [c.id, c]));
  const img = (k: keyof AssetManifest['images']) => base + manifest.images[k];
  const reduced = prefersReducedMotion();

  const root = h('div.ch-ui', { role: 'application', 'aria-label': 'Catnip Heist' });
  if (reduced) root.classList.add('ch-reduced');
  parent.appendChild(root);
  const live = h('div.ch-sr', { 'aria-live': 'polite' });
  root.appendChild(live);
  // Live 3D diorama behind the title and pick screens (its own renderer, paused elsewhere).
  const dioramaHost = h('div.ch-diorama', { 'aria-hidden': 'true' });
  root.prepend(dioramaHost);
  let diorama: Diorama | null = null;
  // Held (no frames) while the payouts modal covers it: without a GPU each frame holds the main
  // thread for seconds, so a `?payouts` link painted its rows ~5 s after they arrived. It (re)starts
  // when the modal closes; a deep link opens the modal before the first frame, so none is drawn.
  let dioramaHeld = false;
  function syncDiorama(name: ScreenName) {
    const want = name === 'title' || name === 'pick';
    dioramaHost.classList.toggle('ch-on', want);
    if (dioramaHeld) {
      diorama?.stop();
      return;
    }
    if (want && !diorama) {
      try {
        diorama = createDiorama(dioramaHost, { base, catIds: picked.length === 2 ? [picked[0], picked[1]] : DEFAULT_PAIR });
      } catch (e) {
        console.warn('[ui] title diorama unavailable', e);
      }
    }
    if (want) diorama?.start();
    else diorama?.stop();
  }

  let screen: ScreenName = 'none';
  let paused = false;
  let muted = !!opts.muted;
  let gestured = false;

  const gesture = () => {
    if (gestured) return;
    gestured = true;
    handlers.onUserGesture?.();
  };
  root.addEventListener('pointerdown', gesture, { capture: true });
  const onKeyGesture = () => gesture();
  window.addEventListener('keydown', onKeyGesture, { once: true });

  const button = (cls: string, label: string | Node, onClick: () => void, attrs: Record<string, string> = {}) => {
    const b = h(`button.ch-btn${cls}`, { type: 'button', ...attrs }, label);
    b.addEventListener('click', () => {
      gesture();
      handlers.onClick?.();
      onClick();
    });
    return b;
  };
  const muteButtons: HTMLButtonElement[] = [];
  const muteButton = () => {
    const b = button('.ch-icon.ch-ghost', '', () => {
      setMuted(!muted);
      handlers.onMuteChange?.(muted);
    });
    muteButtons.push(b);
    paintMute(b);
    return b;
  };
  function paintMute(b: HTMLButtonElement) {
    b.replaceChildren(icon(muted ? 'soundOff' : 'soundOn'));
    b.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    b.setAttribute('aria-pressed', String(muted));
  }
  function setMuted(m: boolean) {
    muted = m;
    muteButtons.forEach(paintMute);
    pauseMute.textContent = muted ? 'Sound: off' : 'Sound: on';
  }

  // =========================================================================================
  // Embed (the /heist host page)
  // =========================================================================================
  const embed = opts.embed;
  let signedIn = false;
  function exitButton(): HTMLElement | null {
    if (!embed?.onExit) return null;
    const b = button('.ch-ghost', h('span', null, 'Token Tails'), () => embed.onExit?.(), { 'data-testid': 'heist-exit', 'aria-label': 'Back to Token Tails' });
    b.prepend(icon('back'));
    return h('div.ch-back', null, b);
  }
  let signInBtn: HTMLButtonElement | null = null;
  function resultsSignIn(): HTMLButtonElement | null {
    if (!embed?.onSignIn) return null;
    signInBtn = button('.ch-ghost', h('span', null, 'Sign in to keep your stars'), () => embed.onSignIn?.(), { 'data-testid': 'heist-signin' });
    signInBtn.hidden = signedIn;
    return signInBtn;
  }

  // =========================================================================================
  // Title
  // =========================================================================================
  const stars = h('div.ch-stars', { 'aria-hidden': 'true' });
  for (let i = 0; i < 22; i++) {
    const s = h('i');
    s.style.left = `${(i * 37.3) % 100}%`;
    s.style.top = `${(i * 61.7) % 100}%`;
    s.style.animationDelay = `${(i % 7) * 0.45}s`;
    if (i % 4 === 0) s.style.width = s.style.height = '5px';
    stars.appendChild(s);
  }
  const floaty = (src: string, left: string, top: string, delay: number) => {
    const f = h('img.ch-floaty', { src, alt: '', 'aria-hidden': 'true' });
    f.style.left = left;
    f.style.top = top;
    f.style.animationDelay = `${delay}s`;
    return f;
  };
  const bimg = (k: keyof AssetManifest['images']) => h('img.ch-bimg', { src: img(k), alt: '', 'aria-hidden': 'true' });
  const playBtn = button('.ch-primary.ch-big', h('span', null, 'Play'), () => showCatPick());
  playBtn.prepend(bimg('paw'));
  const yardBtn = button('', h('span', null, 'Cat Yard'), () => {
    hideAll();
    handlers.onYard?.();
  });
  yardBtn.prepend(icon('home'));
  // The payouts modal is web-only (chain words, explorer links: claims rule R10) and needs a list.
  const payoutsOn = web && !!deploymentsUrl;
  let payoutsModal: PayoutsModal | null = null;
  const openPayouts = () => payoutsModal?.show();
  const payoutsPill = payoutsOn
    ? (() => {
        const b = h('button.ch-pay-open', { type: 'button', 'data-testid': 'open-payouts' }, h('i', { 'aria-hidden': 'true' }), h('span', null, 'Sent to shelters')); // claim: L-disbursed
        b.addEventListener('click', () => {
          gesture();
          handlers.onClick?.();
          void openPayouts();
        });
        return b;
      })()
    : null;
  const title = h(
    'section.ch-screen.ch-title.ch-backdrop',
    { 'aria-label': 'Title' },
    stars,
    floaty(img('coin'), '9%', '16%', 0),
    floaty(img('catnip'), '86%', '20%', 1.2),
    floaty(img('paw'), '12%', '76%', 2.1),
    floaty(img('heart'), '85%', '74%', 0.6),
    h(
      'div.ch-brand',
      null,
      h('img.ch-logo', { src: img('logo'), alt: 'Token Tails' }),
      h('h1.ch-title-text', null, h('span', null, 'Catnip'), h('span', null, 'Heist')),
    ),
    h(
      'div.ch-menu',
      null,
      // claim:fiction in-game story (the crates, the guards and the shelter cat are the level)
      h('p.ch-ribbon', null, h('img', { src: img('catnip'), alt: '' }), h('span.ch-tag', null, 'Sneak past Kibble Corp. Rescue the catnip crates. Free a shelter cat.')),
      h('div.ch-play-wrap', null, h('span.ch-play-glow', { 'aria-hidden': 'true' }), playBtn),
      yardBtn,
      payoutsPill,
    ),
    exitButton(),
    h('div.ch-corner', null, muteButton()),
    // claim: C-004, L-rail (the footer follows the rail state, see rail.ts)
    h('div.ch-foot', { 'data-claim': 'L-rail', 'data-testid': 'rail-foot' }, h('img', { src: img('heart'), alt: '' }), footText),
  );
  root.appendChild(title);

  // =========================================================================================
  // Cat pick
  // =========================================================================================
  let picked: string[] = loadPick();
  function loadPick(): string[] {
    const fromStore = (safeStorageGet(PICK_KEY) ?? '').split(',').filter((id) => byId.has(id));
    const pair = opts.defaultCats?.filter((id) => byId.has(id)) ?? [];
    const pref = pair.length === 2 ? pair : fromStore.length === 2 ? fromStore : DEFAULT_PAIR.filter((id) => byId.has(id));
    const out = [...new Set(pref)];
    for (const c of cats) {
      if (out.length >= 2) break;
      if (!out.includes(c.id)) out.push(c.id);
    }
    return out.slice(0, 2);
  }

  const grid = h('div.ch-grid', { role: 'group', 'aria-label': 'Cats' });
  const cards = new Map<string, HTMLButtonElement>();
  let gridBuilt = false;
  function buildGrid() {
    if (gridBuilt) return;
    gridBuilt = true;
    for (const c of cats) {
      const card = h(
        'button.ch-card',
        { type: 'button', 'aria-pressed': 'false', 'aria-label': c.name, 'data-cat': c.id, style: `--i:${Math.min(cats.indexOf(c), 40)}` },
        createPortrait(c, { size: 96, base }),
        h('span.ch-name', null, c.name),
        h('span.ch-badge', { 'aria-hidden': 'true' }),
      );
      card.addEventListener('click', () => {
        gesture();
        handlers.onClick?.();
        togglePick(c.id);
      });
      cards.set(c.id, card);
      grid.appendChild(card);
    }
  }
  function togglePick(id: string) {
    const i = picked.indexOf(id);
    if (i >= 0) picked.splice(i, 1);
    else if (picked.length < 2) picked.push(id);
    else picked = [picked[0], id];
    paintPick();
  }
  const slotEls = [h('div.ch-slot'), h('div.ch-slot')];
  const slotNames = h('div.ch-slot-names');
  const startBtn = button('.ch-primary.ch-big', 'Start heist', () => {
    if (picked.length !== 2) return;
    safeStorageSet(PICK_KEY, picked.join(','));
    handlers.onStart([picked[0], picked[1]]);
  });
  const pickCount = h('p.ch-sub', null, '');
  function paintPick() {
    for (const [id, card] of cards) {
      const i = picked.indexOf(id);
      card.setAttribute('aria-pressed', String(i >= 0));
      const badge = card.querySelector('.ch-badge');
      if (badge) badge.textContent = i >= 0 ? String(i + 1) : '';
    }
    slotEls.forEach((s, i) => {
      s.replaceChildren();
      const e = byId.get(picked[i]);
      s.classList.toggle('ch-filled', !!e);
      if (e) s.append(createPortrait(e, { size: 64, base }), h('b', null, String(i + 1)));
    });
    slotNames.replaceChildren(...picked.map((id, i) => h('div', null, `${i + 1}. ${byId.get(id)?.name ?? id}`)));
    startBtn.disabled = picked.length !== 2;
    setText(pickCount, picked.length === 2 ? 'Crew ready! Tap a cat to change.' : `Choose ${2 - picked.length} more cat${picked.length === 1 ? '' : 's'}.`);
  }
  const randomBtn = button('.ch-ghost', 'Random', () => {
    const n = cats.length;
    const a = Math.floor(Math.random() * n);
    let b = Math.floor(Math.random() * (n - 1));
    if (b >= a) b++;
    picked = [cats[a].id, cats[b].id];
    paintPick();
    cards.get(picked[0])?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  });
  const pick = h(
    'section.ch-screen.ch-pick',
    { 'aria-label': 'Pick your crew' },
    h(
      'div.ch-pick-head',
      null,
      button('.ch-icon.ch-ghost', icon('back'), () => showTitle(), { 'aria-label': 'Back' }),
      h('div.ch-head-text', null, h('h2.ch-h2', null, 'Pick your crew'), pickCount),
      randomBtn,
    ),
    h('div.ch-grid-wrap', null, grid),
    h('div.ch-pick-bar', null, h('div.ch-slots', null, slotEls[0], slotEls[1]), slotNames, startBtn),
  );
  root.appendChild(pick);

  // =========================================================================================
  // HUD
  // =========================================================================================
  const coinsText = h('b', null, '0');
  const coinsChip = h(
    'div.ch-chip.ch-coins',
    { title: 'Catnip collected. Win with all of it for a star.' },
    h('img', { src: img('catnip'), alt: '' }),
    coinsText,
    h('span.ch-coins-star', { 'aria-hidden': 'true' }, '★'),
  );
  const exitText = h('span', null, '0/2 at exit');
  const exitChip = h('div.ch-chip.ch-exit', { title: 'Cats at the exit', 'data-testid': 'heist-exit-count' }, exitText);
  const timeText = h('b', null, '0:00');
  const timeChip = h('div.ch-chip.ch-time', { title: 'Time' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('clock')), timeText);
  const spotText = h('b', null, '0');
  const spotChip = h('div.ch-chip.ch-spot', { title: 'Times spotted' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('eye')), spotText);
  const keyChip = h('div.ch-chip.ch-key', { title: 'Vault key' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('key')), 'Key');
  keyChip.style.display = 'none';
  const objText = h('span', { 'aria-live': 'polite' }, '');
  const objLabel = h('small', null, 'Objective');
  const routePill = h('span.ch-obj-route', { 'aria-hidden': 'true' }, h('img', { src: img('paw'), alt: '' }), h('span', null, 'Route'));
  // The chip is a button: tapping it (or H) shows the ghost-paw route for this objective (plan G10).
  // No aria-label: the button's name is its content (the label and the current objective), so a
  // focused chip reads the objective; the action is its description.
  const objDesc = h('span#ch-obj-desc', { hidden: true }, 'Tap to show a route.');
  const objInner = h('button.ch-obj-inner', { type: 'button', 'aria-pressed': 'false', 'aria-describedby': 'ch-obj-desc', 'data-testid': 'heist-objective' }, objLabel, objText, routePill, objDesc);
  objInner.addEventListener('click', () => {
    gesture();
    handlers.onClick?.();
    handlers.onObjectiveTap?.();
  });
  const obj = h('div.ch-obj', null, objInner);
  let routeState: RouteChipState = 'off';
  function setRoute(st: RouteChipState) {
    if (st === routeState) return;
    routeState = st;
    objInner.classList.toggle('ch-route-on', st !== 'off');
    objInner.setAttribute('aria-pressed', String(st !== 'off'));
    setText(objLabel, st === 'swap' ? 'Swap cats, then follow the paws' : st === 'on' ? 'Follow the paw prints' : 'Objective');
    setText(objDesc, st === 'off' ? 'Tap to show a route.' : 'Route shown; tap to hide it.');
  }
  const pauseBtn = button('.ch-icon.ch-ghost', icon('pause'), () => handlers.onPause?.(), { 'aria-label': 'Pause' });
  const hint = h('div.ch-hint', { role: 'status' });
  const crewBtns = [0, 1].map((i) => {
    const b = h(
      'button.ch-crew-btn',
      { type: 'button', 'aria-current': 'false' },
      h('span.ch-crew-tag', null, 'you'),
      // Parked-cat status: on a plate (holding a door), or about to be seen.
      h('span.ch-crew-state', { 'aria-hidden': 'true' }),
    );
    b.addEventListener('click', () => {
      gesture();
      if (lastState && lastState.activeIndex !== i) input?.press('swap');
    });
    return b;
  });
  const crewKey = h('div.ch-crew-key', null, 'Q / Tab');
  const toasts = h('div.ch-toasts', { 'aria-hidden': 'true' });
  const flash = h('div.ch-flash', { 'aria-hidden': 'true' });
  const hud = h(
    'section.ch-screen.ch-hud',
    { 'aria-label': 'Heist HUD' },
    flash,
    h('div.ch-hud-top', null, h('div.ch-chips', null, coinsChip, timeChip, spotChip, keyChip, exitChip), obj, h('div.ch-hud-right', null, muteButton(), pauseBtn)),
    h('div.ch-crew', null, crewBtns[0], crewBtns[1], crewKey),
    hint,
    toasts,
  );
  root.appendChild(hud);
  const ftue = createFtueOverlay(root, { onClick: () => handlers.onClick?.() });
  const onRouteKey = (e: KeyboardEvent) => {
    if (screen !== 'hud' || paused || ftue.briefOpen || e.repeat || e.defaultPrevented) return;
    if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') handlers.onObjectiveTap?.();
  };
  window.addEventListener('keydown', onRouteKey);

  let touch: TouchControls | null = null;
  /** Mirrors the root's .ch-touching class (read every HUD update without touching the DOM). */
  let touching = false;
  const setTouching = (on: boolean) => {
    if (on === touching) return;
    touching = on;
    root.classList.toggle('ch-touching', on);
  };
  if (input) {
    touch = createTouchControls(hud, input, { onPress: gesture });
    const autoTouch = () => opts.touch ?? (isCoarsePointer() || input.lastDevice === 'touch');
    const applyTouch = () => {
      const on = autoTouch();
      touch?.setVisible(on);
      setTouching(on);
    };
    applyTouch();
    const prev = input.onDeviceChange;
    input.onDeviceChange = (d) => {
      prev?.(d);
      if (opts.touch === undefined) {
        const on = d === 'touch' || (d !== 'keyboard' && d !== 'gamepad' && isCoarsePointer());
        touch?.setVisible(on);
        setTouching(on);
      }
    };
  }

  let level: LevelDef | null = null;
  let lastState: SimState | null = null;
  let lastActive = -1;
  let lastCoins = -1;
  let lastSpots = -1;
  let lastEventTick = -1;
  let totalCoins = 0;
  let hintShownAt = 0;
  const HINT_NARROW_MS = 7000;
  const narrowMq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 520px) and (orientation: portrait)') : null;
  // Cached: reading .matches every frame re-evaluates the query.
  let narrow = narrowMq?.matches === true;
  const onNarrowChange = (e: MediaQueryListEvent) => {
    narrow = e.matches;
  };
  narrowMq?.addEventListener?.('change', onNarrowChange);
  /** State the HUD last reflected (sim states are immutable: same object, nothing to redo). */
  let hudState: SimState | null = null;
  let hudTouching = false;
  /** The current state has a hint, and whether .ch-on is set on it. */
  let hintWanted = false;
  let hintOn = false;
  /** Portrait badges last shown, `${cat0}|${cat1}` with '' | 'plate' | 'danger' each. */
  let crewState = '';
  /** Look-ahead parked-cat warning (partnerCatchAhead), refreshed every 6 ticks. */
  let dangerAhead = false;
  let dangerTick = -1e9;
  /** Cats at the exit shown in the exit chip (-1 = hidden). */
  let exitCount = -1;
  let coinsAll = false;

  function showHUD(lv: LevelDef, catIds: [string, string]) {
    level = lv;
    totalCoins = lv.coins.length;
    lastState = null;
    lastActive = -1;
    lastCoins = lastSpots = -1;
    lastEventTick = -1;
    hudState = null;
    hintWanted = hintOn = false;
    crewState = '';
    dangerAhead = false;
    dangerTick = -1e9;
    exitCount = -1;
    coinsAll = false;
    exitChip.classList.remove('ch-on');
    coinsChip.classList.remove('ch-all');
    crewBtns.forEach((b, i) => {
      b.classList.remove('ch-danger', 'ch-holding');
      const tag = b.querySelector('.ch-crew-state');
      if (tag) tag.textContent = '';
      b.querySelector('canvas')?.remove();
      const e = byId.get(catIds[i]);
      if (e) b.prepend(createPortrait(e, { size: 60, base }));
      b.setAttribute('aria-label', `${i === 0 ? 'First' : 'Second'} cat: ${e?.name ?? catIds[i]}`);
    });
    toasts.replaceChildren();
    hint.classList.remove('ch-on');
    setText(objText, objectiveText({ keyTaken: false, rescued: false, won: false }, lv));
    setText(coinsText, `0/${totalCoins}`);
    setText(timeText, '0:00');
    setText(spotText, '0');
    keyChip.style.display = 'none';
    paused = false;
    pauseModal.classList.remove('ch-on');
    setRoute('off');
    ftue.hideAll();
    show('hud');
  }

  // Called every animation frame, but the sim only ticks at 30 Hz: all DOM work happens when the
  // state object changes, and only for values that changed (no reads that force a layout).
  function updateHUD(s: SimState) {
    lastState = s;
    if (!level) return;
    if (s !== hudState || touching !== hudTouching) {
      hudState = s;
      hudTouching = touching;
      if (s.coinsCollected !== lastCoins) {
        const from = lastCoins < 0 ? s.coinsCollected : lastCoins;
        lastCoins = s.coinsCollected;
        tweenCount(coinsText, from, s.coinsCollected, (v) => `${v}/${totalCoins}`, 260);
      }
      setText(timeText, formatTime(s.tick, TICK_HZ));
      if (s.spottedCount !== lastSpots) {
        setText(spotText, String(s.spottedCount));
        lastSpots = s.spottedCount;
      }
      const keyShown = s.hasKey ? '' : 'none';
      if (keyChip.style.display !== keyShown) keyChip.style.display = keyShown;
      const ot = objectiveText(s, level);
      if (objText.textContent !== ot) {
        objText.textContent = ot;
        restartAnim(objInner, 'ch-new');
      }
      if (s.activeIndex !== lastActive) {
        lastActive = s.activeIndex;
        crewBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === s.activeIndex)));
      }
      // Portrait badges, per cat: "on plate" on whichever cat is pressing a plate right now (active or
      // parked, so it follows the cat after a swap), and "!" on the parked cat while a guard is about
      // to see it: in a cone with a tile to spare, a telegraphed sentry turn, or (looked up 5 times a
      // second) a patrol that would walk into view within 2 s if nobody moved.
      const idle = s.activeIndex === 0 ? 1 : 0;
      if (s.won) dangerAhead = false;
      else if (s.tick - dangerTick >= 6 || s.tick < dangerTick) {
        dangerTick = s.tick;
        dangerAhead = partnerCatchAhead(level, s) !== null;
      }
      const danger = !s.won && (dangerAhead || partnerDanger(level, s) >= 0);
      const lv = level;
      const st = s.cats.map((c, i) => {
        if (i === idle && danger) return 'danger';
        const pi = c ? plateIndexAt(lv, c.pos) : -1;
        return pi >= 0 && s.platesDown[pi] ? 'plate' : '';
      });
      const key = `${st[0]}|${st[1]}`;
      if (key !== crewState) {
        const wasDanger = crewState.includes('danger');
        crewState = key;
        crewBtns.forEach((b, i) => {
          const tag = b.querySelector('.ch-crew-state') as HTMLElement | null;
          const mine = st[i] ?? '';
          b.classList.toggle('ch-danger', mine === 'danger');
          b.classList.toggle('ch-holding', mine === 'plate');
          if (tag) tag.textContent = mine === 'danger' ? '!' : mine === 'plate' ? 'on plate' : '';
        });
        if (!wasDanger && key.includes('danger')) announce('Your other cat is about to be seen.');
      }
      // After the rescue, the objective counts the cats already at the exit.
      if (s.rescued && !s.won) {
        const n = (catAtExit(lv, s.cats[0].pos) ? 1 : 0) + (catAtExit(lv, s.cats[1].pos) ? 1 : 0);
        if (n !== exitCount) {
          exitCount = n;
          setText(exitText, `${n}/2 at exit`);
          exitChip.classList.toggle('ch-on', true);
        }
      } else if (exitCount !== -1) {
        exitCount = -1;
        exitChip.classList.toggle('ch-on', false);
      }
      // Catnip chip: a star once every coin is in (the "All catnip" star needs a win with all of it).
      const allIn = totalCoins > 0 && s.coinsCollected >= totalCoins;
      if (allIn !== coinsAll) {
        coinsAll = allIn;
        coinsChip.classList.toggle('ch-all', allIn);
      }
      const ht = hudHintText(s, level, touching);
      hintWanted = !!ht;
      if (ht && hint.textContent !== ht) {
        hint.textContent = ht;
        hint.classList.remove('ch-on');
        hintOn = false;
        void hint.offsetWidth;
        hintShownAt = performance.now();
      }
    }
    // On narrow portrait screens the hint sits over the play area: let it go after a while.
    const on = hintWanted && !(narrow && performance.now() - hintShownAt > HINT_NARROW_MS);
    if (on !== hintOn) {
      hintOn = on;
      hint.classList.toggle('ch-on', on);
    }
    // If the app only calls updateHUD, still surface this tick's events once.
    if (s.tick !== lastEventTick && s.events.length) handleEvents(s.events, s);
  }

  function bump(el: HTMLElement) {
    restartAnim(el, 'ch-bump');
  }
  function plusOne(el: HTMLElement, text = '+1') {
    if (reduced) return;
    const p = h('span.ch-plus', { 'aria-hidden': 'true' }, text);
    el.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }

  function handleEvents(events: readonly SimEvent[], s?: SimState) {
    if (s) {
      if (s.tick === lastEventTick) return;
      lastEventTick = s.tick;
    }
    for (const e of events) {
      switch (e.type) {
        case 'COIN':
          bump(coinsChip);
          plusOne(coinsChip);
          break;
        case 'KEY':
          toast('Got the key!', 'good');
          bump(keyChip);
          break;
        case 'SPOTTED':
          toast('Spotted! Hidden for a moment at the checkpoint.', 'bad');
          flash.classList.remove('ch-go');
          void flash.offsetWidth;
          flash.classList.add('ch-go');
          bump(spotChip);
          announce('Spotted! Back to the checkpoint. Dogs cannot see you there for a moment.');
          break;
        case 'RESCUE':
          toast(`${level?.crate.catName ?? 'Cat'} is free!`, 'good');
          announce(`${level?.crate.catName ?? 'The shelter cat'} is free. Now get both cats to the exit.`);
          // The real cat's HUD chip (src/ui/levels/rescue-view.ts), when the campaign mounted one.
          root.querySelector<HTMLElement>('.ch-lv-hudcat')?.setAttribute('data-freed', 'true');
          break;
        case 'CHECKPOINT':
          toast('Checkpoint', 'info');
          break;
        case 'DOOR':
          if (e.open && level?.doors.find((d) => d.id === e.id)?.kind === 'VAULT') toast('Vault open', 'info');
          break;
        case 'WIN':
          // The win banner stands alone: clear earlier toasts (e.g. a checkpoint on the exit pad).
          toasts.replaceChildren();
          toast('Heist complete!', 'good');
          break;
        default:
          break;
      }
    }
  }

  const MAX_TOASTS = 2;
  function toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    // Same message already on screen: restart it instead of stacking a duplicate.
    for (const el of Array.from(toasts.children) as HTMLElement[]) {
      if (el.textContent === text) {
        el.remove();
        break;
      }
    }
    const t = h(`div.ch-toast.ch-${kind}`, null, text);
    toasts.appendChild(t);
    while (toasts.childElementCount > MAX_TOASTS) toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), reduced ? 1400 : 1700);
  }

  let announceClear: ReturnType<typeof setTimeout> | null = null;
  function announce(text: string) {
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 30);
    // Clear it again so an old message does not linger in the page text.
    if (announceClear) clearTimeout(announceClear);
    announceClear = setTimeout(() => (live.textContent = ''), 3000);
  }

  // =========================================================================================
  // Pause
  // =========================================================================================
  const pauseMute = button('.ch-ghost', muted ? 'Sound: off' : 'Sound: on', () => {
    setMuted(!muted);
    handlers.onMuteChange?.(muted);
  });
  const resumeBtn = button('.ch-primary.ch-big', h('span', null, 'Resume'), () => handlers.onResume?.());
  resumeBtn.prepend(icon('play'));
  const pauseRetry = button('', h('span', null, 'Retry'), () => handlers.onRetry?.());
  pauseRetry.prepend(icon('retry'));
  const quitBtn = button('.ch-ghost', h('span', null, 'Quit to menu'), () => {
    handlers.onMenu?.();
    showTitle();
  });
  quitBtn.prepend(icon('home'));
  const pausePayouts = payoutsOn ? button('.ch-ghost', h('span', null, 'Sent to shelters'), () => void openPayouts(), { 'data-testid': 'pause-payouts' }) : null; // claim: L-disbursed
  pausePayouts?.prepend(h('img.ch-bimg', { src: img('heart'), alt: '', 'aria-hidden': 'true' }));
  const pauseSub = h('p.ch-sub', null, '');
  const keysHelp = h(
    'div.ch-keys',
    null,
    h('span', null, h('kbd', null, 'WASD'), ' ', h('kbd', null, '←↑→↓')),
    h('span', null, 'Move'),
    h('span', null, h('kbd', null, 'Q'), ' ', h('kbd', null, 'Tab')),
    h('span', null, 'Swap cat'),
    h('span', null, h('kbd', null, 'E')),
    h('span', null, 'Interact / free the cat'),
    h('span', null, h('kbd', null, 'Space')),
    h('span', null, 'Meow (lures guards)'),
    h('span', null, h('kbd', null, 'Esc'), ' ', h('kbd', null, 'P')),
    h('span', null, 'Pause'),
  );
  const pauseModal = h(
    'section.ch-screen.ch-modal',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' },
    h(
      'div.ch-panel.ch-dialog',
      null,
      h('div.ch-pause-head', null, h('h2.ch-h2', null, icon('pause'), 'Paused'), pauseSub),
      resumeBtn,
      h('div.ch-row', null, pauseRetry, pauseMute),
      pausePayouts,
      quitBtn,
      keysHelp,
    ),
  );
  root.appendChild(pauseModal);

  function showPause() {
    if (screen !== 'hud') return;
    paused = true;
    setText(pauseSub, level ? `${level.meta.title} · ${lastState ? formatTime(lastState.tick, TICK_HZ) : '0:00'}` : '');
    pauseModal.classList.add('ch-on');
    root.classList.add('ch-paused-run');
    resumeBtn.focus({ preventScroll: true });
  }
  function hidePause() {
    payoutsModal?.hide();
    paused = false;
    pauseModal.classList.remove('ch-on');
    root.classList.remove('ch-paused-run');
  }

  // =========================================================================================
  // Results
  // =========================================================================================
  const resultsBody = h('div.ch-panel.ch-dialog');
  let resultsRun = 0;
  function confetti(): HTMLElement {
    const box = h('div.ch-confetti', { 'aria-hidden': 'true' });
    const cols = ['#ffcc55', '#ff7aa2', '#d5f4e5', '#c4e2fc', '#f0c5fd', '#ee642a', '#fcecbb'];
    for (let i = 0; i < 42; i++) {
      const c = h('i');
      c.style.left = `${(i * 23.7) % 100}%`;
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = `${2.2 + ((i * 7) % 10) / 6}s`;
      c.style.animationDelay = `${((i * 13) % 20) / 18}s`;
      if (i % 3 === 0) c.style.width = c.style.height = '10px';
      box.appendChild(c);
    }
    return box;
  }
  let lastRescued = '';
  /** Win screen: opens the payouts modal on the web; elsewhere the old external link (unchanged). */
  function resultsPayoutsLink(): HTMLElement | null {
    if (payoutsOn) {
      const b = h('button.ch-pay-open.ch-pay-open-sm', { type: 'button', 'data-testid': 'results-payouts' }, h('i', { 'aria-hidden': 'true' }), h('span', null, 'See shelter payouts'));
      b.addEventListener('click', () => {
        handlers.onClick?.();
        void openPayouts();
      });
      return b;
    }
    return payoutsUrl ? h('a.ch-payouts', { href: payoutsUrl, target: '_blank', rel: 'noopener' }, 'See shelter payouts') : null;
  }
  const results = h('section.ch-screen.ch-modal.ch-results', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Results' }, resultsBody);
  root.appendChild(results);

  function showResults(r: RunResult, lv: LevelDef | undefined = level ?? undefined) {
    const sb = scoreBreakdown(r);
    const total = lv?.coins.length ?? totalCoins;
    const par = lv?.meta.parTicks ?? 0;
    const paws = pawRating(r, total, par);
    const crateId = lv?.crate.catId;
    const crateEntry = crateId ? byId.get(crateId) : undefined;
    const name = r.rescuedName || lv?.crate.catName || 'the shelter cat';
    const pawRow = h('div.ch-paws', { 'aria-label': `${paws} of 3 paws` });
    for (let i = 0; i < 3; i++) {
      const wrap = h('span');
      const p = h('img', { src: img('paw'), alt: '' });
      if (i < paws) {
        p.classList.add('ch-lit');
        wrap.classList.add('ch-lit');
        const d = `${0.25 + i * 0.22}s`;
        p.style.animationDelay = d;
        wrap.style.animationDelay = d;
      }
      wrap.appendChild(p);
      pawRow.appendChild(wrap);
    }
    lastRescued = r.rescued ? r.rescuedName || lv?.crate.catName || '' : lastRescued;
    const run = ++resultsRun;
    const tally: { el: HTMLElement; to: number; fmt: (v: number) => string }[] = [];
    const row = (label: string, to: number, fmt: (v: number) => string, cls = '') => {
      const v = h('td', null, fmt(reduced ? to : 0));
      tally.push({ el: v, to, fmt });
      return h('tr', cls ? { class: cls } : null, h('td', null, label), v);
    };
    const rows = [
      row(`Catnip ${r.coins}/${total} × 10${total > 0 && r.coins < total ? ` (all ${total} = ★)` : ''}`, sb.coinPoints, (v) => `+${v}`),
      // claim:fiction in-game rescue score row, no money moves
      row('Shelter cat rescued', r.rescued ? sb.rescuePoints : 0, (v) => `+${v}`),
      row(`Time ${formatTime(r.ticks)}${par ? ` (par ${formatTime(par)})` : ''}`, sb.timePenalty, (v) => `−${v}`),
      row('Spotted', r.spottedCount, (v) => `${v}×`),
      row('Score', r.score, (v) => String(v), 'ch-total'),
    ];
    rows.forEach((tr, i) => (tr.style.animationDelay = `${0.35 + i * 0.12}s`));
    const table = h('table.ch-score', null, h('tbody', null, ...rows));
    rows[2].lastElementChild?.classList.add('ch-neg');
    // The rail decides the small print and whether the give link shows (plan G11): live shows the
    // link, pre-launch an "Opens soon" status badge, exhausted only the line (it names the reset).
    const copy = railCopy(rail, web);
    const giveName = r.rescuedName || lv?.crate.catName || '';
    const railChip = (text: string) => h('span.ch-rail-chip', { role: 'status', 'data-testid': 'rail-chip', 'data-claim': 'L-rail' }, text);
    let giveEl = r.rescued && copy.showGive ? giveButton(giveName) : null;
    let chipEl = r.rescued && !giveEl && copy.chip ? railChip(copy.chip) : null;
    // claim: C-004, L-rail
    const rescueNote = h('small', { 'data-testid': 'rail-line', 'data-claim': 'L-rail', 'data-rail': copy.state }, copy.line);
    // A rail that changes while this screen shows (a late live status) repaints the line and the
    // give link in place.
    resultsRailPaint = r.rescued
      ? () => {
          const c = railCopy(rail, web);
          if (rescueNote.dataset.rail === c.state) return;
          rescueNote.dataset.rail = c.state;
          setText(rescueNote, c.line);
          giveEl?.remove();
          chipEl?.remove();
          giveEl = c.showGive ? giveButton(giveName) : null;
          chipEl = !giveEl && c.chip ? railChip(c.chip) : null;
          rescueNote.after(...[giveEl, chipEl].filter((x): x is HTMLElement => !!x));
        }
      : null;
    const rescue = r.rescued
      // claim:fiction in-game rescue, no money moves
      ? h('div.ch-rescue', null, crateEntry ? createPortrait(crateEntry, { size: 72, base }) : null, h('p', null, `You rescued ${name}!`, rescueNote, giveEl, chipEl, resultsPayoutsLink(), shelterTotal()))
      : h('div.ch-rescue.ch-miss', null, h('p', null, `${name} is still in the crate`, h('small', null, 'Free the shelter cat for +50.')));
    const retry = button('.ch-primary.ch-big', h('span', null, 'Retry'), () => handlers.onRetry?.());
    retry.prepend(icon('retry'));
    const menuBtn = button('.ch-big', h('span', null, 'Menu'), () => {
      handlers.onMenu?.();
      showTitle();
    });
    menuBtn.prepend(icon('home'));
    resultsBody.replaceChildren(
      h(`div.ch-banner${r.rescued ? '' : '.ch-miss'}`, null, h('h2.ch-h2', null, r.rescued ? 'Heist complete!' : 'Heist over')),
      h(
        'div.ch-scroll',
        null,
        pawRow,
        rescue,
        table,
        h('div.ch-meta', null, h('span', null, 'replay ', h('code', null, hashHex(r.hash))), h('span', null, 'seed ', h('code', null, String(r.seed))), h('span', null, h('code', null, r.levelId))),
        h('div.ch-row', null, retry, menuBtn),
        resultsSignIn(),
      ),
    );
    results.querySelector('.ch-confetti')?.remove();
    if (r.rescued && !reduced) results.prepend(confetti());
    if (!reduced) {
      // Count each row up in turn, then the total.
      tally.forEach((t, i) => {
        setTimeout(() => {
          if (run !== resultsRun) return;
          const last = i === tally.length - 1;
          tweenCount(t.el, 0, t.to, t.fmt, last ? 700 : 380, last ? () => rows[i].classList.add('ch-done') : undefined);
        }, 520 + i * 300);
      });
    }
    paused = false;
    pauseModal.classList.remove('ch-on');
    show('results');
    results.dataset.score = String(r.score);
    retry.focus({ preventScroll: true });
    announce(`Score ${r.score}. ${r.rescued ? `You rescued ${name}.` : ''}`);
  }

  // =========================================================================================
  // Yard bar + loading
  // =========================================================================================
  const yardSub = h('p.ch-sub', null, '');
  const yard = h(
    'section.ch-screen.ch-yardbar',
    { 'aria-label': 'Cat Yard' },
    h('div.ch-back', null, (() => {
      const b = button('.ch-ghost', h('span', null, 'Back'), () => {
        handlers.onYardBack?.();
        showTitle();
      });
      b.prepend(icon('back'));
      return b;
    })()),
    h('div.ch-yard-title', null, h('h2.ch-h2', null, 'Cat Yard'), yardSub),
    h('div.ch-corner', null, muteButton()),
  );
  root.appendChild(yard);

  const loadingText = h('p', null, 'Loading');
  const TIPS = ['Tip: a pressure plate only holds its door while a cat sits on it.', 'Tip: meow to lure a guard away from a doorway.', 'Tip: crates block a guard dog\'s view. Hide behind them.', 'Tip: every catnip is worth 10 points.'];
  const loadingTip = h('small', null, '');
  const loading = h('section.ch-screen.ch-loading', { role: 'status', 'aria-live': 'polite' }, h('img', { src: img('paw'), alt: '' }), loadingText, h('div.ch-bar', null, h('i')), loadingTip);
  root.appendChild(loading);

  // =========================================================================================
  // Navigation
  // =========================================================================================
  const screens: Record<Exclude<ScreenName, 'none'>, HTMLElement> = { title, pick, hud, yard, results };
  const iris = h('div.ch-iris', { 'aria-hidden': 'true' });
  root.appendChild(iris);
  if (payoutsOn) {
    payoutsModal = createPayoutsModal(root, {
      deploymentsUrl,
      testnetUrl: opts.testnetDeploymentsUrl ?? TESTNET_DEPLOYMENTS_URL,
      base,
      payoutsUrl,
      heartSrc: img('heart'),
      load: opts.loadPayouts,
      loadTestnet: opts.loadTestnetPayouts,
      onClick: () => handlers.onClick?.(),
      onOpen: () => {
        dioramaHeld = true;
        diorama?.stop();
      },
      onClose: () => {
        dioramaHeld = false;
        syncDiorama(screen);
      },
      // The rail decides the CTA, as on the win screen: the give link while live, else its badge.
      giveCta: () => {
        const copy = railCopy(rail, web);
        if (copy.showGive) return giveButton(lastRescued);
        return copy.chip ? h('span.ch-rail-chip', { role: 'status', 'data-claim': 'L-rail' }, copy.chip) : null;
      },
      // claim: C-004, L-rail
      railLine: () => railCopy(rail, web).line,
    });
  }
  function show(name: ScreenName) {
    const from = screen;
    screen = name;
    syncDiorama(name);
    for (const [k, el] of Object.entries(screens)) {
      const on = k === name;
      el.classList.toggle('ch-on', on);
      if (on && from !== name && !reduced) restartAnim(el, 'ch-enter');
      else if (!on) el.classList.remove('ch-enter');
    }
    // Iris wipe when entering or leaving a run (never blocks input: pointer-events none).
    const runScreens: ScreenName[] = ['hud', 'results'];
    if (!reduced && from !== name && (runScreens.includes(name) || (name === 'title' && runScreens.includes(from)))) restartAnim(iris, 'ch-go');
    if (from !== name) payoutsModal?.hide();
    if (name !== 'hud') {
      pauseModal.classList.remove('ch-on');
      paused = false;
      ftue.hideAll();
      setRoute('off');
      root.classList.remove('ch-paused-run');
    }
  }
  function showTitle() {
    level = null;
    show('title');
    playBtn.focus({ preventScroll: true });
  }
  function showCatPick() {
    buildGrid();
    picked = picked.length === 2 ? picked : loadPick();
    paintPick();
    show('pick');
    requestAnimationFrame(() => cards.get(picked[0])?.scrollIntoView({ block: 'nearest' }));
    startBtn.focus({ preventScroll: true });
  }
  function hideAll() {
    show('none');
  }

  // Escape on menus: back one step.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (screen === 'pick') showTitle();
    else if (screen === 'yard') {
      handlers.onYardBack?.();
      showTitle();
    }
  };
  window.addEventListener('keydown', onKey);

  const api: UI = {
    root,
    get screen() {
      return screen;
    },
    get paused() {
      return paused;
    },
    showTitle,
    showCatPick,
    showHUD,
    updateHUD,
    handleEvents,
    showPause,
    hidePause,
    showResults,
    showYard(count = cats.length) {
      setText(yardSub, `${count} cats hanging out. Tap one to say hi.`);
      show('yard');
    },
    hideAll,
    setLoading(text) {
      const was = loading.classList.contains('ch-on');
      loading.classList.toggle('ch-on', text !== null);
      if (text !== null) {
        setText(loadingText, text);
        if (!was) setText(loadingTip, TIPS[Math.floor(Math.random() * TIPS.length)]);
      }
    },
    toast,
    setMuted,
    setSignedIn(next) {
      signedIn = next;
      if (signInBtn) signInBtn.hidden = next;
    },
    getPickedCats: () => [picked[0], picked[1]],
    ftue,
    setRoute,
    showPayouts() {
      if (!payoutsModal) return;
      // Never over a running heist: pause it first (the app shows the pause menu underneath).
      if (screen === 'hud' && !paused) handlers.onPause?.();
      void payoutsModal.show();
    },
    hidePayouts() {
      payoutsModal?.hide();
    },
    get payoutsOpen() {
      return !!payoutsModal?.isOpen;
    },
    get touch() {
      return touch;
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onKeyGesture);
      window.removeEventListener('keydown', onRouteKey);
      ftue.dispose();
      payoutsModal?.dispose();
      narrowMq?.removeEventListener?.('change', onNarrowChange);
      touch?.dispose();
      diorama?.dispose();
      root.remove();
    },
  };
  return api;
}
