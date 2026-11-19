/**
 * Collection (GAPS A1): the Treat Track's chest screen. The chest path and bar, "Next reward for" (the hero whose next
 * reward the next chest holds; the order inside each hero is fixed) and the champions' "Meet the real cat" postcards
 * (the real cat's photo, the splash art while it cannot load, and a short story). Founder, Nov 19 ("each thing should
 * serve its own purpose"): nothing here is worn or browsed. Titles and frames are worn in Profile only; a title or
 * frame the track just gave shows one "Wear it" link that opens Profile's Collection. No champion or history buttons
 * (Champions and Profile > Matches own those). Free and local: no price, no buy button, and nothing here opens an offer.
 * Copy follows docs/CLAIMS.md: the stories are the cards' own jokes, with no money or impact words.
 */
import type { HeroId } from '../sim/api';
import { championOf } from '../data/heroes/shelter';
import { TRACK_CHAMPIONS, TRACK_ORIGINALS, TREAT_REWARDS, TREAT_STEP, heroTrack, matchesToGo, nextReward, type TreatReward, type TreatState } from '../meta/treats';
import { HERO_TEXT } from './heroText';
import { icon } from './icons';
import { openChampInfo } from './champBrowser/open';
import { bookClose, bookTabs, focusTab, isCat, wireTabs } from './passBook';
import { splashUrl } from './champStore/model';
import { installArtFallback, realPhotoImgAttrs } from './art';
// gaps4 first-load JS: the line lives in ui/screens.ts (first load), so the results never pull this panel in
import { toGoText } from './screens';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface CollectionOpts {
  treats: TreatState;
  /** Free unlocks and owned items (a reward in here is collected). */
  owned: ReadonlySet<string>;
  /** The champions' card art from the host (`champions`). Unused: the game shows no Token Tails art; postcards use the real photo. */
  art: Partial<Record<HeroId, string>>;
  /** A hero portrait (the fallback picture of a postcard), or null. */
  portrait(hero: HeroId): string | null;
  /** What the player wears now (the "Wear it" link hides once the new title or frame is worn). */
  wornTitle: string | null;
  wornFrame: string | null;
  onTarget(hero: HeroId | null): void;
  /** "Wear it": open Profile's Collection, the one place a title or frame is worn (absent: no link). */
  onWearIt?(): void;
  onClose(): void;
  /** STORE-PASS.md §6: the Track's second tab, the Legends Pass (absent: no tab bar). */
  onPass?(): void;
}

const SEEN_KEY = 'tt.pawlegends.wearhint.v1';

/** The wear hint already shown for this id (per device; storage can be blocked, then it shows again). */
export function wearHintSeen(id: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

export function markWearHintSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, id);
  } catch {
    /* blocked */
  }
}

/**
 * The title or frame the track gave last (the latest one in track order the player owns), when it is not worn: the
 * one "Wear it" link. Null when none is owned or the newest is already worn. Pure.
 */
