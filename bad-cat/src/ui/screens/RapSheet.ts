/**
 * Rap Sheet + season track (GDD 8): rank, crimes on file, the week's top crimes, the season tiers with their
 * rewards (claim a reached tier), the streak and its freezes. A plain list; W2-META builds the full mugshot pages.
 */
import type { CrimeView, RapSheetSummary, SeasonView, StreakView, WeeklySummary } from '../../types';
import { COPY, formatScore } from '../copy';
import { btn, h } from '../dom';

export interface RapSheetProps {
  catName: string;
  rap: RapSheetSummary | null;
  crimes: CrimeView[];
  weekly: WeeklySummary | null;
  season: SeasonView | null;
  streak: StreakView | null;
  /** Club: Club-track rewards unlock on tiers 16..30. */
  club: boolean;
  onClaim?(tier: number): string | null;
  onBack(): void;
}

export function mountRapSheet(host: HTMLElement, p: RapSheetProps): () => void {
  const rap = p.rap;
  const head = h(
    'section',
    { class: 'bc-card bc-rap-head' },
    h('div', { class: 'bc-kicker' }, 'WANTED'),
    h('h2', {}, p.catName || 'Tofu'),
    rap
      ? h('p', {}, h('strong', {}, rap.rank), ` · ${formatScore(rap.total)} crimes · ${rap.distinct}/${rap.catalog} on file · ${rap.framed} Roombas framed`)
      : h('p', { class: 'bc-muted' }, 'A clean record. For now.'),
    rap?.topCrimes.length
      ? h('ul', { class: 'bc-rap-top' }, ...rap.topCrimes.slice(0, 5).map((c) => h('li', {}, `${c.icon} ${formatScore(c.count)} × ${c.name}`)))
      : null,
  );
  const week = p.weekly
    ? h(
        'section',
        { class: 'bc-card' },
        h('div', { class: 'bc-kicker' }, p.weekly.ready ? 'This week' : 'This week so far'),
        h('p', {}, `${formatScore(p.weekly.crimes)} crimes${p.weekly.mostWantedIn ? ` · most wanted in the ${p.weekly.mostWantedIn}` : ''}`),
        p.weekly.topCrimes.length ? h('small', { class: 'bc-muted' }, p.weekly.topCrimes.map((c) => `${c.icon} ${c.count}`).join('  ')) : null,
      )
    : null;
  const streak = p.streak
    ? h(
        'section',
        { class: 'bc-card' },
        h('div', { class: 'bc-kicker' }, 'Nine Lives'),
        h('p', {}, `🔥 ${p.streak.current} days · best ${p.streak.best} · ${p.streak.freezesLeft} freeze${p.streak.freezesLeft === 1 ? '' : 's'} left`),
        p.streak.breaksTonight ? h('small', { class: 'bc-dare-note' }, 'Your streak breaks tonight. One ranked run keeps it.') : null,
        p.streak.local ? h('small', { class: 'bc-muted' }, COPY.storageBlocked) : null,
      )
    : null;
  const tiers = h('ol', { class: 'bc-tiers' });
  const drawTiers = (): void => {
    tiers.innerHTML = '';
    const s = p.season;
    if (!s) return;
    for (const t of s.tiers) {
      const reward = (p.club ? t.club ?? t.free : t.free) ?? null;
      const li = h(
        'li',
        { class: `bc-tier${t.unlocked ? ' is-open' : ''}${t.claimed ? ' is-claimed' : ''}` },
        h('span', { class: 'bc-tier-n' }, `${t.tier}`),
        h('span', { class: 'bc-tier-r' }, reward ? reward.name : 'Title'),
      );
      if (t.unlocked && !t.claimed && reward && p.onClaim) {
        li.append(
          btn('Claim', () => {
            const got = p.onClaim?.(t.tier);
            if (got) {
              t.claimed = true;
              drawTiers();
            }
          }, 'bc-link'),
        );
      }
      tiers.append(li);
    }
  };
  drawTiers();
  const season = p.season
    ? h(
        'section',
        { class: 'bc-card' },
        h('div', { class: 'bc-kicker' }, `${p.season.name} · ${p.season.daysLeft} days left`),
        h('p', {}, `${p.season.tier > 0 ? `Tier ${p.season.tier}` : 'Tier 1 next'} · ${p.season.xp % p.season.xpPerTier}/${p.season.xpPerTier} XP to the next`),
        tiers,
      )
    : null;
  const crimes = p.crimes.length
    ? h(
        'section',
        { class: 'bc-card' },
        h('div', { class: 'bc-kicker' }, 'Crimes on file'),
        h('ul', { class: 'bc-rap-crimes' }, ...p.crimes.slice(0, 60).map((c) => h('li', {}, c.name))),
      )
    : null;
  const root = h(
    'div',
    { class: 'bc-screen bc-rapsheet' },
    h('header', { class: 'bc-head' }, btn(`‹ ${COPY.back}`, p.onBack, 'bc-link'), h('h2', {}, 'Rap Sheet')),
    head,
    streak,
    week,
    season,
    crimes,
  );
  host.appendChild(root);
  return () => root.remove();
}
