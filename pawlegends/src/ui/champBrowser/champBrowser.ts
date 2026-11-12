/**
 * Champion browser (a MOBA champion page, sized for a phone held sideways): one champion at a time with its portrait,
 * name, epithet, side, role, attack type and difficulty; ‹ › arrows, a horizontal swipe or the arrow keys move to the
 * next champion (wrapping). Two tabs:
 *
 * - Skills: a row of skill buttons (passive, basic attack, Q, W, E, R). A tap plays that skill's clip at once (the live
 *   sim sandbox of ui/preview/skillPreview.ts, one canvas for the whole browser) and shows its card: what it does,
 *   tags, the numbers from the hero data, a tip and how to play against it. Q plays on open. The passive and the
 *   basic attack have no clip: a still of the hero and the icon.
 * - Lore: the hook, the bio, the rival and the friend (a tap jumps to that champion), the quote, how they fight, and
 *   the world (The Truce Games).
 *
 * Opened from the "i" on a pick card, the detail's "Skills & lore" button, the party pick, the collection and the
 * lobby. Home's Heroes and its nameplate pass `action`: one button under the description, SELECT (the Home hero and the
 * champion select's first pick; the browser stays open), SELECTED, BUY (web: the store's champion detail) or UNLOCK (app:
 * the same detail with Yarn and Champion Picks only). `pick` adds a Select button (the picker's own rule says whether a hero can be picked now). Nothing here is on
 * the quick Play path: the browser opens only when asked and closes with ✕, Esc, Select or a tap outside on desktop.
 *
 * Keyboard: ← → champions (inside a tab list they move that list, as the ARIA pattern says), P / A / Q W E R the
 * skills, L the Lore tab, Esc closes. Focus moves into the dialog on open and back to the opener on close.
 */
import type { Look } from '../../render/cosmetics';
import './champBrowser.css';
import type { HeroId } from '../../data/heroes/types';
import { HEROES } from '../../data/heroes';
import { HERO_COLOR_CSS } from '../../render/palette';
import { portraitUrl } from '../../render/portraits';
import { WORLD, bioParagraphs, loreOf } from '../../data/lore';
import { heroCodex, type HeroCodex, type SkillSlot } from '../skillCodex';
import { icon } from '../icons';
import { HERO_TEXT } from '../heroText';
import { cardIcon, esc, skillCardHtml, slotKey } from './cardView';
import { BROWSE_ORDER, DIFFICULTY_NAME, HERO_DIFFICULTY, stepHero } from './meta';
import { setChampCovered } from './cover';

export type BrowserTab = 'skills' | 'lore';
type ClipSlot = 'q' | 'w' | 'e' | 'r';

/** The part of the preview player the browser drives (ui/preview/skillPreview.ts `SkillPreview`). */
export interface ClipPlayer {
  readonly ready: Promise<void>;
  play(): void;
  stop(): void;
  set(hero: HeroId, slot: ClipSlot): Promise<void>;
  dispose(): void;
}
export type ClipFactory = (el: HTMLElement, hero: HeroId, slot: ClipSlot) => ClipPlayer | Promise<ClipPlayer>;

export interface ChampPick {
  /** The button's word ("Select", "Hover"). */
  label?: string;
  /** '' when `h` can be picked now, else why not (shown under the disabled button). */
  can(h: HeroId): string;
  on(h: HeroId): void;
}

/**
 * Home's hero button (Nov 12, the founder: "add SELECT / BUY as a button in here"): what the button under the
 * description does for a hero. 'select': a playable hero that is not the Home hero yet; 'selected': it already is
 * (shown, not pressable); 'buy' (web) and 'unlock' (app: Yarn or a Champion Pick, no price): a locked hero; 'none':
 * no button (a locked hero the app does not offer, or no store here). Never starts a match.
 */
export type HeroActionState = 'select' | 'selected' | 'buy' | 'unlock' | 'none';
export interface HeroAction {
  state(h: HeroId): HeroActionState;
  /** 'select' runs with the browser still open (the button turns SELECTED); 'buy' and 'unlock' close it first. */
  on(h: HeroId, kind: 'select' | 'buy' | 'unlock'): void;
}
export const ACTION_WORD: Readonly<Record<Exclude<HeroActionState, 'none'>, string>> = Object.freeze({ select: 'SELECT', selected: 'SELECTED', buy: 'BUY', unlock: 'UNLOCK' });

