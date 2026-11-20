/**
 * The leaderboards window (founder Nov 19: "leaderboards should be a modal", opened from Boards on Home; the one way
 * in). Founder Nov 20: "top by Account Level (global), top in my country, Cats VS Dogs total wins visual cool
 * representation, Top Ranked". Four tabs:
 * - Level: the top 100 by account level (finished matches), every registered player (guests are not on boards);
 * - Country: the same board kept to players who show my country's flag (my country comes from my own flag);
 * - Cats vs Dogs: every counted match win by side, this season or all time, as a tug-of-war bar;
 * - Ranked: this season's ranked ladder, top 100 (tier and points).
 * My own row shows once: on the list when I am on the page, else pinned under it. Its own lazy chunk (with its
 * stylesheet): Home's first load stays small.
 *
 * A modal dialog: a scrim behind, focus inside (Tab cycles), Esc or the scrim closes, focus returns to the opener.
 * Names are set with `textContent`. Every call goes through the host (`board.get`); the game never sees a token.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { isAvatarView, type AvatarView } from '../data/avatarView';
import { avatarHtml } from '../ui/avatar';
import { heroSplashUrl } from '../ui/art';
import { ccHtmlOrNone, countryName, flagEmoji, setFlagHidden } from './flags';
import { icon } from './socialIcons';
import './boardsModal.css';

/** The tabs, in order. Country needs an account (it shows a sign-in line without one). */
export type BoardKind = 'level' | 'country' | 'sides' | 'ranked';
export const BOARD_KINDS: readonly BoardKind[] = Object.freeze(['level', 'country', 'sides', 'ranked']);
const BOARD_LABEL: Readonly<Record<BoardKind, string>> = Object.freeze({ level: 'Level', country: 'Country', sides: 'Cats vs Dogs', ranked: 'Ranked' });
/** The server's board for each tab (Ranked is the season ladder, `global`). */
const SERVER_KIND: Readonly<Record<BoardKind, string>> = Object.freeze({ level: 'level', country: 'country', sides: 'sides', ranked: 'global' });
const BOARD_KEY = 'pl.boards.tab';

/** The tabs, in order (all four for everyone: Country explains itself when signed out). Pure. */
export function boardKinds(): BoardKind[] {
  return [...BOARD_KINDS];
}

/** The last tab used on this device (Boards opens on it), Level by default. */
export function readBoardKind(): BoardKind {
  let v: string | null = null;
  try {
    v = localStorage.getItem(BOARD_KEY);
  } catch {
    v = null;
  }
  return (BOARD_KINDS as readonly string[]).includes(v ?? '') ? (v as BoardKind) : 'level';
}
function rememberBoardKind(k: BoardKind): void {
  try {
    localStorage.setItem(BOARD_KEY, k);
  } catch {
    /* storage blocked: this session only */
  }
}

/** A board row as the server sends it (the caller's own row carries `me`). */
export interface BoardRow {
  rank: number;
  name: string;
  /** Level boards: the account level; Ranked: the points. */
  value: number;
  /** Level boards: finished matches. */
  m?: number;
  tier?: string;
  me?: boolean;
  /** Country board: my row is below its top 100. */
  over?: boolean;
  av?: AvatarView;
  cc?: string;
}

/**
 * The rows to draw and the pinned "You" row under them: no pinned row when I am already on the page (my row is
 * marked `me`, or an older server's row has my rank and name), so I never show twice. Pure.
 */
export function boardView(d: { rows?: unknown; me?: unknown } | null | undefined): { rows: BoardRow[]; pinned: BoardRow | null } {
  const rows = (Array.isArray(d?.rows) ? d!.rows : []) as BoardRow[];
  const me = d?.me && typeof d.me === 'object' ? (d.me as Partial<BoardRow>) : null;
  if (!me || !Number.isFinite(Number(me.rank))) return { rows, pinned: null };
  const at = rows.findIndex((r) => r.me || (Number(r.rank) === Number(me.rank) && !!me.name && r.name === me.name));
  if (at >= 0) return { rows: rows.map((r, i) => (i === at && !r.me ? { ...r, me: true } : r)), pinned: null };
  return {
    rows,
    pinned: { rank: Number(me.rank), name: me.name || 'You', value: Number(me.value) || 0, m: me.m, tier: me.tier, av: me.av, cc: me.cc, over: !!me.over, me: true },
  };
}

