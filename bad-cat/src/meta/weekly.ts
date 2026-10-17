/**
 * Weekly Rap Sheet card viewer (GDD 3.5): "Mochi's week: 41 crimes, 9 vases, framed the Roomba 3 times. Most
 * wanted in Kitchen." Unlocks Sunday 18:00 local; before that it reads "so far". Club: animated (CSS only,
 * respects reduced motion), cameo seen counter and the Most Wanted list. Share -> onShare.
 */
import type { Unmount, WeeklyProps, WeeklySummary } from '../types';
import { btn, h } from '../ui/dom';
import { empty, escapeTo, fmt, plural, pluralNoun, scope, stamp } from './shared';

/** The card sentence (GDD 3.5). */
export function weeklySentence(catName: string, w: WeeklySummary): string {
  const name = catName.trim() || 'Tofu';
  const parts = [plural(w.crimes, 'crime')];
  const top = w.topCrimes.find((c) => c.count > 0 && !/roomba/i.test(c.name));
  if (top) parts.push(`${fmt(top.count)} ${pluralNoun(top.name, top.count)}`);
  if (w.framed > 0) parts.push(`framed the Roomba ${w.framed === 1 ? 'once' : `${fmt(w.framed)} times`}`);
  return `${name}’s week: ${parts.join(', ')}.${w.mostWantedIn ? ` Most wanted in ${w.mostWantedIn}.` : ''}`;
}

/**
 * The card's line under the big number. Review round 1: it repeated the count ("1 crime" under the big "1 crime"),
 * and the top crimes and the Roomba have their own rows below, so only "Most wanted in ..." is left ('' if none).
 */
export function weeklyExtra(w: WeeklySummary): string {
  return w.mostWantedIn ? `Most wanted in ${w.mostWantedIn}.` : '';
}

const weekLabel = (id: string): string => {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  return m ? `Week ${Number(m[2])}, ${m[1]}` : id;
};

export function mountWeekly(host: HTMLElement, p: WeeklyProps): Unmount {
  const s = scope();
  const w = p.summary;
  const name = p.catName?.trim() || 'Tofu';
  const close = btn('✕', p.onClose, 'bc-icon-btn bmt-weekly-x');
  close.setAttribute('aria-label', 'Close');

  const card =
    w.crimes > 0
      ? h(
          'article',
          { class: `bmt-wcard${p.animated ? ' is-animated' : ''}${w.ready ? '' : ' is-draft'}`, 'aria-label': `${name}'s weekly Rap Sheet` },
          h('div', { class: 'bmt-wcard-tape', 'aria-hidden': 'true' }),
          h('div', { class: 'bc-kicker bmt-wcard-week' }, weekLabel(w.weekId)),
          h('h2', { class: 'bmt-wcard-title', tabindex: -1, 'data-focus': true }, `${name}’s week`),
          h('div', { class: 'bmt-wcard-big' }, h('strong', {}, fmt(w.crimes)), h('span', {}, w.crimes === 1 ? 'crime' : 'crimes')),
          weeklyExtra(w) ? h('p', { class: 'bmt-wcard-line' }, weeklyExtra(w)) : null,
          w.topCrimes.length
            ? h('ul', { class: 'bmt-wcard-top' }, ...w.topCrimes.slice(0, 3).map((c, i) => h('li', { style: `--i:${i}` }, h('span', { class: 'bmt-wcard-ico', 'aria-hidden': 'true' }, c.icon), h('span', {}, `${fmt(c.count)} ${pluralNoun(c.name, c.count)}`))))
            : null,
          w.framed > 0 ? h('p', { class: 'bmt-wcard-roomba' }, `🤖 Roomba framed ×${fmt(w.framed)}`) : null,
          typeof w.seen === 'number' && w.seen > 0 ? h('p', { class: 'bmt-wcard-seen' }, `👀 Spotted in ${plural(w.seen, 'other room')} this week`) : null,
          w.mostWanted?.length
            ? h('div', { class: 'bmt-wcard-mw' }, h('div', { class: 'bc-kicker' }, 'Most Wanted'), h('p', {}, w.mostWanted.slice(0, 12).join(' · ')))
            : null,
          stamp(w.ready ? 'CASE CLOSED' : 'SO FAR', w.ready ? 'red' : 'blue', 'bmt-wcard-stamp'),
          h('div', { class: 'bmt-wcard-foot' }, 'tokentails.com/badcat'),
        )
      : h('div', { class: 'bmt-wcard is-empty' }, h('h2', { class: 'bmt-wcard-title', tabindex: -1, 'data-focus': true }, `${name}’s week`), empty('😇', 'No crimes this week. Suspicious.', 'One ranked run fills this card.'));

  const root = h(
    'div',
    { class: 'bc-screen bmt bmt-weekly', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Weekly Rap Sheet card' },
    h('div', { class: 'bmt-weekly-top' }, close),
    card,
    !w.ready && w.crimes > 0 ? h('p', { class: 'bc-muted bc-small bmt-center' }, 'The final card is stamped Sunday at 18:00.') : null,
    w.crimes > 0 ? btn('📸 Share my week', p.onShare, 'bc-cta bc-cta-big bmt-share') : null,
    btn('Back to the crime scene', p.onClose, 'bc-link bmt-center'),
  );
  escapeTo(s, p.onClose);
  return s.mount(host, root);
}