export interface ChampBrowserOpts {
  hero: HeroId;
  /** The heroes the arrows walk (default: all, cats then dogs). A jump to a rival outside it still shows. */
  order?: readonly HeroId[];
  tab?: BrowserTab;
  /** The skill shown first (default Q, which auto-plays). */
  slot?: SkillSlot;
  pick?: ChampPick;
  /** Home's SELECT / BUY / UNLOCK button under the description (Home's Heroes and the nameplate). */
  action?: HeroAction;
  /** Called after every champion change (the lobby turns its stage hero, for example). */
  onBrowse?(h: HeroId): void;
  onClose?(): void;
  /** Where the dialog goes (default document.body). */
  parent?: HTMLElement;
  /** The browser closes itself when this element leaves the page (the screen that opened it was torn down). */
  within?: HTMLElement | null;
  /** The clip player; null = no clips (the still shows). Default: the live preview, loaded lazily. */
  clips?: ClipFactory | null;
  /** The hero's portrait (default: the baked portrait cache). */
  portrait?(h: HeroId): string | null;
  /** CARD-SKINS.md: the look a hero's clip wears (the player's card skin or coat), so the clip shows its skin effects. */
  look?(h: HeroId): Look | null;
}

export interface ChampBrowser {
  readonly root: HTMLElement;
  hero(): HeroId;
  slot(): SkillSlot;
  tab(): BrowserTab;
  show(h: HeroId, slot?: SkillSlot): void;
  setSlot(s: SkillSlot): void;
  setTab(t: BrowserTab): void;
  close(): void;
  /** True until closed. */
  readonly open: boolean;
}

const clipsWith =
  (look?: (h: HeroId) => Look | null): ClipFactory =>
  async (el, hero, slot) => {
    const { mountSkillPreview } = await import('../preview/skillPreview');
    return mountSkillPreview(el, hero, slot, { autoplay: true, ...(look ? { look } : {}) });
  };

const isClip = (s: SkillSlot): s is ClipSlot => s === 'q' || s === 'w' || s === 'e' || s === 'r';
const SLOT_KEYS: Readonly<Record<string, SkillSlot>> = { p: 'passive', a: 'basic', q: 'q', w: 'w', e: 'e', r: 'r' };
/** A swipe: this far sideways (px), mostly sideways, inside this time (ms). */
export const SWIPE = Object.freeze({ px: 56, ratio: 1.5, ms: 700 });

let current: ChampBrowser | null = null;
/** The open browser, if any (one at a time). */
export const openBrowser = (): ChampBrowser | null => (current?.open ? current : null);

