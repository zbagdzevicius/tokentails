/** Home: today's room (ranked or practice), The Glass, past rooms, my cat, settings, pre-sale (session ≥ 2). */
import type { DayRecord } from '../../types';
import { COPY, STAMP_LABEL, dayTag, formatScore } from '../copy';
import { btn, h } from '../dom';

export interface HomeProps {
  todayNo: number;
  todayLabel: string;
  /** Today's ranked run length in seconds (75; 90 on boss days). */
  rankedSeconds?: number;
  /** Short label for the "ranked run is ready" line ("Living room #2"); default "Kitchen #n". */
  todayShort?: string;
  record: DayRecord | null;
  readyRanked: boolean;
  /** After a first heist from another day's link: "Play Bathroom #3 again" next to today's ranked run (round 2). */
  linkAgain?: { label: string; onPlay(): void } | null;
  catName: string;
  presale: boolean;
  storagePersistent: boolean;
  /** Live streak (current, best), when the progress lane is there. */
  streak?: { current: number; best: number } | null;
  /** The last 7 days, oldest first: the stamp of the ranked run, or null when not played. */
  week?: { label: string; stamp: DayRecord['stamp'] | null; today: boolean }[];
  onPlayToday(): void;
  onGlass(): void;
  onArchive(): void;
  onMyCat(): void;
  onSettings(): void;
  onPresale(): void;
  /** FULL build: Rap Sheet + season, "Your cats" (Club: up to 5), extra links (Club, shop, gifts when online). */
  onRapSheet?(): void;
  /** Season line under the streak, e.g. "Season 1 · tier 4 · 120/300 XP". */
  seasonLine?: string;
  /** This month's Pink Paw treat meter, e.g. "$12.40 to Pink Paw this month". */
  treatLine?: string;
  /** Extra buttons in the bottom row (label + action). */
  links?: { label: string; onClick(): void }[];
  /** "Add to Home Screen" (after the 2nd daily). */
  a2hs?: { ios: boolean; onInstall(): void } | null;
  // ----- wave 3 -----
  /** Today's room card: weekday chips, the human, the twist, boss badge, theme. */
  room?: { chips: string[]; human?: string; twist?: string; boss?: boolean; theme?: string; credit?: string } | null;
  /** "Tomorrow: Toilet Paper Wednesday" (the reason to come back, GDD 3.3). */
  tomorrow?: string;
  /** Nine Lives (streak freezes) left this week. */
  freezes?: { left: number; perWeek: number } | null;
  /** Club seen counter: "Mochi was seen in 3,214 rooms this week". */
  seenLine?: string;
  /** Weekly Rap Sheet card ready (Sunday 18:00) and not opened yet. */
  weeklyReady?: (() => void) | null;
  /** A small paywall card slot (streak_break, GDD 9.2): the shell mounts money's offer card into it. */
  offerSlot?: (host: HTMLElement) => (() => void) | void;
}

