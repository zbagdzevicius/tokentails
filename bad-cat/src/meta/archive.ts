/**
 * Archive (GDD 8): "The Glass" pinned first, then past dailies newest first. Free players replay the last
 * `freeDays` (14) days; older days show a padlock that fires `onLocked` (the archive_old paywall moment, GDD 9.2).
 * Club: every day plus the boss-room replay pack row.
 */
import type { ArchiveProps, DailyEntry, StampId, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { chip, empty, escapeTo, fmt, header, parPaws, pawsEl, scope, screen, stamp, THEME_LABEL } from './shared';

const STAMP_TEXT: Readonly<Record<StampId, { text: string; tone: 'gold' | 'green' | 'red' }>> = {
  perfect: { text: 'PERFECT CRIME', tone: 'gold' },
  clean: { text: 'GOT AWAY', tone: 'green' },
  caught: { text: 'CUDDLED', tone: 'red' },
};

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A day is locked for free players when it is more than `freeDays` days old. */
export function archiveLocked(todayNo: number, dayNo: number, freeDays: number, club: boolean): boolean {
  return !club && todayNo - dayNo > freeDays;
}

export function mountArchive(host: HTMLElement, p: ArchiveProps): Unmount {
  const s = scope();
  const entries = [...p.entries].sort((a, b) => b.dayNo - a.dayNo);

  const glass = h(
    'button',
    { class: 'bmt-case bmt-glass', type: 'button', 'aria-label': 'The Glass: the practice room, always open' },
    h('span', { class: 'bmt-case-pin', 'aria-hidden': 'true' }, '📌'),
    h('span', { class: 'bmt-case-ico', 'aria-hidden': 'true' }, '🍷'),
    h('span', { class: 'bmt-case-txt' }, h('strong', {}, 'The Glass'), h('small', { class: 'bc-muted' }, 'One glass. One table. Infinite practice.')),
    stamp('ALWAYS OPEN', 'blue', 'bmt-case-stamp'),
  );
  glass.addEventListener('click', () => p.onGlass());

  const row = (e: DailyEntry): HTMLElement => {
    const locked = archiveLocked(p.todayNo, e.dayNo, p.freeDays, p.club);
    const rec = p.records(e.dayNo);
    const paws = rec ? parPaws(rec.score, e.par) : 0;
    const chips = h(
      'span',
      { class: 'bmt-chips' },
      chip(WEEKDAY[e.weekday] ?? ''),
      e.theme && e.theme !== 'default' ? chip(THEME_LABEL[e.theme] ?? e.theme, 'bmt-chip-theme') : null,
      e.boss ? chip('👑 BOSS', 'bmt-chip-boss') : null,
      e.felonyFriday ? chip('🎉 Felony Friday', 'bmt-chip-fri') : null,
      e.community ? chip(`🏠 by ${e.community.author}`, 'bmt-chip-community') : null,
    );
    const record = rec
      ? h(
          'span',
          { class: 'bmt-case-rec' },
          h('span', { class: 'bmt-score' }, fmt(rec.score)),
          pawsEl(paws),
          STAMP_TEXT[rec.stamp] ? stamp(STAMP_TEXT[rec.stamp].text, STAMP_TEXT[rec.stamp].tone, 'bmt-case-stamp') : null,
        )
      : h('span', { class: 'bmt-case-rec bc-muted bc-small' }, locked ? '' : 'Unsolved');
    const b = h(
      'button',
      {
        class: `bmt-case${locked ? ' is-locked' : ''}${e.boss ? ' is-boss' : ''}`,
        type: 'button',
        'data-day': e.dayNo,
        'aria-label': `${e.label}: ${e.title}${locked ? ' (Club only)' : ''}`,
      },
      h('span', { class: 'bmt-case-ico', 'aria-hidden': 'true' }, locked ? '🔒' : e.boss ? '👑' : '📁'),
      h('span', { class: 'bmt-case-txt' }, h('strong', {}, e.label), h('span', { class: 'bmt-case-title' }, caseTitle(e)), chips),
      record,
    );
    b.addEventListener('click', () => (locked ? p.onLocked(e.dayNo) : p.onPlay(e.dayNo)));
    return b;
  };

  const bosses = entries.filter((e) => e.boss);
  let bossRow: HTMLElement | null = null;
  if (bosses.length) {
    if (p.club) {
      bossRow = h(
        'section',
        { class: 'bc-card bmt-boss-pack', 'aria-label': 'Boss replay pack' },
        h('div', { class: 'bc-kicker' }, '👑 Boss replay pack · Club'),
        h('div', { class: 'bmt-hscroll' }, ...bosses.map((e) => btn(`👑 ${e.label.replace(/^Boss:\s*/, "")}`, () => p.onPlay(e.dayNo), 'bc-cta bc-cta-soft bmt-boss-btn'))),
      );
    } else if (p.clubUi !== false) {
      const old = bosses.find((e) => archiveLocked(p.todayNo, e.dayNo, p.freeDays, false));
      if (old) {
        const lock = h(
          'button',
          { class: 'bmt-lockrow', type: 'button' },
          h('span', { 'aria-hidden': 'true' }, '🔒'),
          h('span', {}, h('strong', {}, 'Boss replay pack'), h('small', { class: 'bc-muted' }, ` ${bosses.length} boss rooms · Chaos Club`)),
        );
        lock.addEventListener('click', () => p.onLocked(old.dayNo));
        bossRow = lock;
      }
    }
  }

  const free = !p.club
    ? h('p', { class: 'bc-muted bc-small bmt-note' }, p.clubUi === false ? `Open: the last ${p.freeDays} days.` : `Free: the last ${p.freeDays} days. Older case files are in the Club vault.`)
    : null;
  const list = h('div', { class: 'bmt-cases', role: 'list' }, glass, ...entries.map(row));
  for (const c of Array.from(list.children)) c.setAttribute('role', 'listitem');

  const root = screen(
    'bmt-archive',
    header('Case files', p.onBack, 'Archive'),
    free,
    bossRow,
    list,
    entries.length ? null : empty('🗄️', 'No old case files yet.', 'The cat is new in town. Come back tomorrow.'),
  );
  escapeTo(s, p.onBack);
  return s.mount(host, root);
}

/** The line under the label: the room's name, or (boss rooms, whose label already is the name) the humans. */
function caseTitle(e: { label: string; title: string; human?: string }): string {
  const t = e.title.replace(/^.*:\s*/, '') || e.title;
  return e.label.includes(t) ? e.human ?? '' : t;
}
