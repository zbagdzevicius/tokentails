/**
 * Collection (GAPS A1): the Treat Track's chest screen and the player's profile shelf. "Pick your next target"
 * chooses the hero whose next reward the next chest holds ("N matches to go"; the order inside each hero is fixed),
 * the champions' "Meet the real cat" postcards show the real cat's card art and a short story, and the track titles
 * and frames can be worn. Free and local: no price, no buy button, no link, and nothing here opens an offer.
 * Copy follows docs/CLAIMS.md: the stories are the cards' own jokes, with no money or impact words.
 */
import type { HeroId } from '../sim/api';
import { championOf } from '../data/heroes/shelter';
import { FRAME_NAME, STORE_TITLE_NAME, isStoreFrame, isTrackFrame } from '../render/cosmetics';
import { TRACK_CHAMPIONS, TRACK_ORIGINALS, TRACK_TITLES, TREAT_STEP, heroTrack, matchesToGo, nextReward, type TreatState } from '../meta/treats';
import { HERO_TEXT } from './heroText';
import { icon } from './icons';
import { openChampInfo } from './champBrowser/open';
import { bookClose, bookTabs, focusTab, isCat, wireTabs } from './passBook';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface CollectionOpts {
  treats: TreatState;
  /** Free unlocks and owned items (a reward in here is collected). */
  owned: ReadonlySet<string>;
  /** The champions' card art from the host (`champions`), when it has arrived. */
  art: Partial<Record<HeroId, string>>;
  /** A hero portrait (the fallback picture of a postcard), or null. */
  portrait(hero: HeroId): string | null;
  wornTitle: string | null;
  wornFrame: string | null;
  onTarget(hero: HeroId | null): void;
  onWear(kind: 'title' | 'frame', id: string | null): void;
  onClose(): void;
  /** STORE-PASS.md §6: the Track's second tab, the Legends Pass (absent: no tab bar). */
  onPass?(): void;
  /** CHAMPION-STORE.md §10: "Champions 9/20", and the Founders roster badge. */
  champions?: { owned: number; total: number; founders: boolean; yarn: number };
}

/** A postcard's story: who the real cat is and the card's own joke (no health details, no money or impact words). */
export function postcardStory(hero: HeroId): string {
  const c = championOf(hero);
  if (!c) return '';
  const flavour = HERO_TEXT[hero].flavour;
  const them = c.pronoun === 'she' ? 'her' : 'him';
  const lead = c.name === c.cardName
    ? `${c.name} is a real Pink Paw cat. This champion is drawn from ${them}.`
    : `${c.name} is based on ${c.cardName}, a real Pink Paw cat. This champion is drawn from ${them}.`;
  return `${lead}${flavour ? ` ${flavour}` : ''}`;
}

/** "about N matches to go" (1: "1 match"). */
export const toGoText = (n: number): string => `about ${n} ${n === 1 ? 'match' : 'matches'} to go`;