export function mountHome(host: HTMLElement, p: HomeProps): () => void {
  const today = h(
    'section',
    { class: `bc-card bc-today${p.readyRanked ? ' is-ready' : ''}` },
    p.readyRanked ? h('div', { class: 'bc-ready' }, COPY.readyRanked(p.todayNo, p.todayShort)) : null,
    h('div', { class: 'bc-kicker' }, `Today · ${dayTag(p.todayNo)}`, p.room?.boss ? h('span', { class: 'bc-boss-badge' }, '👑 BOSS') : null),
    h('h2', {}, p.todayLabel),
    p.room?.chips.length || p.room?.human
      ? h(
          'div',
          { class: 'bc-room-chips' },
          ...(p.room?.chips ?? []).map((c) => h('span', { class: 'bc-chip-static' }, c)),
          p.room?.human ? h('span', { class: 'bc-chip-static' }, `🧑 ${p.room.human}`) : null,
        )
      : null,
    p.room?.twist ? h('p', { class: 'bc-twist' }, `✨ ${p.room.twist}`) : null,
    p.room?.credit ? h('p', { class: 'bc-muted bc-small' }, `🛠️ ${p.room.credit}`) : null,
    p.record
      ? h(
          'p',
          { class: 'bc-muted' },
          `${STAMP_LABEL[p.record.stamp]} · ${formatScore(p.record.score)} · ${p.record.rank}. ${COPY.rankedDone}`,
        )
      : h('p', { class: 'bc-muted' }, 'One ranked run a day. Make it count.'),
    btn(p.record ? COPY.practiceAgain : `Play ranked (${p.rankedSeconds ?? 75} s)`, p.onPlayToday, 'bc-cta bc-cta-big'),
    p.readyRanked && p.linkAgain ? btn(`↻ ${p.linkAgain.label}`, p.linkAgain.onPlay, 'bc-link bc-link-again') : null,
  );
  const glass = h(
    'button',
    { class: 'bc-room-card is-glass', type: 'button' },
    h('span', { class: 'bc-room-thumb', 'aria-hidden': 'true' }, '🍷'),
    h('span', { class: 'bc-room-txt' }, h('strong', {}, COPY.glassLabel), h('small', {}, COPY.glassSub)),
  );
  glass.addEventListener('click', p.onGlass);

  const week = p.week?.length
    ? h(
        'ol',
        { class: 'bc-week', 'aria-label': 'This week' },
        ...p.week.map((d) =>
          h(
            'li',
            { class: `bc-week-day${d.stamp ? ` is-${d.stamp}` : ''}${d.today ? ' is-today' : ''}`, title: d.stamp ? STAMP_LABEL[d.stamp] : 'Not played' },
            h('span', { class: 'bc-week-dot', 'aria-hidden': 'true' }, d.stamp ? '🐾' : ''),
            h('small', {}, d.label),
          ),
        ),
      )
    : null;
  const cur = p.streak?.current ?? 0;
  const best = p.streak?.best ?? 0;
  const progress = h(
    'section',
    { class: 'bc-card bc-homeprog' },
    h(
      'div',
      { class: 'bc-homeprog-head' },
      h('span', { class: 'bc-streak-num' }, cur > 0 ? `🔥 ${cur}` : '🔥 0'),
      h('span', { class: 'bc-muted' }, cur > 0 ? `day streak · best ${best}` : best > 0 ? `best streak ${best} · play today to start again` : 'Play one ranked run a day to build a streak'),
    ),
    week,
    p.seasonLine || p.onRapSheet
      ? h(
          'div',
          { class: 'bc-homeprog-season' },
          p.seasonLine ? h('small', { class: 'bc-muted' }, p.seasonLine) : null,
          p.onRapSheet ? btn('Rap Sheet ›', p.onRapSheet, 'bc-link') : null,
        )
      : null,
  );

  const freezes = p.freezes
    ? h('span', { class: 'bc-lives', title: 'Nine Lives: a missed day uses one' }, `${'🐾'.repeat(Math.max(0, Math.min(3, p.freezes.left)))}${p.freezes.left > 0 ? '' : '·'} ${p.freezes.left}/${p.freezes.perWeek} Nine Lives`)
    : null;
  if (freezes) progress.querySelector('.bc-homeprog-head')?.append(freezes);
  const offerHost = p.offerSlot ? h('div', { class: 'bc-offer-slot' }) : null;
  let offerUn: (() => void) | void = undefined;
  const root = h(
    'div',
    { class: 'bc-screen bc-home' },
    h(
      'header',
      { class: 'bc-home-head' },
      h('div', { class: 'bc-brand' }, h('span', { 'aria-hidden': 'true' }, '🐾'), COPY.title),
      btn('⚙︎', p.onSettings, 'bc-icon-btn'),
    ),
    today,
    p.tomorrow ? h('p', { class: 'bc-tomorrow' }, `🌙 ${p.tomorrow}`) : null,
    offerHost,
    progress,
    p.weeklyReady ? btn('✨ Your week is ready: open the Rap Sheet card', p.weeklyReady, 'bc-cta bc-cta-gold bc-weekly-ready') : null,
    p.seenLine ? h('p', { class: 'bc-seen' }, `👀 ${p.seenLine}`) : null,
    glass,
    h(
      'div',
      { class: 'bc-row' },
      btn(COPY.archive, p.onArchive, 'bc-cta bc-cta-soft'),
      btn(`${COPY.myCat}: ${p.catName || 'Tofu'}`, p.onMyCat, 'bc-cta bc-cta-soft'),
    ),
    p.links?.length ? h('div', { class: 'bc-row bc-home-links' }, ...p.links.map((l) => btn(l.label, l.onClick, 'bc-cta bc-cta-soft'))) : null,
    p.a2hs
      ? h(
          'section',
          { class: 'bc-card bc-a2hs' },
          h('strong', {}, 'Keep Bad Cat on your home screen'),
          p.a2hs.ios
            ? h('small', { class: 'bc-muted' }, 'Tap Share, then "Add to Home Screen". A new room is waiting every morning.')
            : btn('Add to Home Screen', p.a2hs.onInstall, 'bc-cta bc-cta-soft'),
        )
      : null,
    p.treatLine ? h('p', { class: 'bc-muted bc-small bc-treat' }, `🐾 ${p.treatLine}`) : null,
    p.presale
      ? h(
          'section',
          { class: 'bc-card bc-presale' },
          h('strong', {}, COPY.presale),
          h('small', { class: 'bc-muted' }, COPY.presaleSub),
          btn('See the pre-sale', p.onPresale, 'bc-cta bc-cta-gold'),
        )
      : null,
    !p.storagePersistent ? h('p', { class: 'bc-muted bc-small' }, COPY.storageBlocked) : null,
  );
  host.appendChild(root);
  if (offerHost && p.offerSlot) offerUn = p.offerSlot(offerHost);
  return () => {
    offerUn?.();
    root.remove();
  };
}