/** A row's metric: the level with its matches, or the ranked tier with its points. Pure. */
export function rowMetric(kind: BoardKind, r: BoardRow): { main: string; sub: string } {
  const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  if (kind === 'ranked') return { main: r.tier ? String(r.tier) : 'Unranked', sub: `${n(r.value).toLocaleString('en-US')} pts` };
  const m = n(r.m);
  return { main: `Lv ${Math.max(1, n(r.value))}`, sub: `${m.toLocaleString('en-US')} ${m === 1 ? 'match' : 'matches'}` };
}

// ------------------------------------------------------------------------------------------------- Cats vs Dogs
export type SidesRange = 'season' | 'all';
interface Pair {
  cat: number;
  dog: number;
}
export interface SidesView {
  cat: number;
  dog: number;
  /** Whole percents that add up to 100 (50/50 with no wins yet). */
  catPct: number;
  dogPct: number;
  /** The cats' exact share, 0..1 (the bar's split point). */
  catShare: number;
  lead: 'cat' | 'dog' | null;
  /** "CATS LEAD by 4%", "DEAD EVEN" or the empty line. */
  headline: string;
  empty: boolean;
  /** "This week: Cats 55% · up 3 from last week", or null without wins this week. */
  trend: string | null;
  /** "Your wins this season: 12 as a cat, 4 as a dog", or null. */
  mine: string | null;
}

const pair = (v: unknown): Pair => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => Math.max(0, Math.floor(Number(x) || 0));
  return { cat: n(o.cat), dog: n(o.dog) };
};

/** Whole percents of a split that add up to 100. Pure. */
export function splitPct(p: Pair): { cat: number; dog: number } {
  const total = p.cat + p.dog;
  if (!total) return { cat: 50, dog: 50 };
  const cat = Math.round((p.cat / total) * 100);
  return { cat, dog: 100 - cat };
}

/** Everything the Cats vs Dogs tab draws, from the server's answer. Pure. */
export function sidesView(d: Record<string, unknown> | null | undefined, range: SidesRange): SidesView {
  const p = pair(range === 'all' ? d?.all : d?.season);
  const total = p.cat + p.dog;
  const pct = splitPct(p);
  const lead = p.cat > p.dog ? 'cat' : p.dog > p.cat ? 'dog' : null;
  const gap = Math.abs(pct.cat - pct.dog);
  const headline = !total
    ? range === 'all'
      ? 'No wins yet. Play a match to put your side on the board.'
      : 'No wins yet this season. Play a match to put your side on the board.'
    : !lead || !gap
      ? 'DEAD EVEN'
      : `${lead === 'cat' ? 'CATS' : 'DOGS'} LEAD by ${gap}%`;
  const wk = pair(d?.week);
  const last = pair(d?.lastWeek);
  let trend: string | null = null;
  if (wk.cat + wk.dog > 0) {
    const now = splitPct(wk);
    const side = now.cat >= now.dog ? 'Cats' : 'Dogs';
    const share = Math.max(now.cat, now.dog);
    let move = '';
    if (last.cat + last.dog > 0) {
      const before = splitPct(last);
      const diff = side === 'Cats' ? now.cat - before.cat : now.dog - before.dog;
      move = diff > 0 ? ` · up ${diff} from last week` : diff < 0 ? ` · down ${-diff} from last week` : ' · same as last week';
    }
    trend = `This week: ${side} ${share}%${move}`;
  }
  const own = d?.mine ? pair(d.mine) : null;
  const mine = own && own.cat + own.dog > 0 ? `Your wins this season: ${own.cat.toLocaleString('en-US')} as a cat, ${own.dog.toLocaleString('en-US')} as a dog` : null;
  return { cat: p.cat, dog: p.dog, catPct: pct.cat, dogPct: pct.dog, catShare: total ? p.cat / total : 0.5, lead, headline, empty: !total, trend, mine };
}

