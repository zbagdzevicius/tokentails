/**
 * Stats (lazy screen): the player's career on this device. Every number is counted by the game from races run here;
 * nothing is estimated or sent anywhere.
 */
import type { ScreenApi, ScreenModule } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { actionFooter, button, h, panel } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { BODY_NAMES } from '../../content/ids';
import { CLASSES } from '../../tuning';
import { fmtTime } from '../../core/hud/hud';
import { trackById } from '../../core/track/tracks';
import { Modifier, type BodyId } from '../../types';
import { prog } from '../store';
import { currentStreak } from '../challenges';
import { today } from '../store';

const tile = (value: string | number, label: string) => h('div', { class: 'fm-st' }, [h('b', {}, [String(value)]), h('span', {}, [label])]);

export function statsScreen(): ScreenModule {
  return {
    mount(root: HTMLElement, _p: unknown, api: ScreenApi) {
      const s = prog();
      const st = s.stats;
      const winRate = st.finishes ? Math.round((st.wins / st.finishes) * 100) : 0;
      const fav = st.bodyRaces.reduce((best, n, i, a) => (n > a[best] ? i : best), 0);
      const km = st.distance / 1000;
      const career = h('div', { class: 'fm-st-grid' }, [
        tile(st.races, t('races')),
        tile(st.wins, t('wins')),
        tile(st.podiums, t('podiums')),
        tile(`${winRate} %`, t('win rate (finished races)')),
        tile(km >= 10 ? km.toFixed(0) : km.toFixed(1), t('km driven')),
        tile(s.fishTotal, t('fish earned')),
      ]);
      const driving = h('div', { class: 'fm-st-grid' }, [
        tile(`${st.miniTurbos[0]} · ${st.miniTurbos[1]} · ${st.miniTurbos[2]}`, t('mini-turbos blue · orange · pink')),
        tile(st.tricks, t('tricks landed')),
        tile(st.pounces, t('Pounce Starts')),
        tile(st.slipstreams, t('slipstreams')),
        tile(st.overtakes, t('overtakes')),
        tile(st.shortcuts, t('shortcuts')),
        tile(st.hitsDealt, t('item hits dealt')),
        tile(st.hitsTaken, t('hits taken')),
        tile(st.itemsUsed, t('items used')),
        tile(st.battleWins, t('battle wins')),
        tile(st.races ? t(BODY_NAMES[fav as BodyId]) : '–', t('favourite kart')),
        tile(currentStreak(s.daily, today()), t('daily streak')),
      ]);
      // best laps: track × class (normal races; Mirror rows are marked)
      const laps = Object.entries(s.bestLaps)
        .map(([k, v]) => {
          const [track, cls, mod] = k.split(':');
          return { track, cls: Number(cls), mirror: (Number(mod) & Modifier.Mirror) !== 0, v };
        })
        .sort((a, b) => a.track.localeCompare(b.track) || a.cls - b.cls);
      const lapTable = laps.length
        ? h('table', { class: 'fm-st-table' }, [
            h('tr', {}, [h('th', {}, [t('Track')]), h('th', {}, [t('Class')]), h('th', {}, [t('Best lap')])]),
            ...laps.map((l) => h('tr', {}, [h('td', {}, [trackById(l.track).name + (l.mirror ? ` (${t('Mirror')})` : '')]), h('td', {}, [CLASSES[l.cls as 0 | 1 | 2]?.cc ?? '?']), h('td', {}, [fmtTime(l.v)])])),
          ])
        : h('p', { class: 'fm-prog-sub' }, [t('Finish a race to set your first best lap.')]);
      const rivals = Object.entries(s.rivals);
      const rivalTable = rivals.length
        ? h('table', { class: 'fm-st-table' }, [
            h('tr', {}, [h('th', {}, [t('Rival')]), h('th', {}, [t('You')]), h('th', {}, [t('Them')])]),
            ...rivals.map(([name, r]) => h('tr', {}, [h('td', {}, [name]), h('td', {}, [String(r.w)]), h('td', {}, [String(r.l)])])),
          ])
        : h('p', { class: 'fm-prog-sub' }, [t('Grand Prix and Daily Cup races name a rival. Your record against each one shows here.')]);
      root.append(
        panel(null, [
          h('div', { class: 'fm-prog-head' }, [h('button', { class: 'fm-m-back', type: 'button', 'aria-label': t('Back'), 'data-act': 'head-back', onclick: () => screens.back() }, ['‹']), h('h1', {}, [t('Stats')])]),
          h('p', { class: 'fm-prog-sub' }, [t('Counted on this device from the races you ran.')]),
          h('h3', {}, [t('Career')]),
          career,
          h('h3', {}, [t('Driving')]),
          driving,
          h('h3', {}, [t('Best laps')]),
          lapTable,
          h('h3', {}, [t('Rivals')]),
          rivalTable,
          actionFooter([button(t('Back'), () => api.close(), { primary: true, act: 'back' })]),
        ], 'fm-prog-screen'),
      );
    },
  };
}
