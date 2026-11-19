/**
 * The leaderboards window (founder Nov 19: "leaderboards should be a modal", opened from Boards under # Join on Home;
 * the one way in). Weekly, Global, Local (players of my country, from my flag) and Friends, the board code that lived
 * in the Social sheet's More menu, moved here unchanged: the rows, my own row shown once (on the list when I am on the
 * page, else pinned under it), the pager. Its own lazy chunk (with its stylesheet): Home's first load stays small.
 *
 * A modal dialog: a scrim behind, focus inside (Tab cycles), Esc or the scrim closes, focus returns to the opener.
 * Names are set with `textContent`. Every call goes through the host (`board.get`); the game never sees a token.
 */
import type { ApiArgs, ApiOp, ApiResult } from '../embed/api';
import { isAvatarView, type AvatarView } from '../data/avatarView';
import { avatarHtml } from '../ui/avatar';
import { ccHtmlOrNone, countryName, flagEmoji, setFlagHidden } from './flags';
import { icon } from './socialIcons';
import './boardsModal.css';

/** The leaderboards' sub-tabs (Local is the player's country, from their flag; Local and Friends need an account). */
export type BoardKind = 'weekly' | 'global' | 'local' | 'friends';
const BOARD_LABEL: Readonly<Record<BoardKind, string>> = Object.freeze({ weekly: 'Weekly', global: 'Global', local: 'Local', friends: 'Friends' });
const BOARD_KEY = 'pl.social.board';

/** The sub-tabs this player sees, in order. Pure. */
export function boardKinds(signedIn: boolean): BoardKind[] {
  return signedIn ? ['weekly', 'global', 'local', 'friends'] : ['weekly', 'global'];
}

/** The last sub-tab used on this device (Boards opens on it), Weekly by default. */
export function readBoardKind(signedIn: boolean): BoardKind {
  let v: string | null = null;
  try {
    v = localStorage.getItem(BOARD_KEY);
  } catch {
    v = null;
  }
  return (boardKinds(signedIn) as string[]).includes(v ?? '') ? (v as BoardKind) : 'weekly';
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
  value: number;
  tier?: string;
  me?: boolean;
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
  return { rows, pinned: { rank: Number(me.rank), name: me.name || 'You', value: Number(me.value) || 0, tier: me.tier, av: me.av, cc: me.cc, me: true } };
}

export interface BoardsDeps {
  api(op: ApiOp, args?: ApiArgs): Promise<ApiResult>;
  signedIn(): boolean;
  /** Analytics (no names, codes or ids in props). */
  track?(event: string, props?: Record<string, string | number | boolean>): void;
  onClose?(): void;
}

