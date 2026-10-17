/**
 * The room feed (GDD 6.4 Phase 2 "public room feed"): player rooms that passed the server's Room Maker checks (the
 * maker's own clear run replayed on the server) and a review. Newest or most played, 20 a page, Play and Report.
 * A report hides a room for review after a few; reporting twice from one device is not offered.
 */
import type { FeedProps, FeedResponse, FeedRoom, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { empty, escapeTo, fmt, header, scope, screen, stamp } from './shared';

export function mountFeed(host: HTMLElement, p: FeedProps): Unmount {
  const s = scope();
  let sort: 'new' | 'top' = 'new';
  let cursor: string | undefined;
  let seq = 0;
  const reported = new Set<string>();
  const list = h('ol', { class: 'bmt-roomlist bmt-feed' });
  const more = btn('More rooms', () => load(false), 'bc-cta bc-cta-soft bmt-feed-more');
  const status = h('p', { class: 'bc-muted bmt-feed-status', 'aria-live': 'polite' });
  const tabNew = btn('Newest', () => setSort('new'), 'bc-chip bmt-feed-tab');
  const tabTop = btn('Most played', () => setSort('top'), 'bc-chip bmt-feed-tab');

  const thumbOf = (r: FeedRoom): HTMLElement => {
    const el = h('div', { class: 'bmt-room-thumb', 'aria-hidden': 'true' });
    let svg: string | null = null;
    try {
      svg = p.thumb?.(r.code, r.shell) ?? null;
    } catch {
      svg = null;
    }
    if (svg && svg.startsWith('<svg')) {
      el.classList.add('is-map');
      el.innerHTML = svg; // roomThumbSvg: numbers and an escaped title only
    } else el.textContent = '🏠';
    return el;
  };

  const card = (r: FeedRoom): HTMLElement => {
    const report = btn('Report', () => {
      if (reported.has(r.id)) return;
      reported.add(r.id);
      report.setAttribute('disabled', '');
      void p.onReport(r).then((ok) => {
        report.textContent = ok ? 'Reported' : 'Try later';
        if (!ok) {
          reported.delete(r.id);
          report.removeAttribute('disabled');
        }
      });
    }, 'bc-link bmt-feed-report');
    const sub = [`by ${r.author || 'a bad cat'}`, r.ancestors.length ? `remix of ${r.ancestors[0]}` : '', `${fmt(r.plays)} plays`].filter(Boolean).join(' · ');
    return h(
      'li',
      { class: 'bmt-room is-cleared' },
      thumbOf(r),
      h('div', { class: 'bmt-room-txt' }, h('strong', {}, r.title || 'A player room'), h('small', { class: 'bc-muted' }, sub), r.plays >= 100 ? stamp('HOT', 'red', 'bmt-room-stamp') : null),
      h('div', { class: 'bmt-room-acts' }, btn('▶ Play', () => p.onPlay(r), 'bc-cta bmt-room-play'), report),
    );
  };

  const draw = (res: FeedResponse | null, fresh: boolean): void => {
    if (fresh) list.innerHTML = '';
    if (!res) {
      status.textContent = 'The feed is napping. Try again in a moment.';
      more.hidden = true;
      return;
    }
    status.textContent = '';
    for (const r of res.rooms) list.append(card(r));
    if (fresh && !res.rooms.length) list.append(h('li', {}, empty('🧱', 'No rooms here yet.', 'Build one and post it: the first room in the feed gets all the cats.')));
    cursor = res.next;
    more.hidden = !res.next;
  };

  const load = (fresh: boolean): void => {
    const mine = ++seq;
    if (fresh) cursor = undefined;
    status.textContent = 'Loading rooms…';
    void p
      .load(sort, cursor)
      .catch(() => null)
      .then((res) => {
        if (s.dead || mine !== seq) return;
        draw(res, fresh);
      });
  };

  const setSort = (next: 'new' | 'top'): void => {
    sort = next;
    tabNew.classList.toggle('is-on', sort === 'new');
    tabTop.classList.toggle('is-on', sort === 'top');
    tabNew.setAttribute('aria-pressed', String(sort === 'new'));
    tabTop.setAttribute('aria-pressed', String(sort === 'top'));
    load(true);
  };

  more.hidden = true;
  const root = screen(
    'bmt-feedscreen',
    header('Room feed', p.onBack, 'Rooms by players'),
    h('div', { class: 'bmt-feed-tabs', role: 'group', 'aria-label': 'Sort rooms' }, tabNew, tabTop),
    btn('🛠️ Build a room', p.onBuild, 'bc-cta bc-cta-soft bmt-feed-build'),
    list,
    status,
    more,
  );
  escapeTo(s, p.onBack);
  const un = s.mount(host, root);
  setSort('new');
  return un;
}