export function newWearable(owned: ReadonlySet<string>, worn: { title: string | null; frame: string | null }): TreatReward | null {
  let last: TreatReward | null = null;
  for (const r of TREAT_REWARDS) if ((r.kind === 'title' || r.kind === 'frame') && owned.has(r.id)) last = r;
  if (!last) return null;
  return (last.kind === 'title' ? worn.title : worn.frame) === last.id ? null : last;
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
export { toGoText };

export function collectionPanel(parent: HTMLElement, o: CollectionOpts): HTMLElement {
  installArtFallback();
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-collection pl-book';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Treat Track');
  const s = { target: o.treats.target };
  // "Wear it" shows for a new title or frame until the panel closes once with it on screen (Done, ✕, Esc or the link)
  const fresh = o.onWearIt ? newWearable(o.owned, { title: o.wornTitle, frame: o.wornFrame }) : null;
  const wear = fresh && !wearHintSeen(fresh.id) ? fresh : null;
  let tabbing = false;
  const cats = [...TRACK_ORIGINALS, ...TRACK_CHAMPIONS].filter(isCat);
  const dogs = TRACK_ORIGINALS.filter((h) => !isCat(h));
  let rowScroll = 0;
  const render = (): void => {
    // a re-render (a target or a worn item picked) keeps the book's scroll and the focused control
    const bodyTop = root.querySelector('.bk-body')?.scrollTop ?? 0;
    const f = document.activeElement as HTMLElement | null;
    const refocus = f && root.contains(f) && f.dataset.target !== undefined ? `[data-target="${f.dataset.target}"]` : null;
    const next = nextReward(o.owned, s.target, o.treats.chests);
    const n = matchesToGo(o.treats);
    const fill = Math.round((100 * (Math.max(0, o.treats.xp) % TREAT_STEP)) / TREAT_STEP);
    // Target chooser: portrait medallions in one scrolling row, cats then dogs ("Any champion", the track's own order, first)
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
      // founder, Nov 13: the REAL cat's photo (pawlegends.app, ui/art.ts), the champion's splash when it cannot load;
      // never Token Tails card art (pixel sprites)
      const photo = realPhotoImgAttrs(h, { square: true, sizes: '(max-height: 500px) 160px, 240px' });
      const pic = splashUrl(String(import.meta.env.BASE_URL ?? './'), h, 360);
      const img = photo
        ? `<img ${photo} referrerpolicy="no-referrer" class="real">`
        : pic
          ? `<img src="${esc(pic)}" alt="${esc(c.cardName)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`
          : `<span class="pic">${icon('paw')}</span>`;
      return `<div class="postcard" data-postcard="${h}" style="--i:${i}" tabindex="0" role="button" aria-label="${esc(`${c.cardName}: meet the real cat`)}"><span class="pc-photo">${img}<span class="stamp" aria-hidden="true">${icon('paw')}</span></span><b>${esc(c.cardName)}</b><small>${esc(postcardStory(h))}</small></div>`;
    };
    // the storybook path: the chest just opened, the next chest (its art and the bar), and the three after it
    const c0 = o.treats.chests;
    const stop = (k: number, cls: string): string => `<span class="tp-stop ${cls}" aria-hidden="true"><i></i><em>${k}</em></span>`;
    const path = `${c0 > 0 ? stop(c0, 'done') : ''}<span class="tp-now"><span class="tp-chest" aria-hidden="true"></span><span class="tp-num" aria-hidden="true">${c0 + 1}</span></span>${stop(c0 + 2, 'ahead')}${stop(c0 + 3, 'ahead')}${stop(c0 + 4, 'ahead')}`;
    // Audit UX-10: a corner ✕ and a fixed Done (the exit never scrolls away); only the book body scrolls
    const tabs = o.onPass ? bookTabs('track', 'Pass') : '<h2 class="bk-h">Treat Track</h2>';
    root.innerHTML = `<div class="card bk-card">${bookClose('Treat Track')}<div class="bk-head">${tabs}</div>
      <div class="bk-body">
      <section class="bk-page tp">
        <div class="tp-path">${path}</div>
        <div class="tp-info">
          <p class="next-chest" data-next="${esc(next.id)}"><span class="kick">Next chest</span><b>${esc(next.name)}</b></p>
          <span class="tp-bar" role="progressbar" aria-label="Season XP to the next chest" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}"><i style="width:${fill}%"></i><span class="gem" style="left:${fill}%"></span></span>
          <small data-togo="${n}">${esc(toGoText(n))}</small>
          ${wear ? `<p class="wear-new" data-new="${esc(wear.id)}"><span>${esc(wear.name.replace(/^"(.*)" title$/, '$1'))} is yours.</span><button type="button" class="bk-link" data-a="wear" data-testid="track-wear-it">Wear it</button></p>` : ''}
        </div>
      </section>
      <h3 class="bk-h3 bk-kick">Next reward for</h3>
      <div class="targets"><div class="md-row" role="group" aria-label="Next reward for"><button type="button" class="target md order${s.target === null ? ' on' : ''}" data-target="" aria-pressed="${s.target === null}" aria-label="Any champion: the next reward in line"><span class="md-ring"><span class="md-face">${icon('arrows')}</span></span><b>Any</b><small>Next in line</small></button><span class="grp" aria-hidden="true">Cats</span>${cats.map(medal).join('')}<span class="grp dog" aria-hidden="true">Dogs</span>${dogs.map(medal).join('')}</div></div>
      <h3 class="bk-h3">Meet the real cat</h3>
      <div class="postcards">${TRACK_CHAMPIONS.map(card).join('')}</div>
      <p class="fine">Free. Matches fill the bar; each chest holds the next reward.</p>
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
      // a tab switch is not a close: the link stays for the way back
      tabbing = true;
      close();
      o.onPass();
      return;
    }
    if (t.closest('[data-a="wear"]') && o.onWearIt) {
      close();
      o.onWearIt();
      return;
    }
    const pc = t.closest<HTMLElement>('.postcard:not(.locked)')?.dataset.postcard as HeroId | undefined;
    if (pc) {
      void openChampInfo({ hero: pc, tab: 'lore', within: root });
      return;
    }
    const tg = t.closest<HTMLElement>('[data-target]');
    if (tg) {
      s.target = (tg.dataset.target || null) as HeroId | null;
      o.onTarget(s.target);
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
    if (wear && !tabbing) markWearHintSeen(wear.id);
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
