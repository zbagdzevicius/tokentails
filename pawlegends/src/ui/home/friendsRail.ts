/**
 * Home's friends panel (founder Nov 20, "top 1" of the friends-list concepts; docs/plans/moba/FRIENDS.md): THE friends
 * list, always on screen on Home. Nothing opens it; there is no other friends list (the old collapsible sidebar is
 * gone).
 *
 * Desktop and tablet: one glass panel at the top right. Header "FRIENDS 3/12" (not offline / all) with the add-friend
 * button (its badge: friend requests waiting) and, while DMs are unread, a chat button with their count. Rows: a round
 * avatar with a presence dot (green online, amber away, yellow in a queue or match, grey offline), the name with a
 * small rank badge (the ranked tier when placed this season), a status line ("Online", "In match · 12:40" ticking,
 * "3m ago" for offline, dimmed) and a square yellow + that invites to a party (grey with its reason when the friend
 * can't be invited: in a match or queue, offline, already in your party). About five rows show, then the list scrolls
 * inside the panel, which always ends above the PLAY cluster (`placeRail`).
 *
 * Phones (founder: "it should be placed at the top on mobile"): the same list as a compact strip across the top right,
 * under the top bar: avatar chips with presence dots and the name under, a small + on invitable friends (a long press
 * on a chip invites too); the add button leads the strip.
 *
 * A row's tap opens the Player Card (Profile, other-player mode: Message, Join, Watch, Remove, Block…). Order: online
 * (favourites first, then A–Z), in a queue or match, offline (most recently seen first). Names are host data: escaped.
 */
import './friendsRail.css';
import { avatarHtml } from '../avatar';
import { RANKED_TIERS } from '../../meta/ranked';
import { shownState, type FriendRow, type Presence, type ShownState } from '../../social/presence';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const ADD_USER =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></svg>';
const CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';

/** What the panel knows: null while the first answer is on its way (no empty prompt flashes), else the friends. */
export type RailFriends = readonly FriendRow[] | null;

/** What sits around the list: requests and unread DMs (header badges), a guest, and my party (invite rules). */
export interface RailMeta {
  requests: number;
  unread: number;
  guest: boolean;
  myParty: string | null;
}
export const RAIL_META: RailMeta = Object.freeze({ requests: 0, unread: 0, guest: false, myParty: null });

/** The three groups of the panel, in order. */
export type RailGroup = 'on' | 'busy' | 'off';
export const railGroup = (p: Presence): RailGroup => (p.state === 'offline' ? 'off' : p.state === 'match' || p.state === 'queue' ? 'busy' : 'on');

/**
 * The panel's order (founder Nov 20: online > in match > offline): online, away and in a lobby first, then in a queue
 * or a match (favourites first, then A–Z in both), then offline, most recently seen first (no `seen`: last, A–Z). Pure.
 */
