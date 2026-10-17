/**
 * The daily board (GDD 10 Phase 2, 3.4 "global board: top 100 + your rank"): one day's top 100 registered players
 * from the server (runs replayed and checked there), your own run and rank, and a day stepper back through the
 * archive. Guests and signed-out players see the board and a "Sign in to rank" line; nobody's account name is shown,
 * only the cat's name and coat.
 */
import type { BoardMeResponse, BoardProps, BoardResponse, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { colourFor, empty, escapeTo, fmt, header, scope, screen, stamp } from './shared';

const STAMP_TONE: Record<string, 'gold' | 'green' | 'red'> = { perfect: 'gold', clean: 'green', caught: 'red' };
const STAMP_TEXT: Record<string, string> = { perfect: 'PERFECT', clean: 'CLEAN', caught: 'CUDDLED' };

export function mountBoard(host: HTMLElement, p: BoardProps): Unmount {
  const s = scope();
  let day = p.dayNo;
  let seq = 0;
  const title = h('div', { class: 'bmt-board-day', 'aria-live': 'polite' });
  const list = h('ol', { class: 'bmt-board bmt-global' });
  const mine = h('p', { class: 'bmt-board-sum', 'aria-live': 'polite' });
  const prev = btn('‹ Day before', () => go(day - 1), 'bc-link bmt-day-prev');
  const next = btn('Next day ›', () => go(day + 1), 'bc-link bmt-day-next');

  const row = (rank: number, name: string, score: number, stampId: string, catCode?: string, me = false): HTMLElement => {
    const dot = h('span', { class: `bmt-dot${me ? ' is-me' : ''}`, 'aria-hidden': 'true' }, me ? '★' : '');
    if (!me) dot.style.background = colourFor(catCode || name);
    return h(
      'li',
      { class: `bmt-row${me ? ' is-me' : ''}`, 'aria-label': `${me ? 'You' : name}: ${fmt(score)}, rank ${rank}` },
      h('span', { class: 'bmt-row-rank' }, `#${rank}`),
      dot,
      h('span', { class: 'bmt-row-name' }, h('strong', {}, me ? 'You' : name), rank === 1 ? stamp('TOP CAT', 'gold', 'bmt-row-stamp') : null),
      h('span', { class: 'bmt-row-score' }, fmt(score), ' ', stamp(STAMP_TEXT[stampId] ?? 'CLEAN', STAMP_TONE[stampId] ?? 'green', 'bmt-mini')),
    );
  };

  const draw = (board: BoardResponse | null, me: BoardMeResponse | null): void => {
    list.innerHTML = '';
    title.textContent = board?.label ?? `Day #${day}`;
    prev.toggleAttribute('disabled', day <= 1);
    next.toggleAttribute('disabled', day >= p.todayNo);
    if (!board) {
      list.append(h('li', { class: 'bmt-row is-empty' }, empty('📡', 'The board is napping.', 'Check your connection and try again.')));
    } else if (!board.rows.length) {
      list.append(h('li', { class: 'bmt-row is-empty' }, empty('🏆', 'No ranked runs yet.', 'Be the first bad cat on this board.')));
    } else {
      for (const r of board.rows) {
        const isMe = !!me?.saved && !me.guest && me.rank === r.rank && me.score === r.score;
        list.append(row(r.rank, r.name, r.score, r.stamp, r.catCode, isMe));
      }
    }
    // your line under the board
    mine.innerHTML = '';
    const local = p.localScore?.(day);
    if (me?.saved && typeof me.score === 'number') {
      if (me.guest) mine.append(`Your run: ${fmt(me.score)}. `, btn('Sign in to rank', p.onSignIn, 'bc-link'));
      else mine.append(me.rank ? `You are #${fmt(me.rank)} with ${fmt(me.score)}.` : `Your run: ${fmt(me.score)}.`);
    } else if (!p.signedIn) {
      mine.append(typeof local === 'number' ? `Your run: ${fmt(local)} (this device). ` : '', btn('Sign in to rank', p.onSignIn, 'bc-link'));
    } else if (typeof local === 'number') {
      mine.append(`Your run: ${fmt(local)}. It goes on the board once it is saved.`);
    } else if (day === p.todayNo) {
      mine.append(btn("Play today's ranked run", () => p.onPlay(day), 'bc-cta bmt-board-play'));
    }
  };

  const go = (d: number): void => {
    if (d < 1 || d > p.todayNo) return;
    day = d;
    const mineSeq = ++seq;
    title.textContent = 'Loading the board…';
    void Promise.all([p.load(day).catch(() => null), p.signedIn ? p.loadMe(day).catch(() => null) : Promise.resolve(null)]).then(([board, me]) => {
      if (s.dead || mineSeq !== seq) return;
      draw(board, me);
    });
  };

  const root = screen(
    'bmt-globalboard',
    header('Daily board', p.onBack, 'Top 100 bad cats'),
    h('div', { class: 'bmt-day-nav' }, prev, title, next),
    list,
    mine,
    h('small', { class: 'bc-muted bmt-board-note' }, 'Every run is replayed on our server before it counts. Guests play, but only signed-in cats rank.'),
  );
  escapeTo(s, p.onBack);
  const un = s.mount(host, root);
  go(day);
  return un;
}
