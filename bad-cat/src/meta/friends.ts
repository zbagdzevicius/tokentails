/**
 * Friends board (GDD 6.3): one room's board built from received dare ghosts (local, max 50). Name, cat colour dot,
 * score, Race and Hide; your own score is slotted in and highlighted. Ghosts recorded under an older SIM_VERSION are
 * "replay only" (they still race as a replay, their score is not comparable).
 */
import { SIM_VERSION, type FriendGhost, type FriendsProps, type Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { colourFor, empty, escapeTo, fmt, header, scope, screen, stamp } from './shared';

export const replayOnly = (g: FriendGhost): boolean => g.simVersion !== SIM_VERSION;

export function mountFriends(host: HTMLElement, p: FriendsProps): Unmount {
  const s = scope();
  const hidden = new Set<FriendGhost>();
  const list = h('ol', { class: 'bmt-board' });
  const summary = h('p', { class: 'bmt-board-sum', 'aria-live': 'polite' });

  const draw = (): void => {
    list.innerHTML = '';
    const ghosts = p.entries.filter((g) => !hidden.has(g)).sort((a, b) => Number(replayOnly(a)) - Number(replayOnly(b)) || b.score - a.score || a.at - b.at);
    type Row = { me: true; score: number } | { me: false; g: FriendGhost };
    const rows: Row[] = ghosts.map((g) => ({ me: false, g }));
    if (typeof p.myScore === 'number') {
      const at = rows.findIndex((r) => !r.me && (replayOnly(r.g) || r.g.score < p.myScore!));
      rows.splice(at < 0 ? rows.length : at, 0, { me: true, score: p.myScore });
    }
    let rank = 0;
    for (const r of rows) {
      if (r.me) {
        rank++;
        list.append(
          h(
            'li',
            { class: 'bmt-row is-me', 'aria-label': `You: ${fmt(r.score)}` },
            h('span', { class: 'bmt-row-rank' }, `#${rank}`),
            h('span', { class: 'bmt-dot is-me', 'aria-hidden': 'true' }, '★'),
            h('span', { class: 'bmt-row-name' }, h('strong', {}, 'You'), rank === 1 && rows.length > 1 ? stamp('TOP CAT', 'gold', 'bmt-row-stamp') : null),
            h('span', { class: 'bmt-row-score' }, fmt(r.score)),
          ),
        );
        continue;
      }
      const g = r.g;
      const old = replayOnly(g);
      if (!old) rank++;
      const dot = h('span', { class: 'bmt-dot', 'aria-hidden': 'true' });
      dot.style.background = colourFor(g.catCode || g.name);
      const name = g.name?.trim() || 'Mystery cat';
      list.append(
        h(
          'li',
          { class: `bmt-row${old ? ' is-old' : ''}`, 'aria-label': `${name}: ${fmt(g.score)}${old ? ', replay only' : ''}` },
          h('span', { class: 'bmt-row-rank' }, old ? '–' : `#${rank}`),
          dot,
          h('span', { class: 'bmt-row-name' }, h('strong', {}, name), old ? h('small', { class: 'bmt-old' }, 'replay only · old rules') : null),
          h('span', { class: 'bmt-row-score' }, fmt(g.score)),
          h(
            'span',
            { class: 'bmt-row-acts' },
            btn(old ? '▶ Watch' : '🏁 Race', () => p.onRace(g), 'bc-cta bmt-race'),
            btn('Hide', () => {
              hidden.add(g);
              p.onHide(g);
              draw();
            }, 'bc-link bmt-hide'),
          ),
        ),
      );
    }
    const live = ghosts.filter((g) => !replayOnly(g));
    const top = live[0];
    summary.textContent =
      typeof p.myScore === 'number' && top
        ? p.myScore > top.score
          ? `You rule ${p.roomLabel}. ${top.name || 'They'} will want a rematch.`
          : `${top.name || 'Someone'} still rules ${p.roomLabel} by ${fmt(top.score - p.myScore)}.`
        : '';
  };
  draw();

  const root = screen(
    'bmt-friends',
    header(p.roomLabel, p.onBack, 'Friends board'),
    summary,
    p.entries.length ? list : null,
    p.entries.length ? h('small', { class: 'bc-muted' }, 'Built from dares people sent you. Kept on this device.') : empty('📭', 'No dares yet.', 'Send one and see who blinks first.'),
    !p.entries.length && p.onDare ? btn('📨 Send a dare', () => p.onDare?.(), 'bc-cta bc-cta-gold bmt-send-dare') : null,
  );
  escapeTo(s, p.onBack);
  return s.mount(host, root);
}
