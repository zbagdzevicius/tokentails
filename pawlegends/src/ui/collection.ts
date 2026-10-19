/**
 * Collection (GAPS A1): the Treat Track's chest screen and the player's profile shelf. "Pick your next target"
 * chooses the hero whose next reward the next chest holds ("N matches to go"; the order inside each hero is fixed),
 * the champions' "Meet the real cat" postcards show the real cat's card art and a short story, and the track titles
 * and frames can be worn. Free and local: no price, no buy button, no link, and nothing here opens an offer.
 * Copy follows docs/CLAIMS.md: the stories are the cards' own jokes, with no money or impact words.
 */
import type { HeroId } from '../sim/api';
import { championOf } from '../data/heroes/shelter';
import { FRAME_NAME, isTrackFrame } from '../render/cosmetics';
import { TRACK_CHAMPIONS, TRACK_ORIGINALS, TRACK_TITLES, heroTrack, matchesToGo, nextReward, type TreatState } from '../meta/treats';
import { HERO_TEXT } from './heroText';
import { icon } from './icons';

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
}

/** A postcard's story: who the real cat is and the card's own joke (no health details, no money or impact words). */
export function postcardStory(hero: HeroId): string {
  const c = championOf(hero);
  if (!c) return '';
  const their = c.pronoun === 'she' ? 'her' : 'his';
  const flavour = HERO_TEXT[hero].flavour;
  return `${c.cardName} is a real Pink Paw cat. This champion is drawn from ${their} Token Tails card.${flavour ? ` ${flavour}` : ''}`;
}

/** "about N matches to go" (1: "1 match"). */
export const toGoText = (n: number): string => `about ${n} ${n === 1 ? 'match' : 'matches'} to go`;

export function collectionPanel(parent: HTMLElement, o: CollectionOpts): HTMLElement {
  const root = document.createElement('div');
  root.className = 'pl-screen pl-menu pl-collection';
  const s = { target: o.treats.target, title: o.wornTitle, frame: o.wornFrame };
  const heroes: readonly HeroId[] = [...TRACK_ORIGINALS, ...TRACK_CHAMPIONS];
  const render = (): void => {
    const next = nextReward(o.owned, s.target, o.treats.chests);
    const n = matchesToGo(o.treats);
    const chip = (h: HeroId): string => {
      const t = heroTrack(h, o.owned);
      const sub = t.have >= t.total && !t.next ? 'All collected' : `${t.have}/${t.total}`;
      return `<button class="chip target ${s.target === h ? 'on' : ''}" data-target="${h}" aria-pressed="${s.target === h}"><b>${esc(HERO_TEXT[h].title)}</b><small>${sub}</small></button>`;
    };
    const card = (h: HeroId): string => {
      const c = championOf(h);
      if (!c) return '';
      const have = o.owned.has(`postcard.${h}`);
      if (!have) return `<div class="postcard locked" data-postcard="${h}"><span class="pic">${icon('paw')}</span><b>${esc(c.cardName)}</b><small>Earn this postcard on the Treat Track.</small></div>`;
      const pic = o.art[h] ?? o.portrait(h);
      const img = pic ? `<img src="${esc(pic)}" alt="${esc(c.cardName)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : `<span class="pic">${icon('paw')}</span>`;
      return `<div class="postcard" data-postcard="${h}">${img}<b>${esc(c.cardName)}</b><small>${esc(postcardStory(h))}</small></div>`;
    };
    const titles = Object.keys(TRACK_TITLES).filter((id) => o.owned.has(id));
    const frames = Object.keys(FRAME_NAME).filter((id) => isTrackFrame(id) && o.owned.has(id));
    const wearRow = (kind: 'title' | 'frame', ids: string[], name: (id: string) => string, on: string | null): string =>
      ids.length
        ? `<div class="set-row"><span>${kind === 'title' ? 'Title' : 'Frame'}</span><span class="chips"><button class="chip ${on === null ? 'on' : ''}" data-wear="${kind}" data-id="">None</button>${ids
            .map((id) => `<button class="chip ${on === id ? 'on' : ''}" data-wear="${kind}" data-id="${esc(id)}">${esc(name(id))}</button>`)
            .join('')}</span></div>`
        : '';
    root.innerHTML = `<div class="card"><h2>Treat Track</h2>
      <p class="next-chest" data-next="${esc(next.id)}">Next chest: <b>${esc(next.name)}</b> <small data-togo="${n}">${esc(toGoText(n))}</small></p>
      <div class="targets"><span class="lbl">Pick your next target</span><span class="chips"><button class="chip target ${s.target === null ? 'on' : ''}" data-target="" aria-pressed="${s.target === null}"><b>Track order</b><small>Any hero</small></button>${heroes.map(chip).join('')}</span></div>
      <h3>Meet the real cat</h3>
      <div class="postcards">${TRACK_CHAMPIONS.map(card).join('')}</div>
      ${titles.length || frames.length ? `<h3>Wear</h3>${wearRow('title', titles, (id) => TRACK_TITLES[id] ?? id, s.title)}${wearRow('frame', frames, (id) => (isTrackFrame(id) ? FRAME_NAME[id] : id), s.frame)}` : ''}
      <p class="fine">Free, earned by playing. Rewards come in a fixed order.</p>
      <button class="pl-btn big" data-a="close">Done</button></div>`;
  };
  render();
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
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
    } else if (t.closest('[data-a="close"]') || t === root) {
      root.remove();
      o.onClose();
      return;
    } else return;
    render();
  });
  parent.appendChild(root);
  return root;
}
