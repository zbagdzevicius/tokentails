/**
 * My rooms (GDD 6.4): rooms published with the Room Maker (local, max 30), newest first, with Play / Share / Remix
 * and a "New room" button. Cleared rooms get a stamp; uncleared ones are drafts until the maker clears them.
 */
import type { MyRoom, MyRoomsProps, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { empty, escapeTo, header, scope, screen, stamp } from './shared';

const when = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${d.getDate()}`;
};
const buildTime = (ms: number | undefined): string => {
  if (!ms || ms <= 0) return '';
  const sec = Math.round(ms / 1000);
  // round 2: a remix "built in 4s" said nothing; under 30 s is hidden, the rest is rounded to minutes
  if (sec < 30) return '';
  return `built in ${Math.max(1, Math.round(sec / 60))} min`;
};

export function mountMyRooms(host: HTMLElement, p: MyRoomsProps): Unmount {
  const s = scope();
  /** The room card (a top-down map from the shell) when the shell can draw it, else the house. */
  const thumbOf = (r: MyRoom): HTMLElement => {
    const el = h('div', { class: 'bmt-room-thumb', 'aria-hidden': 'true' });
    let svg: string | null = null;
    try {
      svg = p.thumb?.(r) ?? null;
    } catch {
      svg = null;
    }
    if (svg && svg.startsWith('<svg')) {
      el.classList.add('is-map');
      el.innerHTML = svg; // built by roomThumbSvg from numbers and an escaped title only
    } else el.textContent = '🏠';
    return el;
  };
  const rooms = [...p.rooms].sort((a, b) => b.at - a.at);
  const card = (r: MyRoom): HTMLElement => {
    const meta = [when(r.at), buildTime(r.buildMs), r.ancestors?.length ? `remix of ${r.ancestors.length}` : ''].filter(Boolean).join(' · ');
    return h(
      'li',
      { class: `bmt-room${r.cleared ? ' is-cleared' : ' is-draft'}` },
      thumbOf(r),
      h(
        'div',
        { class: 'bmt-room-txt' },
        h('strong', {}, r.title || 'Untitled crime scene'),
        h('small', { class: 'bc-muted' }, `by ${r.author || 'you'}${meta ? ` · ${meta}` : ''}`),
        r.cleared ? stamp('CLEARED', 'green', 'bmt-room-stamp') : stamp('NOT CLEARED', 'ink', 'bmt-room-stamp'),
      ),
      h(
        'div',
        { class: 'bmt-room-acts' },
        btn('▶ Play', () => p.onPlay(r), 'bc-cta bmt-room-play'),
        r.cleared ? btn('Share', () => p.onShare(r), 'bc-cta bc-cta-soft bmt-room-share') : null,
        // Phase 2 room feed: a cleared room with its clear run can go to the public feed (once)
        p.onFeed && r.cleared && r.clear?.length
          ? r.inFeed
            ? stamp('IN THE FEED', 'blue', 'bmt-room-feed')
            : btn('Post to feed', () => p.onFeed!(r), 'bc-cta bc-cta-soft bmt-room-feed')
          : null,
        btn('Remix', () => p.onRemix(r), 'bc-cta bc-cta-soft bmt-room-remix'),
      ),
    );
  };
  const root = screen(
    'bmt-rooms',
    header('My rooms', p.onBack, 'Room Maker'),
    btn('＋ New room', p.onNew, 'bc-cta bc-cta-big bmt-new'),
    rooms.length ? h('ol', { class: 'bmt-roomlist' }, ...rooms.map(card)) : empty('📐', 'No rooms yet.', 'Every great crime scene starts empty. Put a vase somewhere silly.'),
    // only while some room still waits for its clear (a CLEARED room above the hint read as a contradiction)
    rooms.some((r) => !r.cleared) ? h('small', { class: 'bc-muted' }, 'Clear your own room once to share it.') : null,
  );
  escapeTo(s, p.onBack);
  return s.mount(host, root);
}
