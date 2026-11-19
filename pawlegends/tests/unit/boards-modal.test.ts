// @vitest-environment happy-dom
/**
 * The leaderboards window (founder Nov 19: its own modal, opened from Boards under # Join on Home): Weekly, Global,
 * Local (players of my country, from my flag) and Friends; the last board remembered; my own row shown once (on the
 * list when I am on the page, else pinned under it, in the same row style); Esc and the scrim close it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { boardKinds, boardView, openBoards, readBoardKind } from '../../src/social/boardsModal';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const ok = (body: unknown): ApiResult => ({ id: 'x', ok: true, status: 200, body });

function sheet(answer: (op: string, args: any) => ApiResult | null, signedIn = true) {
  const calls: { op: string; args: any }[] = [];
  const api = vi.fn(async (op: string, args?: any): Promise<ApiResult> => {
    calls.push({ op, args });
    return answer(op, args) ?? ok({});
  });
  const track = vi.fn();
  const onClose = vi.fn();
  const h = openBoards(document.body, { api: api as never, signedIn: () => signedIn, track, onClose });
  return { h, calls, track, onClose };
}

describe('the window', () => {
  it('a modal dialog named Leaderboards; Esc closes it, focus goes back to the opener', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { h, track, onClose } = sheet((op) => (op === 'board.get' ? ok({ rows: [{ rank: 1, name: 'Mira', value: 9 }], page: 0, pages: 1 }) : null));
    const dlg = document.querySelector('.pl-boards')!;
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('pl-boards-h')!.textContent).toBe('Leaderboards');
    await flush();
    expect(track).toHaveBeenCalledWith('board_view', { kind: 'weekly' });
    expect(document.querySelector('.pl-bd .pl-social-name')!.textContent).toBe('Mira');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(h.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="boards-modal"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the scrim and the close button close it; the pager loads the next page', async () => {
    const { calls } = sheet((op, args) => (op === 'board.get' ? ok({ rows: [{ rank: args.page * 10 + 1, name: 'A', value: 1 }], page: args.page, pages: 3 }) : null));
    await flush();
    document.querySelector<HTMLElement>('[data-a="next"]')!.click();
    await flush();
    expect(calls.filter((c) => c.op === 'board.get').map((c) => c.args.page)).toEqual([0, 1]);
    expect(document.querySelector('.pl-pager small')!.textContent).toBe('2/3');
    document.querySelector<HTMLElement>('.pl-boards-scrim')!.click();
    expect(document.querySelector('[data-testid="boards-modal"]')).toBeNull();
    const again = sheet((op) => (op === 'board.get' ? ok({ rows: [], page: 0, pages: 1 }) : null));
    document.querySelector<HTMLElement>('.pl-boards-x')!.click();
    expect(again.h.closed).toBe(true);
  });
});

describe('board sub-tabs', () => {
  it('Local and Friends only with an account; Weekly by default; the last one used is remembered', () => {
    expect(boardKinds(true)).toEqual(['weekly', 'global', 'local', 'friends']);
    expect(boardKinds(false)).toEqual(['weekly', 'global']);
    expect(readBoardKind(true)).toBe('weekly');
    localStorage.setItem('pl.social.board', 'local');
    expect(readBoardKind(true)).toBe('local');
    // a signed-out player never opens on Local
    expect(readBoardKind(false)).toBe('weekly');
    localStorage.setItem('pl.social.board', 'nonsense');
    expect(readBoardKind(true)).toBe('weekly');
  });
});

describe('my own row', () => {
  it('no pinned row when I am on the page (marked me by the server)', () => {
    const v = boardView({ rows: [{ rank: 1, name: 'Zygis', value: 0, me: true }, { rank: 2, name: 'Angelinnaa', value: 0 }], me: { rank: 1, value: 0 } });
    expect(v.pinned).toBeNull();
    expect(v.rows.filter((r) => r.me)).toHaveLength(1);
  });

  it('an older server (no me mark): my rank and name on the page still means no pinned row', () => {
    const v = boardView({ rows: [{ rank: 1, name: 'Zygis', value: 0 }], me: { rank: 1, value: 0, name: 'Zygis' } });
    expect(v.pinned).toBeNull();
    expect(v.rows[0].me).toBe(true);
  });

  it('off the page: one pinned row with my avatar, flag, name and metric', () => {
    const av = { i: 'h:clem' };
    const v = boardView({ rows: [{ rank: 1, name: 'A', value: 9 }], me: { rank: 14, value: 3, name: 'Zygis', cc: 'LT', av } });
    expect(v.pinned).toEqual({ rank: 14, name: 'Zygis', value: 3, tier: undefined, av, cc: 'LT', me: true });
    expect(boardView({ rows: [], me: null }).pinned).toBeNull();
  });

  it('the Friends board with me on it draws me once, highlighted, with no "#1 You" row under it', async () => {
    localStorage.setItem('pl.social.board', 'friends');
    sheet((op) =>
      op === 'board.get'
        ? ok({ rows: [{ rank: 1, name: 'Zygis', value: 0, cc: 'LT', me: true }, { rank: 2, name: 'Angelinnaa', value: 0 }, { rank: 3, name: 'Irvidas', value: 0, cc: 'LT' }], me: { rank: 1, value: 0 }, page: 0, pages: 1 })
        : null,
    );
    await flush();
    expect(document.querySelectorAll('.pl-bd')).toHaveLength(3);
    expect(document.querySelectorAll('.pl-bd.me')).toHaveLength(1);
    expect(document.querySelector('[data-testid="board-pinned"]')).toBeNull();
    expect(document.querySelector('[data-board="friends"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Local board', () => {
  it('opens on Local when it was used last: the country header and the rows of my country', async () => {
    localStorage.setItem('pl.social.board', 'local');
    const { calls } = sheet((op) =>
      op === 'board.get'
        ? ok({ period: 's1', rows: [{ rank: 1, name: 'Irvidas', value: 40, tier: 'Alley II', cc: 'LT' }], me: { rank: 7, value: 5, tier: 'Kitten I', name: 'Zygis', cc: 'LT' }, page: 0, pages: 1, local: { cc: 'LT', hidden: false } })
        : null,
    );
    await flush();
    expect(calls.find((c) => c.op === 'board.get')!.args).toMatchObject({ kind: 'local', name: 'me' });
    expect(document.querySelector('[data-testid="board-local-head"]')!.textContent).toContain('Lithuania');
    expect(document.querySelectorAll('.pl-bd:not(.pin)')).toHaveLength(1);
    const pin = document.querySelector('[data-testid="board-pinned"]')!;
    expect(pin.textContent).toContain('#7');
    expect(pin.textContent).toContain('Kitten I');
    expect(pin.querySelector('.pl-social-name')!.getAttribute('data-name')).toBe('Zygis');
  });

  it('a hidden flag: says why and one tap shows the flag, then the board loads', async () => {
    let hidden = true;
    const { calls } = sheet((op) => {
      if (op === 'flag.set') {
        hidden = false;
        return ok({ cc: 'LT', hideFlag: false });
      }
      if (op === 'board.get')
        return hidden
          ? ok({ period: 's1', rows: [], me: null, page: 0, pages: 1, local: { cc: 'LT', hidden: true } })
          : ok({ period: 's1', rows: [{ rank: 1, name: 'Zygis', value: 10, tier: 'Alley I', cc: 'LT', me: true }], me: { rank: 1, value: 10 }, page: 0, pages: 1, local: { cc: 'LT', hidden: false } });
      return null;
    });
    document.querySelector<HTMLElement>('[data-board="local"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="board-local-why"]')!.textContent).toMatch(/Show your flag to join your country's board/);
    document.querySelector<HTMLElement>('[data-testid="board-show-flag"]')!.click();
    await flush();
    expect(calls.some((c) => c.op === 'flag.set' && c.args?.hideFlag === false)).toBe(true);
    expect(localStorage.getItem('pl.social.board')).toBe('local');
    expect(document.querySelector('[data-testid="board-local-why"]')).toBeNull();
    expect(document.querySelectorAll('.pl-bd.me')).toHaveLength(1);
  });

  it('an unknown country and an empty country board explain themselves', async () => {
    localStorage.setItem('pl.social.board', 'local');
    sheet((op) => (op === 'board.get' ? ok({ period: 's1', rows: [], me: null, page: 0, pages: 1, local: { cc: null, hidden: false } }) : null));
    await flush();
    expect(document.querySelector('[data-testid="board-local-why"]')!.textContent).toMatch(/don't know your country/);
    document.body.innerHTML = '';
    sheet((op) => (op === 'board.get' ? ok({ period: 's1', rows: [], me: null, page: 0, pages: 1, local: { cc: 'LV', hidden: false } }) : null));
    await flush();
    expect(document.querySelector('.pl-social-empty')!.textContent).toMatch(/No ranked players from Latvia yet this season/);
  });

  it('signed out: no Local or Friends sub-tab', async () => {
    sheet((op) => (op === 'board.get' ? ok({ rows: [], page: 0, pages: 1 }) : null), false);
    await flush();
    expect(document.querySelector('[data-board="local"]')).toBeNull();
    expect(document.querySelector('[data-board="friends"]')).toBeNull();
  });
});
