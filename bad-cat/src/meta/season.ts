/**
 * Season track (GDD 8): 30 tiers, the free row (1..15) and the Club row (16..30), an XP bar, days left and claim
 * buttons. Locked Club tiers show "Join Club" (onJoinClub). Claims are optimistic: the tier turns "MINE" at once,
 * the caller persists it through onClaim (progress.claimTier) and may re-mount.
 */
import { FREE_SEASON_TIERS, SEASON_TIERS, type SeasonProps, type SeasonView, type Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { cosmeticChip, escapeTo, fmt, header, scope, screen, stamp } from './shared';

type Tier = SeasonView['tiers'][number];
export type TierState = 'claimed' | 'claim' | 'title' | 'locked' | 'club';

/** What a tier shows: claimed, claimable, reached title-only, not reached yet, or Club-locked for free players. */
export function tierState(t: Tier, club: boolean, reached: number): TierState {
  const clubTier = t.tier > FREE_SEASON_TIERS;
  if (t.claimed) return 'claimed';
  if (clubTier && !club) return 'club';
  const item = clubTier ? t.club ?? t.free : t.free;
  if (t.unlocked || t.tier <= reached) return item ? (t.unlocked ? 'claim' : 'locked') : 'title';
  return 'locked';
}

export function mountSeason(host: HTMLElement, p: SeasonProps): Unmount {
  const s = scope();
  const v = p.view;
  const claimed = new Set<number>(v.tiers.filter((t) => t.claimed).map((t) => t.tier));
  const maxed = v.tier >= SEASON_TIERS;
  const into = maxed ? v.xpPerTier : Math.max(0, v.xp - v.tier * v.xpPerTier);
  const pct = v.xpPerTier > 0 ? Math.min(100, Math.round((into / v.xpPerTier) * 100)) : 0;

  const bar = h('div', { class: 'bmt-xp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': v.xpPerTier, 'aria-valuenow': Math.min(into, v.xpPerTier), 'aria-label': 'XP to the next tier' });
  const fill = h('div', { class: 'bmt-xp-fill' });
  fill.style.width = `${pct}%`;
  bar.append(fill, h('span', { class: 'bmt-xp-paw', 'aria-hidden': 'true' }, '🐾'));

  const head = h(
    'section',
    { class: 'bc-card bmt-paper bmt-season-head' },
    h('div', { class: 'bmt-season-top' }, h('strong', { class: 'bmt-season-name' }, v.name), stamp(`${v.daysLeft} ${v.daysLeft === 1 ? 'DAY' : 'DAYS'} LEFT`, v.daysLeft <= 3 ? 'red' : 'ink')),
    h('p', { class: 'bmt-season-tier' }, maxed ? `Tier ${SEASON_TIERS}. Maximum menace.` : v.tier > 0 ? `Tier ${v.tier} of ${SEASON_TIERS} · ${fmt(into)}/${fmt(v.xpPerTier)} XP` : `Not started · ${fmt(into)}/${fmt(v.xpPerTier)} XP to tier 1`),
    bar,
    h('small', { class: 'bc-muted' }, 'Ranked run = 100 XP + score/100. Practice counts 5 times a day.'),
  );

  const node = (t: Tier): HTMLElement => {
    const clubTier = t.tier > FREE_SEASON_TIERS;
    const item = clubTier ? t.club ?? t.free : t.free;
    const li = h('li', { class: 'bmt-tier', 'data-tier': t.tier });
    const paint = (): void => {
      const st = claimed.has(t.tier) ? 'claimed' : tierState(t, p.club, v.tier);
      li.className = `bmt-tier is-${st}${clubTier ? ' is-clubrow' : ''}`;
      li.innerHTML = '';
      li.append(h('span', { class: 'bmt-tier-n' }, String(t.tier)), cosmeticChip(item, t.title));
      if (st === 'claimed') li.append(stamp('MINE', 'green', 'bmt-tier-stamp'));
      else if (st === 'claim')
        li.append(
          btn('Claim', () => {
            claimed.add(t.tier);
            paint();
            p.onClaim(t.tier);
          }, 'bc-cta bmt-claim'),
        );
      else if (st === 'club') li.append(btn('Join Club', p.onJoinClub, 'bc-cta bc-cta-gold bmt-joinclub'));
      else if (st === 'title') li.append(h('small', { class: 'bc-muted' }, 'Title earned'));
      else li.append(h('small', { class: 'bc-muted bmt-tier-lock' }, `🔒 ${fmt(Math.max(0, t.tier * v.xpPerTier - v.xp))} XP to go`));
    };
    paint();
    return li;
  };

  const free = v.tiers.filter((t) => t.tier <= FREE_SEASON_TIERS);
  const clubRow = v.tiers.filter((t) => t.tier > FREE_SEASON_TIERS);
  const freeSec = h('section', { class: 'bmt-track', 'aria-label': 'Free track' }, h('div', { class: 'bc-kicker' }, `Free track · tiers 1–${FREE_SEASON_TIERS}`), h('ol', { class: 'bmt-tiers' }, ...free.map(node)));
  const clubSec = h(
    'section',
    { class: `bmt-track bmt-track-club${p.club ? '' : ' is-locked'}`, 'aria-label': 'Club track' },
    h('div', { class: 'bc-kicker' }, `Chaos Club track · tiers ${FREE_SEASON_TIERS + 1}–${SEASON_TIERS}`),
    p.club ? null : h('p', { class: 'bc-muted bc-small' }, 'Fifteen more shiny things. Your cat would look ridiculous. In a good way.'),
    h('ol', { class: 'bmt-tiers' }, ...clubRow.map(node)),
    p.club ? null : btn('Join the Chaos Club', p.onJoinClub, 'bc-cta bc-cta-gold bmt-joinclub-big'),
  );

  // offline (no API URL or no server): no Club track, no "Join Club" (GDD 7.4, 0c)
  const root = screen('bmt-season', header('Season track', p.onBack, 'Season'), head, freeSec, p.clubUi === false && !p.club ? null : clubSec);
  escapeTo(s, p.onBack);
  const un = s.mount(host, root);
  // scroll each row to the first claimable tier, else to the next tier to reach
  for (const ol of Array.from(root.querySelectorAll<HTMLElement>('.bmt-tiers'))) {
    const target = ol.querySelector<HTMLElement>('.is-claim') ?? ol.querySelector<HTMLElement>(`[data-tier="${v.tier + 1}"]`);
    if (target && target.offsetLeft > 0) ol.scrollLeft = Math.max(0, target.offsetLeft - ol.offsetLeft - 24);
  }
  return un;
}