/** A rolling counter's value at `t` (0..1) of its roll from `from` to `to` (ease-out cubic, whole numbers). Pure. */
export function rollValue(from: number, to: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const e = 1 - Math.pow(1 - k, 3);
  return Math.round(from + (to - from) * e);
}

/** The lightning seam at the split (the v6 bolt). */
const BOLT_SVG = '<svg viewBox="0 0 24 48" aria-hidden="true" focusable="false"><path d="M15 0 3 27h8L7 48l15-30h-9L19 0z"/></svg>';

export interface BoardsDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  /** Analytics (no names, codes or ids in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  /** Where the window was opened from (`leaderboard_open {source, tab}`). */
  source?: string;
  onClose?(): void;
}

export interface BoardsHandle {
  close(): void;
  readonly closed: boolean;
  readonly root: HTMLElement;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const errorText = (r: ApiResult): string => (r.status === 0 ? 'No connection. Try again.' : r.status === 429 ? 'Too many tries. Wait a minute.' : 'Something went wrong. Try again.');

const reducedMotion = (doc: Document): boolean => {
  try {
    return !!doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const fmt = (n: number): string => n.toLocaleString('en-US');

/** One board row: rank, avatar, name and flag, the metric. The pinned "You" row is the same. */
function rowHtml(kind: BoardKind, r: BoardRow, pinned = false): string {
  const metric = rowMetric(kind, r);
  const rank = r.over ? '100+' : String(Number(r.rank));
  return `<div class="pl-social-row pl-bd${r.me ? ' me' : ''}${pinned ? ' pin' : ''}" role="listitem"${pinned ? ' data-testid="board-pinned"' : ''}><b class="pl-rank">${pinned ? '#' : ''}${rank}</b>${isAvatarView(r.av) ? avatarHtml(r.av, 32) : '<span class="pl-bd-noav" aria-hidden="true"></span>'}<span class="pl-social-nm"><span class="pl-social-name" data-name="${esc(String(r.name ?? ''))}"></span>${ccHtmlOrNone(r.cc)}${r.me ? '<small class="pl-bd-you">You</small>' : ''}</span><span class="pl-bd-metric${kind === 'ranked' ? ' rk' : ''}"><b>${esc(metric.main)}</b><small>${esc(metric.sub)}</small></span></div>`;
}

/** Open the leaderboards window over `parent`. One at a time: the caller keeps the handle. */
export function openBoards(parent: HTMLElement, deps: BoardsDeps): BoardsHandle {
  const doc = parent.ownerDocument;
  const was = doc.activeElement as HTMLElement | null;
  const opener = was && was !== doc.body ? was : null;
  const signedIn = deps.signedIn();
  const board: { kind: BoardKind; page: number; data: Record<string, any> | null; range: SidesRange } = { kind: readBoardKind(), page: 0, data: null, range: 'season' };
  let disposed = false;
  let seq = 0;
  let raf = 0;
  /** The counters' last drawn values (a range switch rolls from them). */
  const shown = { cat: 0, dog: 0 };

  const wrap = doc.createElement('div');
  wrap.className = 'pl-boards-wrap';
  wrap.dataset.testid = 'boards-modal';
  wrap.innerHTML = `<div class="pl-boards-scrim" data-a="close" aria-hidden="true"></div><section class="pl-boards" role="dialog" aria-modal="true" aria-labelledby="pl-boards-h"><header class="pl-boards-head"><span class="pl-boards-ico" aria-hidden="true">${icon('trophy', 20)}</span><h2 id="pl-boards-h">Leaderboards</h2><button type="button" class="pl-ico pl-boards-x" data-a="close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button></header><div class="pl-social-sub pl-boards-sub" role="group" aria-label="Board"></div><div class="pl-boards-body" aria-live="polite"></div><footer class="pl-boards-foot"></footer></section>`;
  parent.appendChild(wrap);
  const dialog = wrap.querySelector<HTMLElement>('.pl-boards')!;
  const subEl = wrap.querySelector<HTMLElement>('.pl-boards-sub')!;
  const bodyEl = wrap.querySelector<HTMLElement>('.pl-boards-body')!;
  const footEl = wrap.querySelector<HTMLElement>('.pl-boards-foot')!;

  const subHtml = (): string =>
    boardKinds()
      .map((k) => `<button type="button" class="pl-btn ghost small" data-board="${k}" data-testid="board-${k}" aria-pressed="${board.kind === k}">${BOARD_LABEL[k]}</button>`)
      .join('');

  const sidesHtml = (d: Record<string, any>): string => {
    const v = sidesView(d, board.range);
    const seasonName = typeof d.season?.name === 'string' && d.season.name ? String(d.season.name) : 'this season';
    const range = (['season', 'all'] as const)
      .map((r) => `<button type="button" class="pl-btn ghost small" data-range="${r}" data-testid="cvd-${r}" aria-pressed="${board.range === r}">${r === 'season' ? 'This season' : 'All time'}</button>`)
      .join('');
    const lead = v.lead && !v.empty ? ` ${v.lead}` : '';
    const label = `${board.range === 'all' ? 'All time' : seasonName}: cats ${fmt(v.cat)} wins, dogs ${fmt(v.dog)} wins`;
    const side = (s: 'cat' | 'dog') =>
      `<div class="pl-cvd-side ${s}" aria-hidden="true"><span class="pl-cvd-tag">${s === 'cat' ? 'Cats' : 'Dogs'}</span><b class="pl-cvd-n" data-n="${s}" data-to="${v[s]}">${fmt(shown[s])}</b><span class="pl-cvd-pct">${s === 'cat' ? v.catPct : v.dogPct}% · wins</span></div>`;
    return `<div class="pl-cvd${lead}${v.empty ? ' empty' : ''}" data-testid="cvd" style="--cat:${(v.catShare * 100).toFixed(2)}%"><div class="pl-cvd-range" role="group" aria-label="Period">${range}</div><p class="pl-cvd-lead" data-testid="cvd-lead">${esc(v.headline)}</p><div class="pl-cvd-stage" role="img" aria-label="${esc(label)}"><img class="pl-cvd-art cat" src="${esc(heroSplashUrl('clem', 360))}" alt="" decoding="async"><img class="pl-cvd-art dog" src="${esc(heroSplashUrl('howler', 360))}" alt="" decoding="async">${side('cat')}${side('dog')}<div class="pl-cvd-bar" aria-hidden="true"><span class="pl-cvd-fill cat"></span><span class="pl-cvd-fill dog"></span><i class="pl-cvd-bolt">${BOLT_SVG}</i></div></div><p class="pl-cvd-note">${board.range === 'all' ? 'Every match win since launch.' : `Match wins in ${esc(seasonName)}.`} Practice does not count.</p>${v.trend ? `<p class="pl-cvd-trend" data-testid="cvd-trend">${esc(v.trend)}</p>` : ''}${v.mine ? `<p class="pl-cvd-mine" data-testid="cvd-mine">${esc(v.mine)}</p>` : ''}</div>`;
  };

  const bodyHtml = (): string => {
    const d = board.data;
    if (board.kind === 'country' && !signedIn) return `<div class="pl-bd-why" data-testid="board-country-why"><p class="pl-social-empty">Sign in to see the top players in your country.</p></div>`;
    if (!d) return `<p class="pl-social-empty pl-boards-loading">Loading…</p>`;
    if (d.error) return `<div class="pl-bd-why"><p class="pl-social-empty" data-testid="board-error">${esc(String(d.error))}</p><button type="button" class="pl-btn small" data-a="retry">Try again</button></div>`;
    if (board.kind === 'sides') return sidesHtml(d);
    const local = board.kind === 'country' ? ((d.local ?? null) as { cc?: string | null; hidden?: boolean } | null) : null;
    const cc = typeof local?.cc === 'string' && /^[A-Z]{2}$/.test(local.cc) ? local.cc : null;
    if (board.kind === 'country' && (local?.hidden || !cc)) {
      const why = local?.hidden
        ? `<p class="pl-social-empty">Show your flag to join your country's board. Only players who show their flag are on it.</p><button type="button" class="pl-btn small" data-a="board-flag" data-testid="board-show-flag">Show my flag</button>`
        : `<p class="pl-social-empty">We don't know your country yet, so there is no country board for you. Only players who show their flag are on it.</p>`;
      return `<div class="pl-bd-why" data-testid="board-country-why">${why}</div>`;
    }
    // Country: the flag and the country over the list (only my own country; it comes from my flag)
    const head = board.kind === 'country' && cc ? `<p class="pl-bd-head" data-testid="board-country-head"><span class="pl-bd-flag" aria-hidden="true">${flagEmoji(cc)}</span><span>${esc(countryName(cc))}</span><small>Top by level</small></p>` : '';
    const view = boardView(d);
    const empty =
      board.kind === 'country'
        ? `No players from ${esc(countryName(cc ?? ''))} yet. Only players who show their flag are on it.`
        : board.kind === 'ranked'
          ? 'No ranked players yet this season. Ranked opens at level 10.'
          : 'No one here yet. Finish a match to get on the board.';
    const list = view.rows.length ? view.rows.map((r) => rowHtml(board.kind, r)).join('') : `<p class="pl-social-empty">${empty}</p>`;
    const note = board.kind === 'level' && !signedIn ? `<p class="pl-bd-note">Sign in to get on the board. Guests are not ranked.</p>` : '';
    return `${head}<div class="pl-bd-list" role="list">${list}${view.pinned ? rowHtml(board.kind, view.pinned, true) : ''}</div>${note}`;
  };

  const footHtml = (): string => {
    if (board.kind === 'sides') return '';
    const pages = Math.max(1, Number(board.data?.pages ?? 1));
    const page = board.page;
    return pages > 1
      ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-a="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>`
      : '';
  };

  /** Cats vs Dogs: the bar grows from the middle and the counters roll up (at once with reduced motion). */
  const animateSides = (): void => {
    const root = bodyEl.querySelector<HTMLElement>('.pl-cvd');
    if (!root) return;
    const nums = [...root.querySelectorAll<HTMLElement>('[data-n]')];
    const from = { cat: shown.cat, dog: shown.dog };
    const to = {
      cat: Number(nums.find((n) => n.dataset.n === 'cat')?.dataset.to) || 0,
      dog: Number(nums.find((n) => n.dataset.n === 'dog')?.dataset.to) || 0,
    };
    const draw = (t: number) => {
      for (const n of nums) {
        const k = n.dataset.n as 'cat' | 'dog';
        const val = rollValue(from[k], to[k], t);
        n.textContent = fmt(val);
        shown[k] = val;
      }
    };
    const win = doc.defaultView;
    if (raf && win) win.cancelAnimationFrame(raf);
    raf = 0;
    if (reducedMotion(doc) || !win?.requestAnimationFrame) {
      root.classList.add('in');
      draw(1);
      return;
    }
    // from the next frame: the bar's transition starts from the middle, the numbers roll for ~1.1 s
    let start = 0;
    const ms = 1100;
    const step = (now: number) => {
      if (disposed) return;
      if (!start) {
        start = now;
        root.classList.add('in');
      }
      const t = (now - start) / ms;
      draw(t);
      raf = t < 1 ? win.requestAnimationFrame(step) : 0;
    };
    raf = win.requestAnimationFrame(step);
  };

  const render = (): void => {
    if (disposed) return;
    const focused = doc.activeElement as HTMLElement | null;
    const key =
      focused && wrap.contains(focused)
        ? focused.dataset.board
          ? `[data-board="${focused.dataset.board}"]`
          : focused.dataset.range
            ? `[data-range="${focused.dataset.range}"]`
            : focused.dataset.a
              ? `[data-a="${focused.dataset.a}"]`
              : null
        : null;
    subEl.innerHTML = subHtml();
    bodyEl.innerHTML = bodyHtml();
    bodyEl.dataset.kind = board.kind;
    for (const n of bodyEl.querySelectorAll<HTMLElement>('[data-name]')) n.textContent = n.dataset.name ?? '';
    const foot = footHtml();
    footEl.innerHTML = foot;
    footEl.hidden = !foot;
    if (board.kind === 'sides' && board.data && !board.data.error) animateSides();
    if (key) wrap.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
  };

  const load = async (): Promise<void> => {
    const my = ++seq;
    if (board.kind === 'country' && !signedIn) {
      board.data = { rows: [] };
      render();
      return;
    }
    const kind = board.kind;
    const args: ApiArgs = { kind: SERVER_KIND[kind], ...(kind === 'sides' ? {} : { page: board.page }), ...(signedIn ? { name: 'me' } : {}) };
    const r = await deps.api('board.get', args).catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }));
    if (disposed || my !== seq) return;
    board.data = r.ok ? ((r.body as Record<string, any>) ?? { rows: [] }) : { rows: [], error: errorText(r) };
    deps.track?.('board_view', { kind });
    render();
  };