export function collectionPanel(parent: HTMLElement, o: CollectionOpts): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-collection pl-book';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Treat Track');
  const s = { target: o.treats.target, title: o.wornTitle, frame: o.wornFrame };
  const cats = [...TRACK_ORIGINALS, ...TRACK_CHAMPIONS].filter(isCat);
  const dogs = TRACK_ORIGINALS.filter((h) => !isCat(h));
  let rowScroll = 0;
  const render = (): void => {
    // a re-render (a target or a worn item picked) keeps the book's scroll and the focused control
    const bodyTop = root.querySelector('.bk-body')?.scrollTop ?? 0;
    const f = document.activeElement as HTMLElement | null;
    const refocus = f && root.contains(f) ? (f.dataset.target !== undefined ? `[data-target="${f.dataset.target}"]` : f.dataset.wear ? `[data-wear="${f.dataset.wear}"][data-id="${f.dataset.id ?? ''}"]` : null) : null;
    const next = nextReward(o.owned, s.target, o.treats.chests);
    const n = matchesToGo(o.treats);
    const fill = Math.round((100 * (Math.max(0, o.treats.xp) % TREAT_STEP)) / TREAT_STEP);
    // Target chooser: portrait medallions in one scrolling row, cats then dogs (Track order first)
    const medal = (h: HeroId): string => {
      const t = heroTrack(h, o.owned);
      const done = t.have >= t.total && !t.next;
      const sub = done ? 'All' : `${t.have}/${t.total}`;
      const pic = o.portrait(h);
      const face = pic ? `<img src="${esc(pic)}" alt="" loading="lazy" decoding="async" draggable="false">` : icon(isCat(h) ? 'paw' : 'bone');
      const label = `${HERO_TEXT[h].title}, ${done ? 'all collected' : `${t.have} of ${t.total} collected`}`;
      return `<button type="button" class="target md${s.target === h ? ' on' : ''}${done ? ' done' : ''}" data-target="${h}" aria-pressed="${s.target === h}" aria-label="${esc(label)}"><span class="md-ring"><span class="md-face">${face}</span></span><b>${esc(HERO_TEXT[h].title)}</b><small>${sub}</small></button>`;
    };
    const card = (h: HeroId, i: number): string => {
      const c = championOf(h);
      if (!c) return '';
      const have = o.owned.has(`postcard.${h}`);
      if (!have)
        return `<div class="postcard locked" data-postcard="${h}" style="--i:${i}"><span class="pic sealed" role="img" aria-label="A sealed postcard"></span><b>${esc(c.cardName)}</b><small>Earn ${esc(c.name)}'s real-cat postcard on the Treat Track.</small></div>`;
      const pic = o.art[h] ?? o.portrait(h);
      const img = pic ? `<img src="${esc(pic)}" alt="${esc(c.cardName)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : `<span class="pic">${icon('paw')}</span>`;
      return `<div class="postcard" data-postcard="${h}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(`${c.cardName}: meet the real cat`)}"><span class="pc-photo">${img}<span class="stamp" aria-hidden="true">${icon('paw')}</span></span><b>${esc(c.cardName)}</b><small>${esc(postcardStory(h))}</small></div>`;
    };
    // Treat Track titles and frames, plus store and Legends Pass ones the account owns (STORE-PASS.md §4)
    const titles = [...Object.keys(TRACK_TITLES), ...Object.keys(STORE_TITLE_NAME)].filter((id) => o.owned.has(id));
    const frames = Object.keys(FRAME_NAME).filter((id) => (isTrackFrame(id) || isStoreFrame(id)) && o.owned.has(id));
    const wearRow = (kind: 'title' | 'frame', ids: string[], name: (id: string) => string, on: string | null): string =>
      ids.length
        ? `<div class="set-row"><span class="lbl">${kind === 'title' ? 'Title' : 'Frame'}</span><span class="chips"><button type="button" class="chip bk-chip ${on === null ? 'on' : ''}" data-wear="${kind}" data-id="">None</button>${ids
            .map((id) => `<button type="button" class="chip bk-chip ${on === id ? 'on' : ''}" data-wear="${kind}" data-id="${esc(id)}"${kind === 'frame' ? ` data-frame="${esc(id)}"` : ''}>${esc(name(id))}</button>`)
            .join('')}</span></div>`
        : '';
    // the storybook path: the chest just opened, the next chest (its art and the bar), and the three after it
    const c0 = o.treats.chests;
    const stop = (k: number, cls: string): string => `<span class="tp-stop ${cls}" aria-hidden="true"><i></i><em>${k}</em></span>`;
    const path = `${c0 > 0 ? stop(c0, 'done') : ''}<span class="tp-now"><span class="tp-chest" aria-hidden="true"></span><span class="tp-num" aria-hidden="true">${c0 + 1}</span></span>${stop(c0 + 2, 'ahead')}${stop(c0 + 3, 'ahead')}${stop(c0 + 4, 'ahead')}`;
    // Audit UX-10: a corner ✕ and a fixed Done (the exit never scrolls away); only the book body scrolls
    const tabs = o.onPass ? bookTabs('track', 'Treat Track and Legends Pass') : '<h2 class="bk-h">Treat Track</h2>';
    root.innerHTML = `<div class="card bk-card">${bookClose('Treat Track')}<div class="bk-head">${tabs}</div>
      <div class="bk-body">
      <section class="bk-page tp">
        <div class="tp-path">${path}</div>
        <div class="tp-info">
          <p class="next-chest" data-next="${esc(next.id)}"><span class="kick">Next chest</span><b>${esc(next.name)}</b></p>
          <span class="tp-bar" role="progressbar" aria-label="Treat XP to the next chest" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}"><i style="width:${fill}%"></i><span class="gem" style="left:${fill}%"></span></span>
          <small data-togo="${n}">${esc(toGoText(n))}</small>
        </div>
      </section>
      <p class="champs-row"><button type="button" class="bk-pill" data-a="champions" aria-haspopup="dialog">${icon('spell')}Champions: skills &amp; lore</button>${o.champions ? `<small class="champ-count" data-champs="${o.champions.owned}">Champions ${o.champions.owned}/${o.champions.total} · ${o.champions.yarn.toLocaleString('en-US')} Yarn${o.champions.founders ? ' · <b class="founders-badge">Founders roster</b>' : ''}</small>` : ''}</p>
      <h3 class="bk-h3">Pick your next target</h3>
      <div class="targets"><div class="md-row" role="group" aria-label="Pick your next target"><button type="button" class="target md order${s.target === null ? ' on' : ''}" data-target="" aria-pressed="${s.target === null}" aria-label="Track order, any hero"><span class="md-ring"><span class="md-face">${icon('arrows')}</span></span><b>Track order</b><small>Any hero</small></button><span class="grp" aria-hidden="true">Cats</span>${cats.map(medal).join('')}<span class="grp dog" aria-hidden="true">Dogs</span>${dogs.map(medal).join('')}</div></div>
      <h3 class="bk-h3">Meet the real cat</h3>
      <div class="postcards">${TRACK_CHAMPIONS.map(card).join('')}</div>
      ${titles.length || frames.length ? `<h3 class="bk-h3">Wear</h3>${wearRow('title', titles, (id) => TRACK_TITLES[id] ?? STORE_TITLE_NAME[id] ?? id, s.title)}${wearRow('frame', frames, (id) => FRAME_NAME[id] ?? id, s.frame)}` : ''}
      <p class="fine">Free, earned by playing. Rewards come in a fixed order.</p>
      </div>
      <div class="bk-foot"><button type="button" class="bk-done" data-a="close">Done</button></div></div>`;
    const row = root.querySelector<HTMLElement>('.md-row');
    if (row) {
      row.scrollLeft = rowScroll;
      row.addEventListener('scroll', () => (rowScroll = row.scrollLeft), { passive: true });
    }
    const body = root.querySelector<HTMLElement>('.bk-body');
    if (body) body.scrollTop = bodyTop;
    if (refocus) root.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
  };
  render();
  wireTabs(root);
  root.addEventListener('keydown', (e) => {
    const pc = (e.target as HTMLElement).closest?.('.postcard[role="button"]');
    if (pc && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      (pc as HTMLElement).click();
    }
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    // champion browser: every champion's skills and lore; a postcard opens its champion on Lore
    if (t.closest('[data-a="pass"]') && o.onPass) {
      close();
      o.onPass();
      return;
    }
    if (t.closest('[data-a="champions"]')) {
      void openChampInfo({ hero: s.target ?? 'clem', within: root });
      return;
    }
    const pc = t.closest<HTMLElement>('.postcard:not(.locked)')?.dataset.postcard as HeroId | undefined;
    if (pc) {
      void openChampInfo({ hero: pc, tab: 'lore', within: root });
      return;
    }
    const tg = t.closest<HTMLElement>('[data-target]');
    const wear = t.closest<HTMLElement>('[data-wear]');
    if (tg) {
      s.target = (tg.dataset.target || null) as HeroId | null;
      o.onTarget(s.target);
    } else if (wear) {
      const kind = wear.dataset.wear as 'title' | 'frame';
      const id = wear.dataset.id || null;
      if (kind === 'title') s.title = id;
      else s.frame = id;
      o.onWear(kind, id);
    } else if (t.closest('[data-a="close"], [data-a="x"]') || t === root) {
      close();
      return;
    } else return;
    render();
  });
  // Audit UX-10: Esc closes the Treat Track too (Settings already did)
  const close = (): void => {
    if (!root.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    o.onClose();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) {
      document.removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.key !== 'Escape') return;
    // the champion browser over the Treat Track closes first (its own Esc)
    if (document.querySelector('.pl-champ')) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  document.addEventListener('keydown', onKey, true);
  parent.appendChild(root);
  focusTab(root);
  return root;
}