export interface BoardsHandle {
  close(): void;
  readonly closed: boolean;
  readonly root: HTMLElement;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const errorText = (r: ApiResult): string => (r.status === 0 ? 'No connection. Try again.' : r.status === 429 ? 'Too many tries. Wait a minute.' : 'Something went wrong. Try again.');

/** One board row: rank, avatar, name and flag, the metric (a tier, else wins). The pinned "You" row is the same. */
function rowHtml(r: BoardRow, pinned = false): string {
  return `<div class="pl-social-row pl-bd${r.me ? ' me' : ''}${pinned ? ' pin' : ''}" role="listitem"${pinned ? ' data-testid="board-pinned"' : ''}><b class="pl-rank">${pinned ? '#' : ''}${Number(r.rank)}</b>${isAvatarView(r.av) ? avatarHtml(r.av, 32) : ''}<span class="pl-social-nm"><span class="pl-social-name" data-name="${esc(String(r.name ?? ''))}"></span>${ccHtmlOrNone(r.cc)}${r.me ? '<small class="pl-bd-you">You</small>' : ''}</span><small class="pl-social-st">${r.tier ? esc(r.tier) : `${Number(r.value) || 0} wins`}</small></div>`;
}

/** Open the leaderboards window over `parent`. One at a time: the caller keeps the handle. */
export function openBoards(parent: HTMLElement, deps: BoardsDeps): BoardsHandle {
  const doc = parent.ownerDocument;
  const was = doc.activeElement as HTMLElement | null;
  const opener = was && was !== doc.body ? was : null;
  const signedIn = deps.signedIn();
  const board: { kind: BoardKind; page: number; data: Record<string, any> | null } = { kind: readBoardKind(signedIn), page: 0, data: null };
  let disposed = false;
  let seq = 0;

  const wrap = doc.createElement('div');
  wrap.className = 'pl-boards-wrap';
  wrap.dataset.testid = 'boards-modal';
  wrap.innerHTML = `<div class="pl-boards-scrim" data-a="close" aria-hidden="true"></div><section class="pl-boards" role="dialog" aria-modal="true" aria-labelledby="pl-boards-h"><header class="pl-boards-head"><span class="pl-boards-ico" aria-hidden="true">${icon('trophy', 20)}</span><h2 id="pl-boards-h">Leaderboards</h2><button type="button" class="pl-ico pl-boards-x" data-a="close" aria-label="Close" title="Close (Esc)">${icon('close', 20)}</button></header><div class="pl-social-sub pl-boards-sub" role="group" aria-label="Board"></div><div class="pl-boards-body" role="list" aria-live="polite"></div><footer class="pl-boards-foot"></footer></section>`;
  parent.appendChild(wrap);
  const dialog = wrap.querySelector<HTMLElement>('.pl-boards')!;
  const subEl = wrap.querySelector<HTMLElement>('.pl-boards-sub')!;
  const bodyEl = wrap.querySelector<HTMLElement>('.pl-boards-body')!;
  const footEl = wrap.querySelector<HTMLElement>('.pl-boards-foot')!;

  const subHtml = (): string =>
    boardKinds(signedIn)
      .map((k) => `<button type="button" class="pl-btn ghost small" data-board="${k}" data-testid="board-${k}" aria-pressed="${board.kind === k}">${BOARD_LABEL[k]}</button>`)
      .join('');

  const bodyHtml = (): string => {
    const d = board.data;
    if (!d) return `<p class="pl-social-empty pl-boards-loading">Loading…</p>`;
    const local = board.kind === 'local' ? ((d.local ?? null) as { cc?: string | null; hidden?: boolean } | null) : null;
    const cc = typeof local?.cc === 'string' && /^[A-Z]{2}$/.test(local.cc) ? local.cc : null;
    // Local: the country, with its flag, over the list (only my own country; it comes from my flag)
    const head = board.kind === 'local' && cc && !local?.hidden ? `<p class="pl-bd-head" data-testid="board-local-head"><span aria-hidden="true">${flagEmoji(cc)}</span> ${esc(countryName(cc))} · this season</p>` : '';
    if (board.kind === 'local' && !d.error && (local?.hidden || !cc)) {
      const why = local?.hidden
        ? `<p class="pl-social-empty">Show your flag to join your country's board. Only players who show their flag are on it.</p><button type="button" class="pl-btn small" data-a="board-flag" data-testid="board-show-flag">Show my flag</button>`
        : `<p class="pl-social-empty">We don't know your country yet, so there is no local board for you. Only players who show their flag are on it.</p>`;
      return `<div class="pl-bd-why" data-testid="board-local-why">${why}</div>`;
    }
    const view = boardView(d);
    const empty = d.error
      ? esc(String(d.error))
      : board.kind === 'local'
        ? `No ranked players from ${esc(countryName(cc ?? ''))} yet this season. Only players who show their flag are on it.`
        : board.kind === 'global'
          ? 'No ranked players yet this season.'
          : 'No one here yet this week.';
    const list = view.rows.length ? view.rows.map((r) => rowHtml(r)).join('') : `<p class="pl-social-empty">${empty}</p>`;
    return `${head}${list}${view.pinned ? rowHtml(view.pinned, true) : ''}`;
  };

  const footHtml = (): string => {
    const pages = Math.max(1, Number(board.data?.pages ?? 1));
    const page = board.page;
    return pages > 1
      ? `<span class="pl-pager"><button type="button" class="pl-btn ghost small" data-a="prev" aria-label="Previous page"${page <= 0 ? ' disabled' : ''}>&lsaquo;</button><small>${page + 1}/${pages}</small><button type="button" class="pl-btn ghost small" data-a="next" aria-label="Next page"${page >= pages - 1 ? ' disabled' : ''}>&rsaquo;</button></span>`
      : '';
  };

  const render = (): void => {
    if (disposed) return;
    const focused = doc.activeElement as HTMLElement | null;
    const key = focused && wrap.contains(focused) ? (focused.dataset.board ? `[data-board="${focused.dataset.board}"]` : focused.dataset.a ? `[data-a="${focused.dataset.a}"]` : null) : null;
    subEl.innerHTML = subHtml();
    bodyEl.innerHTML = bodyHtml();
    for (const n of bodyEl.querySelectorAll<HTMLElement>('[data-name]')) n.textContent = n.dataset.name ?? '';
    const foot = footHtml();
    footEl.innerHTML = foot;
    footEl.hidden = !foot;
    if (key) wrap.querySelector<HTMLElement>(key)?.focus({ preventScroll: true });
  };

  const load = async (): Promise<void> => {
    const my = ++seq;
    if ((board.kind === 'friends' || board.kind === 'local') && !signedIn) board.kind = 'weekly';
    const args: ApiArgs = { kind: board.kind, page: board.page, ...(signedIn ? { name: 'me' } : {}) };
    const r = await deps.api('board.get', args).catch((): ApiResult => ({ id: 'x', ok: false, status: 0 }));
    if (disposed || my !== seq) return;
    board.data = r.ok ? ((r.body as Record<string, any>) ?? { rows: [] }) : { rows: [], error: errorText(r) };
    deps.track?.('board_view', { kind: board.kind });
    render();
  };

  const close = (): void => {
    if (disposed) return;
    disposed = true;
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
      rememberBoardKind(kind);
      render();
      void load();
      return;
    }
    const el = t.closest<HTMLElement>('[data-a]');
    if (!el || el.hasAttribute('disabled')) return;
    switch (el.dataset.a) {
      case 'close':
        close();
        return;
      case 'prev':
      case 'next':
        board.page = Math.max(0, board.page + (el.dataset.a === 'next' ? 1 : -1));
        board.data = null;
        render();
        void load();
        return;
      case 'board-flag':
        // Local: one tap shows my flag (the same choice as Settings), then the board loads with me on it
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