export function railOrder(list: readonly FriendRow[]): FriendRow[] {
  const g = { on: 0, busy: 1, off: 2 } as const;
  return [...list].sort((a, b) => {
    const ga = railGroup(a.presence);
    const d = g[ga] - g[railGroup(b.presence)];
    if (d) return d;
    if (ga === 'off') {
      const sa = typeof a.presence.seen === 'number' ? a.presence.seen : -1;
      const sb = typeof b.presence.seen === 'number' ? b.presence.seen : -1;
      if (sa !== sb) return sb - sa;
    } else if (!!a.fav !== !!b.fav) return a.fav ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** "12:40" (minutes:seconds) or "1:02:05"; '' for a missing or future time. Pure. */
export function clockText(since: number | undefined, now = Date.now()): string {
  if (typeof since !== 'number' || !Number.isFinite(since) || since > now + 60_000) return '';
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "3m ago", "1h ago", "2d ago", "Just now"; '' when unknown. Pure. */
export function seenText(seen: number | undefined, now = Date.now()): string {
  if (typeof seen !== 'number' || !Number.isFinite(seen) || seen > now + 60_000) return '';
  const m = Math.max(0, Math.floor((now - seen) / 60_000));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** The status line ("Online", "In match · 12:40", "In lobby · 2/3", "3m ago"). Pure. */
export function railStatus(p: Presence, now = Date.now()): string {
  const s = shownState(p);
  if (s === 'match' || s === 'queue') {
    const t = clockText(p.since, now);
    return `${s === 'match' ? 'In match' : 'In queue'}${t ? ` · ${t}` : ''}`;
  }
  if (s === 'party') return typeof p.size === 'number' && typeof p.max === 'number' && p.size > 0 && p.max >= p.size && p.max <= 10 ? `In lobby · ${p.size}/${p.max}` : 'In lobby';
  if (s === 'offline') return seenText(p.seen, now) || 'Offline';
  return s === 'away' ? 'Away' : 'Online';
}

/**
 * Can the + invite this friend now (the same invite as before: a party opens when there is none)? Free friends yes
 * (online, away, in another lobby: their card asks them to leave it); in a match or queue, or already in my party no,
 * with the reason the button says. Offline: no from Home; from my own party lobby yes (they get a notification, the
 * old sidebar's rule). Pure.
 */
export function railInvite(p: Presence, myParty: string | null = null): { ok: true } | { ok: false; why: string } {
  if (myParty && p.party === myParty) return { ok: false, why: 'Already in your party' };
  if (p.state === 'match') return { ok: false, why: 'In a match' };
  if (p.state === 'queue') return { ok: false, why: 'In a queue' };
  if (p.state === 'offline' && !myParty) return { ok: false, why: 'Offline' };
  return { ok: true };
}

/** The rank badge's word and its tier id (Kitten, Tabby, Alley, Lion, Legend), or null when unranked. Pure. */
export function rankBadge(rk: unknown): { id: string; name: string } | null {
  if (typeof rk !== 'number' || !Number.isInteger(rk) || rk < 0 || rk > 12) return null;
  const t = RANKED_TIERS[Math.min(RANKED_TIERS.length - 1, Math.floor(rk / 3))];
  return t ? { id: t.id, name: t.name } : null;
}

/** "3/12": friends not offline over all friends ('' while loading or with none). Pure. */
export function railCount(list: RailFriends): string {
  if (!list?.length) return '';
  return `${list.filter((f) => f.presence.state !== 'offline').length}/${list.length}`;
}

/** The dot's colour key: online (green; a lobby too), away (amber), busy (yellow: queue, match), offline (grey). */
const dotOf = (s: ShownState): string => (s === 'match' || s === 'queue' ? 'busy' : s === 'party' ? 'online' : s);

function rowHtml(f: FriendRow, meta: RailMeta, now: number): string {
  const s = shownState(f.presence);
  const status = railStatus(f.presence, now);
  const inv = railInvite(f.presence, meta.myParty);
  const rank = rankBadge(f.rk);
  const code = esc(f.code);
  const ticking = (s === 'match' || s === 'queue') && typeof f.presence.since === 'number' ? ` data-since="${f.presence.since}" data-word="${s === 'match' ? 'In match' : 'In queue'}"` : '';
  const label = `${f.name}${rank ? `, ${rank.name}` : ''}, ${status}. Open player card`;
  const plus = inv.ok
    ? `<button type="button" class="fr-plus" data-a="fr-invite" data-code="${code}" data-testid="home-friend-invite" aria-label="${esc(`Invite ${f.name} to a party`)}" title="Invite to party">${PLUS}</button>`
    : `<button type="button" class="fr-plus off" data-a="fr-invite" data-code="${code}" data-why="${esc(inv.why)}" aria-disabled="true" data-testid="home-friend-noinvite" aria-label="${esc(`Can't invite ${f.name}: ${inv.why}`)}" title="${esc(inv.why)}">${PLUS}</button>`;
  return `<li class="fr-row" data-state="${s}" data-group="${railGroup(f.presence)}" data-testid="home-friend" data-code="${code}"><button type="button" class="fr-main" data-a="fr-open" data-code="${code}" aria-label="${esc(label)}"><span class="fr-av">${avatarHtml(f.av, 40)}<i class="fr-dot" data-dot="${dotOf(s)}" aria-hidden="true"></i></span><span class="fr-who"><span class="fr-nm"><b class="fr-name">${esc(f.name)}</b>${rank ? `<i class="fr-rank" data-tier="${rank.id}" data-testid="home-friend-rank">${esc(rank.name)}</i>` : ''}</span><small class="fr-st" data-dot="${dotOf(s)}"${ticking}>${esc(status)}</small></span></button>${plus}</li>`;
}

/** The list's markup for a state (null: loading). Pure. */
export function railListHtml(list: RailFriends, meta: RailMeta = RAIL_META, now = Date.now()): string {
  if (meta.guest)
    return `<li class="fr-empty"><p>Sign in to add friends, see who's online and keep your progress.</p><button type="button" class="fr-cta" data-a="fr-signin" data-testid="home-friends-signin">Sign in</button></li>`;
  if (list === null) return '<li class="fr-wait" aria-hidden="true"><i></i><i></i><i></i></li>';
  if (!list.length)
    return `<li class="fr-empty"><p>No friends yet. Add players you met by name.</p><button type="button" class="fr-cta" data-a="fr-add" data-testid="home-friends-empty">${ADD_USER}<span>Add friend</span></button></li>`;
  return railOrder(list)
    .map((f) => rowHtml(f, meta, now))
    .join('');
}

const badge = (n: number, testid: string): string => (n > 0 ? `<i class="fr-badge" data-testid="${testid}">${n > 9 ? '9+' : n}</i>` : '');

function headHtml(list: RailFriends, meta: RailMeta): string {
  const addLabel = meta.requests ? `Add friends. ${meta.requests} friend request${meta.requests > 1 ? 's' : ''} waiting` : 'Add friends';
  const chat =
    meta.unread && !meta.guest
      ? `<button type="button" class="fr-hbtn fr-chat" data-a="fr-chat" data-testid="home-friends-chat" aria-label="${esc(`Messages: ${meta.unread} unread`)}" title="Messages">${CHAT}${badge(meta.unread, 'home-friends-unread')}</button>`
      : '';
  const add = meta.guest ? '' : `<button type="button" class="fr-hbtn fr-add" data-a="fr-add" data-testid="home-friends-add" aria-label="${esc(addLabel)}" title="Add friends">${ADD_USER}${badge(meta.requests, 'home-friends-requests')}</button>`;
  return `<h2 class="fr-title"><b>Friends</b><span class="fr-count" data-testid="home-friends-count">${railCount(list)}</span></h2>${chat}${add}`;
}

/** The whole panel (the Home markup). */
export function railHtml(list: RailFriends, meta: RailMeta = RAIL_META): string {
  return `<aside class="fr-rail" data-testid="home-friends" aria-label="Friends" data-n="${list ? list.length : -1}"><div class="fr-head">${headHtml(list, meta)}</div><ul class="fr-list" aria-label="Friends list">${railListHtml(list, meta)}</ul></aside>`;
}

export interface RailHandlers {
  /** A row: the friend's Player Card. */
  onOpen(f: FriendRow): void;
  /** + on a free friend: invite to a party (a party lobby opens when there is none). */
  onInvite(f: FriendRow): void;
  /** + on a friend who can't be invited: say why (Home's toast). */
  onWhy(f: FriendRow, why: string): void;
  /** The add-friend button and the empty state's Add friend: the add-friend sheet. */
  onAdd(): void;
  /** The chat button (unread DMs): the newest unread conversation. */
  onChat(): void;
  /** A guest's Sign in. */
  onSignIn(): void;
}

interface RailState {
  list: RailFriends;
  meta: RailMeta;
}
const states = new WeakMap<HTMLElement, RailState>();

/** Redraw the list and the header in place; the scroll position and the focused control survive. */
export function setRailFriends(rail: HTMLElement | null | undefined, list: RailFriends, meta?: Partial<RailMeta>): void {
  if (!rail) return;
  const st = states.get(rail) ?? { list: null, meta: { ...RAIL_META } };
  st.list = list;
  if (meta) st.meta = { ...st.meta, ...meta };
  states.set(rail, st);
  paint(rail, st);
}

function focusKey(scope: HTMLElement): string {
  const a = document.activeElement as HTMLElement | null;
  return a && scope.contains(a) ? `${a.dataset.a ?? ''}|${a.dataset.code ?? ''}` : '';
}
function refocus(scope: HTMLElement, key: string): void {
  if (!key) return;
  const [a, code] = key.split('|');
  const sel = code ? `[data-a="${a}"][data-code="${CSS.escape(code)}"]` : `[data-a="${a}"]`;
  scope.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
}

function paint(rail: HTMLElement, st: RailState): void {
  rail.dataset.n = String(st.list ? st.list.length : -1);
  const head = rail.querySelector<HTMLElement>('.fr-head');
  const ul = rail.querySelector<HTMLElement>('.fr-list');
  const key = focusKey(rail);
  if (head) head.innerHTML = headHtml(st.list, st.meta);
  if (ul) {
    const top = ul.scrollTop;
    const left = ul.scrollLeft;
    ul.innerHTML = railListHtml(st.list, st.meta);
    ul.scrollTop = top;
    ul.scrollLeft = left;
    fade(ul);
  }
  refocus(rail, key);
}

/** The edge fade only while more rows wait (below on the panel, to the right on the strip). */
function fade(ul: HTMLElement): void {
  const strip = !!ul.closest('.is-strip');
  ul.classList.toggle('more', strip ? ul.scrollWidth - ul.scrollLeft - ul.clientWidth > 4 : ul.scrollHeight - ul.scrollTop - ul.clientHeight > 4);
}

/** The strip layout (phones): a short screen (landscape phone) or a narrow one (portrait). Kept in step with the CSS. */
export const STRIP_QUERY = '(max-height: 500px), (max-width: 700px)';

/**
 * The panel's room: from the top bar's line down to just above the PLAY cluster (measured: a taller cluster, Ranked
 * and Practice unlocked, moves it), and below anything it would meet (the champion's nameplate, the currencies). The
 * strip (phones) keeps its CSS place under the top bar.
 */
export function placeRail(root: HTMLElement): void {
  const rail = root.querySelector<HTMLElement>(':scope > .fr-rail');
  if (!rail) return;
  const strip = typeof matchMedia === 'function' && matchMedia(STRIP_QUERY).matches;
  rail.classList.toggle('is-strip', strip);
  const ul = rail.querySelector<HTMLElement>('.fr-list');
  if (strip) {
    // the top row, right of the currencies (and of the nameplate where they meet); too narrow for three chips: under
    // the nameplate instead
    rail.style.maxHeight = '';
    rail.style.top = '';
    rail.style.maxWidth = '';
    const vw = window.innerWidth || root.clientWidth;
    const r0 = rail.getBoundingClientRect();
    const right = vw - r0.right;
    let left = 0;
    const cur = root.querySelector<HTMLElement>('.hm-cur')?.getBoundingClientRect();
    if (cur && cur.width) left = Math.max(left, cur.right + 8);
    const plate = root.querySelector<HTMLElement>(':scope > .hm-stage .hm-plate')?.getBoundingClientRect();
    if (plate && plate.width && plate.top < r0.bottom - 1 && plate.bottom > r0.top) left = Math.max(left, plate.right + 8);
    const room = vw - right - left;
    if (room >= 200) rail.style.maxWidth = `${Math.floor(room)}px`;
    else if (plate && plate.width) rail.style.top = `${Math.round(plate.bottom + 6)}px`;
    if (ul) fade(ul);
    return;
  }
  const vh = window.innerHeight || root.clientHeight;
  const playc = root.querySelector<HTMLElement>(':scope > .hm-playc');
  let pTop = vh;
  if (playc) for (const el of playc.querySelectorAll<HTMLElement>('.hm-play, .hm-alt, .hm-line')) pTop = Math.min(pTop, el.getBoundingClientRect().top);
  const topBar = root.querySelector<HTMLElement>(':scope > .hm-top')?.getBoundingClientRect();
  let top = topBar && topBar.height ? topBar.top : 12;
  const left = rail.getBoundingClientRect().left;
  for (const el of root.querySelectorAll<HTMLElement>(':scope > .hm-stage .hm-plate, .hm-cur')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > left - 8 && r.left < left + rail.offsetWidth && r.bottom + 8 > top) top = r.bottom + 8;
  }
  const gap = vh >= 600 ? 18 : 10;
  rail.style.top = `${Math.round(top)}px`;
  rail.style.maxHeight = `${Math.max(120, Math.round(pTop - gap - top))}px`;
  if (ul) fade(ul);
}

/** The status lines of friends in a match or queue tick each second ("In match · 12:41"). */
function tick(rail: HTMLElement): void {
  const now = Date.now();
  for (const el of rail.querySelectorAll<HTMLElement>('.fr-st[data-since]')) {
    const t = clockText(Number(el.dataset.since), now);
    const text = `${el.dataset.word ?? ''}${t ? ` · ${t}` : ''}`;
    if (el.textContent !== text) el.textContent = text;
  }
}

/** Wire the panel's buttons; everything ends with `signal`. */
export function bindRail(root: HTMLElement, h: RailHandlers, signal?: AbortSignal): void {
  const rail = root.querySelector<HTMLElement>(':scope > .fr-rail');
  if (!rail) return;
  if (!states.has(rail)) states.set(rail, { list: null, meta: { ...RAIL_META } });
  const opt = signal ? { signal } : undefined;
  const friend = (code: string | undefined): FriendRow | undefined => states.get(rail)?.list?.find((x) => x.code === code);
  // phones: a long press on a chip invites too (the + is small there); the click that ends it opens nothing
  let press: ReturnType<typeof setTimeout> | null = null;
  let pressed = false;
  const cancel = (): void => {
    if (press) clearTimeout(press);
    press = null;
  };
  rail.addEventListener(
    'click',
    (e) => {
      if (pressed) {
        pressed = false;
        e.stopPropagation();
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      const a = b?.dataset.a;
      if (!b || !a?.startsWith('fr-')) return;
      e.stopPropagation();
      if (a === 'fr-add') return h.onAdd();
      if (a === 'fr-chat') return h.onChat();
      if (a === 'fr-signin') return h.onSignIn();
      const f = friend(b.dataset.code);
      if (!f) return;
      if (a === 'fr-open') return h.onOpen(f);
      if (a === 'fr-invite') {
        if (b.getAttribute('aria-disabled') === 'true') return h.onWhy(f, b.dataset.why ?? '');
        h.onInvite(f);
      }
    },
    opt,
  );
  rail.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' || !rail.classList.contains('is-strip')) return;
      const main = (e.target as HTMLElement).closest<HTMLElement>('.fr-main');
      const f = friend(main?.dataset.code);
      if (!f) return;
      pressed = false;
      cancel();
      press = setTimeout(() => {
        press = null;
        pressed = true;
        const inv = railInvite(f.presence, states.get(rail)?.meta.myParty ?? null);
        if (inv.ok) h.onInvite(f);
        else h.onWhy(f, inv.why);
      }, 550);
    },
    opt,
  );
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) rail.addEventListener(ev, cancel, opt);
  rail.addEventListener('contextmenu', (e) => rail.classList.contains('is-strip') && e.preventDefault(), opt);
  const ul = rail.querySelector<HTMLElement>('.fr-list');
  ul?.addEventListener('scroll', () => fade(ul), { passive: true, ...(signal ? { signal } : {}) });
  const timer = setInterval(() => (rail.isConnected ? tick(rail) : clearInterval(timer)), 1000);
  signal?.addEventListener('abort', () => {
    clearInterval(timer);
    cancel();
  });
}
