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
import { ASSET_BASE, PAYOUTS_URL, TICK_HZ, type AssetManifest, type LevelDef, type RunResult, type SheetEntry, type SimEvent, type SimState } from '../types';
import { formatTime, h, hashHex, isCoarsePointer, prefersReducedMotion, safeStorageGet, safeStorageSet, setText } from './dom';
import type { InputController } from './input';
import { activeHint, objectiveText, pawRating, scoreBreakdown } from './logic';
import { createPortrait } from './portraits';
import { icon } from './icons';
import { ensureStyles } from './styles';
import { createDiorama, type Diorama } from '../render/diorama';
import { createTouchControls, type TouchControls } from './touch';

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
}

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
  /** Shelter payouts page linked from the win screen. Default PAYOUTS_URL; '' hides the link. */
  payoutsUrl?: string;
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
  /** Currently chosen pair on the cat pick screen. */
  getPickedCats(): [string, string];
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
  function syncDiorama(name: ScreenName) {
    const want = name === 'title' || name === 'pick';
    dioramaHost.classList.toggle('ch-on', want);
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
      h('p.ch-ribbon', null, h('img', { src: img('catnip'), alt: '' }), h('span.ch-tag', null, 'Sneak past Kibble Corp. Loot the catnip. Free a shelter cat.')),
      playBtn,
      yardBtn,
    ),
    h('div.ch-corner', null, muteButton()),
    h('div.ch-foot', null, h('img', { src: img('heart'), alt: '' }), 'Play to save: every heist helps real shelter cats.'),
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
  const coinsChip = h('div.ch-chip.ch-coins', { title: 'Catnip collected' }, h('img', { src: img('catnip'), alt: '' }), coinsText);
  const timeText = h('b', null, '0:00');
  const timeChip = h('div.ch-chip.ch-time', { title: 'Time' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('clock')), timeText);
  const spotText = h('b', null, '0');
  const spotChip = h('div.ch-chip.ch-spot', { title: 'Times spotted' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('eye')), spotText);
  const keyChip = h('div.ch-chip.ch-key', { title: 'Vault key' }, h('span.ch-ico', { 'aria-hidden': 'true' }, icon('key')), 'Key');
  keyChip.style.display = 'none';
  const objText = h('span', null, '');
  const objInner = h('div.ch-obj-inner', { 'aria-live': 'polite' }, h('small', null, 'Objective'), objText);
  const obj = h('div.ch-obj', null, objInner);
  const pauseBtn = button('.ch-icon.ch-ghost', icon('pause'), () => handlers.onPause?.(), { 'aria-label': 'Pause' });
  const hint = h('div.ch-hint', { role: 'status' });
  const crewBtns = [0, 1].map((i) => {
    const b = h('button.ch-crew-btn', { type: 'button', 'aria-current': 'false' }, h('span.ch-crew-tag', null, 'you'));
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
    h('div.ch-hud-top', null, h('div.ch-chips', null, coinsChip, timeChip, spotChip, keyChip), obj, h('div.ch-hud-right', null, muteButton(), pauseBtn)),
    h('div.ch-crew', null, crewBtns[0], crewBtns[1], crewKey),
    hint,
    toasts,
  );
  root.appendChild(hud);

  let touch: TouchControls | null = null;
  if (input) {
    touch = createTouchControls(hud, input, { onPress: gesture });
    const autoTouch = () => opts.touch ?? (isCoarsePointer() || input.lastDevice === 'touch');
    const applyTouch = () => {
      const on = autoTouch();
      touch?.setVisible(on);
      root.classList.toggle('ch-touching', on);
    };
    applyTouch();
    const prev = input.onDeviceChange;
    input.onDeviceChange = (d) => {
      prev?.(d);
      if (opts.touch === undefined) {
        const on = d === 'touch' || (d !== 'keyboard' && d !== 'gamepad' && isCoarsePointer());
        touch?.setVisible(on);
        root.classList.toggle('ch-touching', on);
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

  function showHUD(lv: LevelDef, catIds: [string, string]) {
    level = lv;
    totalCoins = lv.coins.length;
    lastState = null;
    lastActive = -1;
    lastCoins = lastSpots = -1;
    lastEventTick = -1;
    crewBtns.forEach((b, i) => {
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
    show('hud');
  }

  function updateHUD(s: SimState) {
    lastState = s;
    if (!level) return;
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
    const ht = activeHint(s, level, root.classList.contains('ch-touching'));
    if (ht) {
      const now = performance.now();
      if (hint.textContent !== ht) {
        hint.textContent = ht;
        hint.classList.remove('ch-on');
        void hint.offsetWidth;
        hintShownAt = now;
      }
      // On narrow portrait screens the hint sits over the play area: let it go after a while.
      const expired = narrowMq?.matches === true && now - hintShownAt > HINT_NARROW_MS;
      hint.classList.toggle('ch-on', !expired);
    } else hint.classList.remove('ch-on');
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
          toast('Spotted!', 'bad');
          flash.classList.remove('ch-go');
          void flash.offsetWidth;
          flash.classList.add('ch-go');
          bump(spotChip);
          announce('Spotted! Back to the checkpoint.');
          break;
        case 'RESCUE':
          toast(`${level?.crate.catName ?? 'Cat'} is free!`, 'good');
          announce(`${level?.crate.catName ?? 'The shelter cat'} is free. Now get both cats to the exit.`);
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

  function announce(text: string) {
    live.textContent = '';
    setTimeout(() => (live.textContent = text), 30);
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
    resumeBtn.focus({ preventScroll: true });
  }
  function hidePause() {
    paused = false;
    pauseModal.classList.remove('ch-on');
  }

  // =========================================================================================
  // Results
  // =========================================================================================
  const resultsBody = h('div.ch-panel.ch-dialog');
  let resultsRun = 0;
  function confetti(): HTMLElement {
    const box = h('div.ch-confetti', { 'aria-hidden': 'true' });
    const cols = ['#ffc93c', '#ff7aa2', '#d5f4e5', '#c4e2fc', '#f0c5fd', '#ee642a', '#fcecbb'];
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
    const run = ++resultsRun;
    const tally: { el: HTMLElement; to: number; fmt: (v: number) => string }[] = [];
    const row = (label: string, to: number, fmt: (v: number) => string, cls = '') => {
      const v = h('td', null, fmt(reduced ? to : 0));
      tally.push({ el: v, to, fmt });
      return h('tr', cls ? { class: cls } : null, h('td', null, label), v);
    };
    const rows = [
      row(`Catnip ${r.coins}/${total} × 10`, sb.coinPoints, (v) => `+${v}`),
      row('Shelter cat rescued', r.rescued ? sb.rescuePoints : 0, (v) => `+${v}`),
      row(`Time ${formatTime(r.ticks)}${par ? ` (par ${formatTime(par)})` : ''}`, sb.timePenalty, (v) => `−${v}`),
      row('Spotted', r.spottedCount, (v) => `${v}×`),
      row('Score', r.score, (v) => String(v), 'ch-total'),
    ];
    rows.forEach((tr, i) => (tr.style.animationDelay = `${0.35 + i * 0.12}s`));
    const table = h('table.ch-score', null, h('tbody', null, ...rows));
    rows[2].lastElementChild?.classList.add('ch-neg');
    const rescue = r.rescued
      ? h('div.ch-rescue', null, crateEntry ? createPortrait(crateEntry, { size: 72, base }) : null, h('p', null, `You rescued ${name}!`, h('small', null, 'Play to save: heists help fund real shelter rescues.'), payoutsUrl ? h('a.ch-payouts', { href: payoutsUrl, target: '_blank', rel: 'noopener' }, 'Every heist funds a real shelter: see payouts') : null))
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
    if (name !== 'hud') {
      pauseModal.classList.remove('ch-on');
      paused = false;
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
    getPickedCats: () => [picked[0], picked[1]],
    get touch() {
      return touch;
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onKeyGesture);
      touch?.dispose();
      diorama?.dispose();
      root.remove();
    },
  };
  return api;
}
