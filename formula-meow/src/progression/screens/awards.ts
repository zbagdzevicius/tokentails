/**
 * Awards (lazy screen, `achievements`): today's three daily challenges with the streak, the 24 achievements (earned
 * ones with their day, the rest with what to do and progress where it counts up), and the trophy cabinet (cups by
 * class, time trial medals).
 */
import type { ScreenApi, ScreenModule } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { actionFooter, button, h, panel, tabs } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { ACHIEVEMENT_IDS, CUP_IDS } from '../../content/ids';
import { CLASSES } from '../../tuning';
import { dateOfDay } from '../../share/daily/daily';
import { TRACKS } from '../../core/track/tracks';
import { ACHIEVEMENTS, type CheckCtx } from '../achievements';
import { currentStreak } from '../challenges';
import { namedChallenge } from '../names';
import { dailyToday, prog, today, world } from '../store';
import { unlockState, type UnlockKey } from '../unlocks';

const MEDAL = ['', '🥇', '🥈', '🥉'];
const CUP_NAMES: Record<string, string> = { kibble: 'Kibble Cup', catnip: 'Catnip Cup' };

function dailyTab(): HTMLElement {
  const d = dailyToday();
  const day = today();
  const rows = d.ids.map((id, i) => {
    const c = namedChallenge(id);
    if (!c) return null;
    const p = Math.min(c.target, d.progress[i] ?? 0);
    return h('div', { class: `fm-prog-ch${d.done[i] ? ' done' : ''}` }, [
      h('span', { class: 'mark', 'aria-hidden': 'true' }, [d.done[i] ? '✓' : '○']),
      h('span', { class: 'txt' }, [t(c.text, c.vars)]),
      h('span', { class: 'n' }, [d.done[i] ? t('done') : `${p}/${c.target} · ${c.fish} 🐟`]),
      h('i', { class: 'bar', style: `width:${Math.round((p / c.target) * 100)}%` }),
    ]);
  });
  const streak = currentStreak(d, day);
  return h('div', { class: 'fm-prog-daily' }, [
    h('p', { class: 'fm-prog-sub' }, [t('New challenges every day at 00:00 UTC. Everyone gets the same three. Do all three for a bonus.')]),
    ...rows.filter((r): r is HTMLDivElement => !!r),
    h('div', { class: 'fm-st-grid' }, [
      h('div', { class: 'fm-st' }, [h('b', {}, [String(streak)]), h('span', {}, [t('day streak')])]),
      h('div', { class: 'fm-st' }, [h('b', {}, [String(d.bestStreak)]), h('span', {}, [t('best streak')])]),
    ]),
    h('p', { class: 'fm-prog-sub' }, [t('Today: {date} (UTC)', { date: dateOfDay(day) })]),
  ]);
}

function achievementsTab(): HTMLElement {
  const s = prog();
  const w = world();
  const ctx: CheckCtx = { s, branchTracks: w.branchTracks, circuits: w.circuits };
  const grid = h('div', { class: 'fm-aw-grid' });
  // earned first, then the rest in list order
  const list = [...ACHIEVEMENTS].sort((a, b) => Number(s.achievements[b.id] != null) - Number(s.achievements[a.id] != null));
  for (const a of list) {
    const on = s.achievements[a.id] != null;
    const prog2 = !on && a.progress ? a.progress(ctx) : null;
    grid.append(
      h('div', { class: `fm-aw ${on ? 'on' : 'off'}`, 'data-ach': a.id, role: 'listitem', 'aria-label': `${t(a.name)}: ${on ? t('earned') : t('not yet')}` }, [
        h('span', { class: 'ic', 'aria-hidden': 'true' }, [a.icon]),
        h('b', {}, [t(a.name)]),
        h('small', {}, [t(a.desc)]),
        on ? h('small', {}, [t('Earned {date}', { date: dateOfDay(s.achievements[a.id]) })]) : null,
        prog2 && prog2[1] > 0
          ? h('span', { class: 'fm-prog-meter', role: 'meter', 'aria-valuenow': prog2[0], 'aria-valuemax': prog2[1], 'aria-label': t('Progress') }, [h('i', { style: `width:${Math.round((prog2[0] / prog2[1]) * 100)}%` })])
          : null,
      ]),
    );
  }
  grid.setAttribute('role', 'list');
  return h('div', {}, [h('p', { class: 'fm-prog-sub' }, [t('{n} of {of} earned · each one pays 25 fish', { n: Object.keys(s.achievements).length, of: ACHIEVEMENT_IDS.length })]), grid]);
}

