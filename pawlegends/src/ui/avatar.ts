/**
 * Player avatars (docs/plans/moba/CHAT-AVATARS.md §7.4): an icon (a champion portrait or an earned icon) inside a CSS
 * ring for the border (frame), with the title as a tooltip line. Menus never render WebGL for this: a hero icon uses the
 * portrait the game already baked when there is one, else a medallion of the hero's initial in its side's colour. A
 * Token Tails cat avatar (`c:<id>` with NFT art) shows the hero face instead: its art is a pixel sprite (founder,
 * Nov 13: no pixel art in Paw Legends). No data shows the default; a guest shows a paw. Pure markup or a DOM node.
 */
import { HEROES, type HeroId } from '../data/heroes';
import { isAvatarView, type AvatarView } from '../data/avatarView';
import { portraitUrl } from '../render/portraits';
import { SEASONS, STORE_FRAMES } from '../money/catalog';
import { TRACK_TITLES, treatReward } from '../meta/treats';

export type AvatarSize = 24 | 32 | 40 | 56 | 88;

/** Ring colours per frame id (CSS only; no image per frame). Unknown owned frames get the accent ring. */
export const FRAME_RING: Readonly<Record<string, string>> = Object.freeze({
  'frame.store.goldpaw': '#f5c542',
  'frame.store.moonlit': '#7aa7ff',
  'frame.store.sunbeam': '#ffb347',
  'frame.store.bone': '#f2ead8',
  'frame.legend': '#c084fc',
  'frame.founder': '#ff7ab6',
  // Legends Pass season 1: each its own colour (the Collection shows the real ring, never one grey placeholder)
  'frame.s1.sprout': '#7ee08a',
  'frame.s1.harvest': '#e8a13a',
  'frame.s1.lantern': '#ffcf6b',
  'frame.s1.starfall': '#9db8ff',
  'frame.s1.aurora': '#c79bff',
  'frame.s1.crown': '#ffd700',
  // Treat Track champion frames
  'frame.champ.lambo': '#ff8fb1',
  'frame.champ.aviete': '#e0245e',
  'frame.champ.bengas': '#ff9d3c',
  'frame.champ.gabe': '#8fd3ff',
});

export function frameRing(f: string | undefined): string | null {
  if (!f) return null;
  if (FRAME_RING[f]) return FRAME_RING[f];
  if (f.startsWith('frame.s1.')) return '#7ee08a';
  if (f.startsWith('frame.ranked.')) return '#39a6ff';
  return '#ffd166';
}

const words = (id: string): string =>
  (id.split('.').pop() ?? '').replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** The catalogue's own names (store, Legends Pass, Treat Track), so every screen calls an item the same thing. */
const PASS_NAMES = new Map(SEASONS.flatMap((s) => [...s.free, ...s.premium]).map((r) => [r.item, r.name.replace(/ (title|frame)$/, '')]));
const TITLE_NAMES: ReadonlyMap<string, string> = new Map([...STORE_FRAMES.map((f) => [f.title.id, f.title.name] as const), ...Object.entries(TRACK_TITLES)]);
const FRAME_NAMES: ReadonlyMap<string, string> = new Map(STORE_FRAMES.map((f) => [f.id, f.name.replace(/ frame$/, '')] as const));

/** A title's name (`title.champ.aviete` → "Raspberry's Pal", `title.s1.rookie` → "Rookie Legend"). */
export function titleText(t: string | undefined): string {
  if (!t) return '';
  return TITLE_NAMES.get(t) ?? PASS_NAMES.get(t) ?? words(t);
}

/** A border's name (`frame.store.goldpaw` → "Gold Paw", `frame.champ.aviete` → "Raspberry"). */
export function frameName(f: string): string {
  return FRAME_NAMES.get(f) ?? PASS_NAMES.get(f) ?? treatReward(f)?.name.replace(/ frame$/, '') ?? words(f);
}

const PAW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 13c-3 0-6 2.6-6 5.2 0 1.6 1.4 2.3 3 2.3 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.7 3-2.3C18 15.6 15 13 12 13zM6.5 11a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zm11 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zM9.3 7.4a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2zm5.4 0a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2z"/></svg>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface AvatarParts {
  kind: 'hero' | 'icon' | 'guest';
  hero?: HeroId;
  letter: string;
  side: 'cat' | 'dog' | null;
  ring: string | null;
  title: string;
}

/** What an avatar view draws, after the checks (unknown hero, foreign art and bad shapes fall back). Pure. */
export function avatarParts(av: unknown, opts: { guest?: boolean; fallbackHero?: string } = {}): AvatarParts {
  if (opts.guest) return { kind: 'guest', letter: '', side: null, ring: null, title: '' };
  const v: AvatarView | null = isAvatarView(av) ? av : null;
  const ring = frameRing(v?.f);
  const title = titleText(v?.t);
  // `c:` (a Token Tails cat, pixel art) falls through to the hero face
  if (v?.i.startsWith('i:')) return { kind: 'icon', letter: '★', side: null, ring, title };
  const raw = v?.i.startsWith('h:') ? v.i.slice(2) : (opts.fallbackHero ?? 'clem');
  const hero = (raw in HEROES ? raw : 'clem') as HeroId;
  const data = HEROES[hero];
  return { kind: 'hero', hero, letter: (data?.name ?? hero).charAt(0).toUpperCase(), side: data?.side === 'dog' ? 'dog' : 'cat', ring, title };
}

/** The avatar as markup (every value escaped). `label`: the accessible name (the player's name). */
export function avatarHtml(av: unknown, size: AvatarSize, opts: { guest?: boolean; fallbackHero?: string; label?: string } = {}): string {
  const p = avatarParts(av, opts);
  const style: string[] = [`--av:${size}px`];
  if (p.ring) style.push(`--av-ring:${p.ring}`);
  let inner = '';
  if (p.kind === 'hero' && p.hero) {
    const pic = portraitUrl(p.hero);
    inner = pic ? `<img src="${esc(pic)}" alt="" decoding="async">` : `<b>${esc(p.letter)}</b>`;
  } else if (p.kind === 'guest') inner = PAW;
  else inner = `<b>${esc(p.letter)}</b>`;
  const label = opts.label ? ` aria-label="${esc(opts.label)}" role="img"` : ' aria-hidden="true"';
  const title = p.title ? ` title="${esc(p.title)}"` : '';
  return `<span class="pl-av" data-kind="${p.kind}"${p.side ? ` data-side="${p.side}"` : ''}${p.ring ? ' data-ring="1"' : ''} style="${style.join(';')}"${label}${title}>${inner}</span>`;
}

/** The avatar as a DOM node. */
export function avatarEl(doc: Document, av: unknown, size: AvatarSize, opts: { guest?: boolean; fallbackHero?: string; label?: string } = {}): HTMLElement {
  const t = doc.createElement('template');
  t.innerHTML = avatarHtml(av, size, opts);
  return t.content.firstElementChild as HTMLElement;
}
