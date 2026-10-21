/**
 * Routes and share links (GDD 8.3). Everything works without a server: heavy payloads ride in the hash so they never
 * reach Vercel or its logs. Pure (takes a location-like object), so it is unit tested.
 *
 *   /meow-race                              a normal race
 *   /meow-race/r#g=<ghost>&c=<cat>&n=<name> a dare (also `?g=` / `#g=` on any path, e.g. local dev)
 *   /meow-race/d/<n>                        Daily Cup day n (also `?daily=<n>`)
 */
import type { CatSpec, RaceMode } from '../../types';
import { decodeCat, encodeCat } from '../codec/cat-codec';
import { filterName } from '../codec/text-filter';
import { peekGhost, type GhostHeader } from '../codec/ghost-codec';

export const PUBLIC_BASE = 'https://tokentails.com/meow-race';
export const SHELTER_PAYOUTS_URL = 'https://tokentails.com/shelter-payouts';

export interface LocLike {
  pathname: string;
  search: string;
  hash: string;
  origin?: string;
  hostname?: string;
}

export type Route =
  | { kind: 'dare'; ghost: string; header: GhostHeader; cat: CatSpec | null; name: string; trackCode: string | null }
  /** B47: a `g=` that does not even have a readable header (truncated, mangled): say so instead of falling back silently */
  | { kind: 'dare-broken' }
  | { kind: 'daily'; day: number }
  | { kind: 'home' };

function params(loc: LocLike): URLSearchParams {
  const p = new URLSearchParams(loc.search);
  const h = new URLSearchParams(loc.hash.replace(/^#/, ''));
  h.forEach((v, k) => p.set(k, v));
  return p;
}

export function parseRoute(loc: LocLike): Route {
  const p = params(loc);
  const g = p.get('g');
  if (g) {
    const header = peekGhost(g);
    if (header) {
      const name = filterName(p.get('n') ?? '') || 'A cat';
      const c = p.get('c');
      return { kind: 'dare', ghost: g, header, cat: c ? decodeCat(c, name) : null, name, trackCode: p.get('t') };
    }
    return { kind: 'dare-broken' };
  }
  const m = /\/d\/(\d{1,4})\/?$/.exec(loc.pathname);
  const dq = p.get('daily');
  const day = m ? Number(m[1]) : dq != null && /^\d{1,4}$/.test(dq) ? Number(dq) : NaN;
  if (Number.isFinite(day) && day >= 1) return { kind: 'daily', day };
  return { kind: 'home' };
}

/** Is this the production site (pretty /meow-race paths), or local dev / a preview (query and hash routes)? */
export function isProdHost(loc: Pick<LocLike, 'hostname'>): boolean {
  const h = loc.hostname ?? '';
  return h === 'tokentails.com' || h.endsWith('.tokentails.com');
}

/** Where links point: the public site in production, else this page (dev, previews). */
export function linkBase(loc: LocLike): string {
  if (isProdHost(loc)) return PUBLIC_BASE;
  const dir = loc.pathname.replace(/[^/]*$/, '');
  return `${loc.origin ?? ''}${dir}`;
}

export interface DareParts {
  ghost: string;
  cat?: CatSpec | null;
  name?: string;
  trackCode?: string | null;
}

/**
 * True when a run in `mode` makes a dare link a friend can race: the ghost runner rebuilds the default eight-kart
 * field on a race track. A time trial races alone, a Grand Prix sits inside a cup, and a battle arena is no lap
 * track, so their ghosts would not replay; their captions link home instead.
 */
export function dareableMode(mode: RaceMode | undefined): boolean {
  return mode == null || mode === 'race' || mode === 'dare' || mode === 'daily';
}

export function dareUrl(loc: LocLike, d: DareParts): string {
  const q = new URLSearchParams();
  q.set('g', d.ghost);
  if (d.cat) q.set('c', encodeCat(d.cat));
  const n = filterName(d.name ?? '');
  if (n) q.set('n', n);
  if (d.trackCode) q.set('t', d.trackCode);
  const hash = q.toString();
  return isProdHost(loc) ? `${PUBLIC_BASE}/r#${hash}` : `${linkBase(loc)}#${hash}`;
}

export function dailyUrl(loc: LocLike, day: number): string {
  return isProdHost(loc) ? `${PUBLIC_BASE}/d/${day}` : `${linkBase(loc)}?daily=${day}`;
}

export function homeUrl(loc: LocLike): string {
  return isProdHost(loc) ? PUBLIC_BASE : linkBase(loc);
}