  const close = (): void => {
    if (disposed) return;
    disposed = true;
    if (raf) doc.defaultView?.cancelAnimationFrame(raf);
    doc.removeEventListener('keydown', onKey, true);
    wrap.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    deps.onClose?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (disposed) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    // focus stays inside the dialog (WCAG 2.4.3)
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled])')].filter((b) => b.offsetParent !== null || b === doc.activeElement);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const at = doc.activeElement as HTMLElement | null;
    if (e.shiftKey && (at === first || !dialog.contains(at))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (at === last || !dialog.contains(at))) {
      e.preventDefault();
      first.focus();
    }
  };
  doc.addEventListener('keydown', onKey, true);

  wrap.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const kind = t.closest<HTMLElement>('[data-board]')?.dataset.board as BoardKind | undefined;
    if (kind) {
      if (kind === board.kind && board.data) return;
      board.kind = kind;
      board.page = 0;
      board.data = null;
      shown.cat = 0;
      shown.dog = 0;
      rememberBoardKind(kind);
      render();
      void load();
      return;
    }
    const range = t.closest<HTMLElement>('[data-range]')?.dataset.range as SidesRange | undefined;
    if (range) {
      if (range === board.range) return;
      // one answer holds both periods: the counters roll from what they show now
      board.range = range;
      render();
      return;
    }
    const el = t.closest<HTMLElement>('[data-a]');
    if (!el || el.hasAttribute('disabled')) return;
    switch (el.dataset.a) {
      case 'close':
        close();
        return;
      case 'retry':
        board.data = null;
        render();
        void load();
        return;
      case 'prev':
      case 'next':
        board.page = Math.max(0, board.page + (el.dataset.a === 'next' ? 1 : -1));
        board.data = null;
        render();
        void load();
        return;
      case 'board-flag':
        // Country: one tap shows my flag (the same choice as Settings), then the board loads with me on it
        el.setAttribute('disabled', '');
        void setFlagHidden(false, (op, args) => deps.api(op, args)).then(() => {
          if (disposed) return;
          deps.track?.('settings_change', { setting: 'flag', value: 'shown' });
          board.data = null;
          render();
          return load();
        });
        return;
    }
  });

  deps.track?.('leaderboard_open', { source: deps.source ?? 'home', tab: board.kind });
  render();
  wrap.querySelector<HTMLElement>('[data-board][aria-pressed="true"]')?.focus({ preventScroll: true });
  void load();

  return {
    close,
    root: wrap,
    get closed() {
      return disposed;
    },
  };
}
