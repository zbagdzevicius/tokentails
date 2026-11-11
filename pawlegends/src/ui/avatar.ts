/**
 * Player avatars (docs/plans/moba/CHAT-AVATARS.md §7.4): an icon (a champion portrait, one of the player's own Token
 * Tails cats, or an earned icon) inside a CSS ring for the border (frame), with the title as a tooltip line. Menus never
 * render WebGL for this: a hero icon uses the portrait the game already baked when there is one, else a medallion of
 * the hero's initial in its side's colour. Cat art comes only from the NFT bucket (`isAvatarView`); anything else, or
 * no data, shows the default; a guest shows a paw. Pure markup or a DOM node; nothing per frame.
 */
import { HEROES, type HeroId } from '../data/heroes';
import { isAvatarView, type AvatarView } from '../data/chatPhrases';
import { portraitUrl } from '../render/portraits';

export type AvatarSize = 24 | 32 | 40 | 56 | 88;

/** Ring colours per frame id (CSS only; no image per frame). Unknown owned frames get the accent ring. */
export const FRAME_RING: Readonly<Record<string, string>> = Object.freeze({
  'frame.store.goldpaw': '#f5c542',
  'frame.store.moonlit': '#7aa7ff',
  'frame.store.sunbeam': '#ffb347',
  'frame.store.bone': '#f2ead8',
  'frame.legend': '#c084fc',
  'frame.founder': '#ff7ab6',
});

export function frameRing(f: string | undefined): string | null {
  if (!f) return null;
  if (FRAME_RING[f]) return FRAME_RING[f];
  if (f.startsWith('frame.s1.')) return '#7ee08a';
  if (f.startsWith('frame.ranked.')) return '#9fd3ff';
  return '#ffd166';
}

/** Title ids read as words (`title.s1.rookie` → "Rookie"). */
export function titleText(t: string | undefined): string {
  if (!t) return '';
  const last = t.split('.').pop() ?? '';
  return last.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const PAW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 13c-3 0-6 2.6-6 5.2 0 1.6 1.4 2.3 3 2.3 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.7 3-2.3C18 15.6 15 13 12 13zM6.5 11a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zm11 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zM9.3 7.4a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2zm5.4 0a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2z"/></svg>';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface AvatarParts {
  kind: 'hero' | 'cat' | 'icon' | 'guest';
  hero?: HeroId;
  img?: string;
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
  if (v?.i.startsWith('c:') && v.img) return { kind: 'cat', img: v.img, letter: '', side: null, ring, title };
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
  if (p.kind === 'cat' && p.img) inner = `<img src="${esc(p.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  else if (p.kind === 'hero' && p.hero) {
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