export function openChampBrowser(o: ChampBrowserOpts): ChampBrowser {
  current?.close();
  const order = o.order?.length ? o.order : BROWSE_ORDER;
  const portrait = o.portrait ?? ((h: HeroId) => portraitUrl(h));
  const clipFactory = o.clips === undefined ? clipsWith(o.look ? (h) => o.look!(h) : undefined) : o.clips;
  const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  let hero = o.hero;
  let slot: SkillSlot = o.slot ?? 'q';
  let tab: BrowserTab = o.tab ?? 'skills';
  let codex: HeroCodex = heroCodex(hero);
  let open = true;
  let world = false;

  const root = document.createElement('div');
  root.className = 'pl-champ';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  root.innerHTML = `<div class="cb-panel">
    <section class="cb-hero" aria-live="polite"></section>
    <section class="cb-main">
      <div class="cb-tabs" role="tablist" aria-label="Champion pages">
        <button type="button" class="cb-tab" role="tab" data-tab="skills" id="cb-tab-skills" aria-controls="cb-skills">Skills</button>
        <button type="button" class="cb-tab" role="tab" data-tab="lore" id="cb-tab-lore" aria-controls="cb-lore">Lore</button>
      </div>
      <button type="button" class="cb-x" data-a="close" aria-label="Close">✕</button>
      <div class="cb-skills" id="cb-skills" role="tabpanel" aria-labelledby="cb-tab-skills">
        <div class="cb-icons" role="tablist" aria-label="Skills"></div>
        <div class="cb-skill">
          <div class="cb-clip" data-a="clip">
            <div class="cb-clip-host"></div>
            <div class="cb-still" aria-hidden="true"></div>
            <span class="cb-clip-state" aria-hidden="true"></span>
          </div>
          <article class="cb-card" aria-live="polite"></article>
        </div>
      </div>
      <div class="cb-lore" id="cb-lore" role="tabpanel" aria-labelledby="cb-tab-lore" tabindex="0"></div>
    </section>
  </div>`;
  const q = <T extends HTMLElement>(s: string): T => root.querySelector(s) as T;
  const heroEl = q('.cb-hero');
  const iconsEl = q('.cb-icons');
  const cardEl = q('.cb-card');
  const clipEl = q('.cb-clip');
  const clipHost = q('.cb-clip-host');
  const stillEl = q('.cb-still');
  const loreEl = q('.cb-lore');
  const skillsEl = q('.cb-skills');

  // ------------------------------------------------------------------------------------------------- the clip
  let player: ClipPlayer | null = null;
  /** What the player shows now (set on mount and on every `set`). */
  let playerAt = '';
  let playerLoading: Promise<ClipPlayer | null> | null = null;
  let clipPaused = false;
  let clipFailed = clipFactory === null;
  const setClipState = (s: 'loading' | 'playing' | 'paused' | 'none' | 'off'): void => {
    root.dataset.clip = s;
    clipEl.setAttribute('aria-label', s === 'playing' ? 'Pause the skill preview' : s === 'paused' ? 'Play the skill preview' : '');
  };
  const ensurePlayer = (h: HeroId, s: ClipSlot): Promise<ClipPlayer | null> => {
    if (player) return Promise.resolve(player);
    if (clipFailed || !clipFactory) return Promise.resolve(null);
    playerLoading ??= Promise.resolve()
      .then(() => (open ? clipFactory(clipHost, h, s) : null))
      .then((p) => {
        if (!p) return null;
        if (!open) {
          p.dispose();
          return null;
        }
        player = p;
        playerAt = `${h}:${s}`;
        return p;
      })
      .catch(() => {
        clipFailed = true;
        return null;
      });
    return playerLoading;
  };
  /** Show the clip (or the still) for the current hero and slot. A newer call wins over an older one still loading. */
  let clipSeq = 0;
  const syncClip = (): void => {
    const seq = ++clipSeq;
    const h = hero;
    const s = slot;
    const wantClip = tab === 'skills' && isClip(s) && !clipFailed;
    stillHtml(h, s);
    if (!wantClip) {
      player?.stop();
      setClipState(isClip(s) && clipFailed ? 'off' : 'none');
      return;
    }
    setClipState('loading');
    void ensurePlayer(h, s).then(async (p) => {
      if (!p || seq !== clipSeq || !open) {
        if (!p && seq === clipSeq && open) setClipState('off');
        return;
      }
      try {
        const want = `${h}:${s}`;
        if (playerAt !== want) {
          playerAt = want;
          await p.set(h, s);
        } else await p.ready;
      } catch {
        clipFailed = true;
        if (seq === clipSeq) setClipState('off');
        return;
      }
      if (seq !== clipSeq || !open) return;
      if (clipPaused) {
        p.stop();
        setClipState('paused');
      } else {
        p.play();
        setClipState('playing');
      }
    });
  };
  const stillHtml = (h: HeroId, s: SkillSlot): void => {
    const card = codex.cards.find((c) => c.slot === s);
    const pic = portrait(h);
    stillEl.innerHTML = `<span class="cb-still-pic"${pic ? ` style="background-image:url(${esc(pic)})"` : ''}></span><span class="cb-still-ico">${card ? icon(cardIcon(card, codex.attack === 'Ranged')) : ''}</span><small>${s === 'passive' ? 'Always on' : s === 'basic' ? `${codex.attack} basic attack` : 'Preview unavailable'}</small>`;
  };

  // ------------------------------------------------------------------------------------------------- drawing
  const drawHero = (): void => {
    const x = codex;
    const l = loreOf(hero);
    const d = HERO_DIFFICULTY[hero];
    const pic = portrait(hero);
    const side = HEROES[hero].side;
    const i = order.indexOf(hero);
    const blocked = o.pick ? o.pick.can(hero) : '';
    root.style.setProperty('--hero', HERO_COLOR_CSS[hero]);
    root.dataset.hero = hero;
    root.dataset.side = side;
    root.setAttribute('aria-label', `${x.title}: skills and lore`);
    heroEl.innerHTML = `
      <div class="cb-face">
        <button type="button" class="cb-nav cb-prev" data-a="prev" aria-label="Previous champion">‹</button>
        <span class="cb-portrait${pic ? '' : ' none'}"${pic ? ` style="background-image:url(${esc(pic)})"` : ''}>${pic ? '' : esc(x.title.replace('Sir ', '').slice(0, 2))}</span>
        <button type="button" class="cb-nav cb-next" data-a="next" aria-label="Next champion">›</button>
      </div>
      <div class="cb-id">
        <h2 class="cb-name">${esc(x.title)}</h2>
        <p class="cb-epithet">${esc(l.epithet)}</p>
        <ul class="cb-chips">
          <li class="side ${side}">${icon(side === 'cat' ? 'paw' : 'bone')}${side === 'cat' ? 'Cat' : 'Dog'}</li>
          <li class="role" data-role="${esc(x.role)}">${esc(x.role)}</li>
          <li class="atk">${esc(x.attack)}</li>
          <li class="diff" data-d="${d}" aria-label="Difficulty: ${DIFFICULTY_NAME[d]}"><span class="pips" aria-hidden="true">${'<i class="on"></i>'.repeat(d)}${'<i></i>'.repeat(3 - d)}</span>${DIFFICULTY_NAME[d]}</li>
        </ul>
        <p class="cb-hook">${esc(l.hook)}</p>
      </div>
      ${actionHtml()}
      <p class="cb-count" aria-hidden="true">${i >= 0 ? `${i + 1} / ${order.length}` : ''}</p>
      ${o.pick ? `<div class="cb-pick"><button type="button" class="pl-btn big cb-select" data-a="select"${blocked ? ' disabled aria-disabled="true"' : ''}>${esc(o.pick.label ?? 'Select')}</button>${blocked ? `<small class="cb-why">${esc(blocked)}</small>` : ''}</div>` : ''}`;
  };

  const actionHtml = (): string => {
    const st = o.action?.state(hero) ?? 'none';
    if (st === 'none') return '';
    const t = HERO_TEXT[hero]?.title ?? hero;
    const label = st === 'select' ? `Select ${t} as your hero` : st === 'selected' ? `${t} is your hero` : st === 'buy' ? `Buy ${t} in the store` : `Unlock ${t}`;
    return `<div class="cb-act"><button type="button" class="pl-btn big cb-act-btn" data-a="act" data-act="${st}" data-testid="hero-action"${st === 'selected' ? ' aria-disabled="true"' : ''} aria-label="${esc(label)}">${ACTION_WORD[st]}</button></div>`;
  };

  const drawIcons = (): void => {
    iconsEl.innerHTML = codex.cards
      .map((c) => {
        const on = c.slot === slot;
        return `<button type="button" class="cb-skill-btn${c.slot === 'r' ? ' ult' : ''}${on ? ' on' : ''}" role="tab" data-slot="${c.slot}" aria-selected="${on}" tabindex="${on ? 0 : -1}" aria-label="${esc(`${c.kind}${c.key ? ` ${c.key}` : ''}: ${c.name}`)}" title="${esc(c.name)}"><span class="ico">${icon(cardIcon(c, codex.attack === 'Ranged'))}</span><kbd>${esc(slotKey(c))}</kbd></button>`;
      })
      .join('');
  };

  const drawCard = (): void => {
    const card = codex.cards.find((c) => c.slot === slot) ?? codex.cards[0];
    if (!card) return;
    cardEl.innerHTML = skillCardHtml(card, { ranged: codex.attack === 'Ranged' });
    cardEl.dataset.slot = card.slot;
    cardEl.scrollTop = 0;
  };

  const linkHtml = (rel: 'rival' | 'friend', h: HeroId, line: string): string => {
    const pic = portrait(h);
    const t = HERO_TEXT[h].title;
    return `<button type="button" class="cb-link ${rel}" data-rel="${rel}" data-h="${h}" style="--to:${HERO_COLOR_CSS[h]}" aria-label="${esc(`${rel === 'rival' ? 'Rival' : 'Friend'}: ${t}. Open ${t}`)}"><span class="cb-link-pic"${pic ? ` style="background-image:url(${esc(pic)})"` : ''}></span><span class="cb-link-t"><small>${rel === 'rival' ? 'Rival' : 'Friend'}</small><b>${esc(t)}</b><span>${esc(line)}</span></span><span class="cb-link-go" aria-hidden="true">›</span></button>`;
  };

  const drawLore = (): void => {
    const l = loreOf(hero);
    const bio = bioParagraphs(hero)
      .map((p) => `<p>${esc(p)}</p>`)
      .join('');
    const worldHtml = `<div class="cb-world"${world ? '' : ' hidden'}><h4>${esc(WORLD.title)}</h4><p class="cb-tagline">${esc(WORLD.tagline)}</p>${WORLD.story.map((p) => `<p>${esc(p)}</p>`).join('')}<dl class="cb-places">${WORLD.places.map((p) => `<div><dt>${esc(p.name)}</dt><dd>${esc(p.text)}</dd></div>`).join('')}</dl></div>`;
    // the hook is in the champion column, which stays beside this tab: the tab opens on the quote
    loreEl.innerHTML = `
      <blockquote class="cb-quote">“${esc(l.quote)}”</blockquote>
      <div class="cb-bio">${bio}</div>
      <div class="cb-links">${linkHtml('rival', l.rival.hero, l.rival.line)}${linkHtml('friend', l.friend.hero, l.friend.line)}</div>
      <p class="cb-fight"><b>How ${esc(codex.title.replace('Sir ', ''))} fights</b> ${esc(l.howTheyFight)}</p>
      <p class="cb-home">${icon(HEROES[hero].side === 'cat' ? 'paw' : 'bone')}Home: ${esc(l.home)}</p>
      <button type="button" class="pl-btn ghost small cb-world-btn" data-a="world" aria-expanded="${world}">${world ? 'Hide the world' : `The world: ${esc(WORLD.title)}`}</button>
      ${worldHtml}`;
    loreEl.scrollTop = 0;
  };

  const drawTabs = (): void => {
    for (const b of root.querySelectorAll<HTMLElement>('.cb-tab')) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    skillsEl.hidden = tab !== 'skills';
    loreEl.hidden = tab !== 'lore';
    root.dataset.tab = tab;
  };

  const drawAll = (): void => {
    drawHero();
    drawTabs();
    drawIcons();
    drawCard();
    drawLore();
    root.dataset.skill = slot;
    syncClip();
  };

  // ------------------------------------------------------------------------------------------------- actions
  const api: ChampBrowser = {
    root,
    get open() {
      return open;
    },
    hero: () => hero,
    slot: () => slot,
    tab: () => tab,
    show(h: HeroId, s?: SkillSlot) {
      if (!open || !HEROES[h]) return;
      const changed = h !== hero;
      hero = h;
      codex = heroCodex(h);
      if (s) slot = s;
      else if (changed && !isClip(slot)) slot = 'q';
      world = false;
      drawAll();
      if (changed) o.onBrowse?.(h);
    },
    setSlot(s: SkillSlot) {
      if (!open) return;
      slot = s;
      if (tab !== 'skills') {
        tab = 'skills';
        drawTabs();
      }
      // a tap on a skill always plays it (also after a pause)
      clipPaused = false;
      drawIcons();
      drawCard();
      root.dataset.skill = slot;
      syncClip();
    },
    setTab(t: BrowserTab) {
      if (!open || t === tab) return;
      tab = t;
      drawTabs();
      syncClip();
    },
    close() {
      if (!open) return;
      open = false;
      clipSeq++;
      document.removeEventListener('keydown', onKey, true);
      clearInterval(watch);
      player?.dispose();
      player = null;
      root.remove();
      if (current === api) current = null;
      if (!current) setChampCovered(false);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
      o.onClose?.();
    },
  };

  const step = (n: number): void => api.show(stepHero(order, hero, n));

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const s = t.closest<HTMLElement>('[data-slot]')?.dataset.slot as SkillSlot | undefined;
    const tb = t.closest<HTMLElement>('.cb-tab')?.dataset.tab as BrowserTab | undefined;
    const link = t.closest<HTMLElement>('.cb-link')?.dataset.h as HeroId | undefined;
    if (swiped) {
      swiped = false;
      return;
    }
    if (t === root) return api.close();
    if (s) return api.setSlot(s);
    if (tb) return api.setTab(tb);
    if (link) {
      api.show(link);
      root.querySelector<HTMLElement>('.cb-tab.on')?.focus({ preventScroll: true });
      return;
    }
    switch (a) {
      case 'close':
        return api.close();
      case 'prev':
        return step(-1);
      case 'next':
        return step(1);
      case 'select': {
        if (!o.pick || o.pick.can(hero)) return;
        const h = hero;
        api.close();
        o.pick.on(h);
        return;
      }
      case 'act': {
        if (!o.action) return;
        const h = hero;
        const st = o.action.state(h);
        if (st === 'select') {
          o.action.on(h, 'select');
          // the browser stays: the button turns SELECTED and keeps the focus
          if (!open) return;
          drawHero();
          root.querySelector<HTMLElement>('.cb-act-btn')?.focus({ preventScroll: true });
        } else if (st === 'buy' || st === 'unlock') {
          api.close();
          o.action.on(h, st);
        }
        return;
      }
      case 'world':
        world = !world;
        drawLore();
        if (world) root.querySelector('.cb-world')?.scrollIntoView({ block: 'start' });
        return;
      case 'clip':
        if (!player || !isClip(slot)) return;
        clipPaused = !clipPaused;
        if (clipPaused) {
          player.stop();
          setClipState('paused');
        } else {
          player.play();
          setClipState('playing');
        }
        return;
    }
  });

  // a horizontal swipe moves to the next / previous champion (vertical drags scroll the text as usual)
  let sw: { id: number; x: number; y: number; t: number } | null = null;
  let swiped = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  root.addEventListener('pointerup', (e) => {
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    const dt = performance.now() - sw.t;
    sw = null;
    if (Math.abs(dx) >= SWIPE.px && Math.abs(dx) > Math.abs(dy) * SWIPE.ratio && dt <= SWIPE.ms) {
      swiped = true;
      // the click a touch release makes comes right after; it is eaten above, then the flag clears itself
      setTimeout(() => (swiped = false), 400);
      step(dx < 0 ? 1 : -1);
    }
  });
  root.addEventListener('pointercancel', () => (sw = null));

  const onKey = (e: KeyboardEvent): void => {
    if (!open) return;
    if (!root.isConnected) return api.close();
    const k = e.key;
    const inIcons = (e.target as HTMLElement | null)?.closest?.('.cb-icons');
    const inTabs = (e.target as HTMLElement | null)?.closest?.('.cb-tabs');
    const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (k === 'Escape') api.close();
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && inIcons) {
      const slots = codex.cards.map((c) => c.slot);
      const i = slots.indexOf(slot);
      api.setSlot(slots[(i + (k === 'ArrowLeft' ? -1 : 1) + slots.length) % slots.length] as SkillSlot);
      root.querySelector<HTMLElement>('.cb-skill-btn.on')?.focus();
    } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && inTabs) {
      api.setTab(tab === 'skills' ? 'lore' : 'skills');
      root.querySelector<HTMLElement>('.cb-tab.on')?.focus();
    } else if (k === 'ArrowLeft') step(-1);
    else if (k === 'ArrowRight') step(1);
    else if (k.length === 1 && SLOT_KEYS[k.toLowerCase()]) api.setSlot(SLOT_KEYS[k.toLowerCase()] as SkillSlot);
    else if (k === 'l' || k === 'L') api.setTab('lore');
    else if (k === 'Tab') {
      // keep focus inside the dialog
      const f = [...root.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]')].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!f.length) return;
      const first = f[0] as HTMLElement;
      const last = f[f.length - 1] as HTMLElement;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) last.focus();
      else if (!e.shiftKey && document.activeElement === last) first.focus();
      else used = false;
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', onKey, true);
  // the screen that opened the browser was torn down (a match started, the party moved on): close with it
  const watch = setInterval(() => {
    if (o.within && !o.within.isConnected) api.close();
  }, 400);

  (o.parent ?? document.body).appendChild(root);
  setChampCovered(true);
  current = api;
  drawAll();
  root.dataset.ready = '1';
  // the first focus: the selected skill (Skills) or the tab (Lore), so the arrow keys work at once
  (tab === 'skills' ? root.querySelector<HTMLElement>('.cb-skill-btn.on') : root.querySelector<HTMLElement>('.cb-tab.on'))?.focus({ preventScroll: true });
  return api;
}