function trophiesTab(): HTMLElement {
  const s = prog();
  const cups = h('table', { class: 'fm-st-table' }, [
    h('tr', {}, [h('th', {}, [t('Cup')]), ...[0, 1, 2].map((c) => h('th', {}, [CLASSES[c as 0 | 1 | 2].cc])), h('th', {}, [t('Mirror')])]),
    ...CUP_IDS.map((cup) =>
      h('tr', {}, [
        h('td', {}, [t(CUP_NAMES[cup])]),
        ...[0, 1, 2].map((c) => h('td', {}, [MEDAL[s.trophies[`${cup}:${c}`] ?? 0] || '·'])),
        h('td', {}, [MEDAL[s.trophies[`${cup}:2m`] ?? 0] || '·']),
      ]),
    ),
  ]);
  const medals = h('table', { class: 'fm-st-table' }, [
    h('tr', {}, [h('th', {}, [t('Time trial')]), ...[0, 1, 2].map((c) => h('th', {}, [CLASSES[c as 0 | 1 | 2].cc])), h('th', {}, [t('Mirror')])]),
    ...TRACKS.map((tr) =>
      h('tr', {}, [h('td', {}, [tr.name]), ...[0, 1, 2].map((c) => h('td', {}, [MEDAL[s.medals[`${tr.id}:${c}`] ?? 0] || '·'])), h('td', {}, [MEDAL[s.medals[`${tr.id}:2m`] ?? 0] || '·'])]),
    ),
  ]);
  const keys: Array<[UnlockKey, string]> = [
    ['class:1', `${CLASSES[1].name} ${CLASSES[1].cc}`],
    ['class:2', `${CLASSES[2].name} ${CLASSES[2].cc}`],
    ['mirror', t('Mirror mode')],
    ['cup:catnip', t('Catnip Cup')],
    ['mode:battle', t('Balloon Battle')],
  ];
  const unl = h(
    'ul',
    { class: 'fm-unl' },
    keys.map(([k, label]) => {
      const u = unlockState(s, k);
      return h('li', { class: u.ok ? 'ok' : '' }, [h('span', { 'aria-hidden': 'true' }, [u.ok ? '✓' : '🔒']), h('b', {}, [label]), h('small', {}, [u.ok ? t('unlocked') : t(u.hint)])]);
    }),
  );
  return h('div', {}, [h('h3', {}, [t('Unlocks')]), unl, h('h3', {}, [t('Grand Prix trophies')]), cups, h('h3', {}, [t('Time trial medals')]), medals]);
}

export function awardsScreen(): ScreenModule {
  return {
    mount(root: HTMLElement, params: unknown, api: ScreenApi) {
      const start = (params as { tab?: number } | undefined)?.tab ?? 1;
      const body = h('div');
      const show = (i: number) => {
        body.textContent = '';
        body.append(i === 0 ? dailyTab() : i === 1 ? achievementsTab() : trophiesTab());
      };
      root.append(
        panel(null, [
          h('div', { class: 'fm-prog-head' }, [h('button', { class: 'fm-m-back', type: 'button', 'aria-label': t('Back'), 'data-act': 'head-back', onclick: () => screens.back() }, ['‹']), h('h1', {}, [t('Awards')]), h('span', { class: 'fm-prog-wallet' }, [`🏆 ${Object.keys(prog().achievements).length}/${ACHIEVEMENT_IDS.length}`])]),
          tabs([t('Today'), t('Achievements'), t('Trophies')], show, start),
          body,
          actionFooter([button(t('Back'), () => api.close(), { primary: true, act: 'back' })]),
        ], 'fm-prog-screen'),
      );
      show(start);
    },
  };
}
