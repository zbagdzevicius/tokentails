/**
 * Rewards (lazy screen): what a Grand Prix brought, shown once after the podium (the modes lane pushes `rewards`):
 * the trophy, the fish from the cup's races and the trophy, unlocks (a class, Mirror, the Catnip Cup, a shelter cat)
 * and achievements. Continue closes it; the garage is one tap away.
 */
import type { ScreenApi, ScreenModule } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { actionFooter, button, h, panel } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { CLASSES } from '../../tuning';
import { mergeAward, emptyAward } from '../record';
import { takeRewards, prog } from '../store';
import { achievementById } from '../achievements';
import { countUp, fishChips, unlockLabel } from '../results-section';

const TROPHY = ['', '🏆', '🥈', '🥉'];
const CUP_NAMES: Record<string, string> = { kibble: 'Kibble Cup', catnip: 'Catnip Cup' };

export function rewardsScreen(): ScreenModule {
  return {
    mount(root: HTMLElement, p: unknown, api: ScreenApi) {
      // `then`: where the podium was heading (Menu, Next cup, Again); it runs after Continue, so the rewards never
      // pop up later over the menu (known issue 1)
      const then = (p as { then?: () => void } | undefined)?.then;
      const list = takeRewards();
      const close = () => {
        api.close();
        then?.();
      };
      if (!list.length && then) {
        queueMicrotask(close);
        return;
      }
      const all = list.reduce(mergeAward, emptyAward());
      const tr = all.trophy;
      const big = h('div', { class: 'big' }, ['+0']);
      const bal = h('span', { class: 'fm-prog-wallet' }, [`🐟 ${prog().fish}`]);
      root.append(
        panel(null, [
          h('div', { class: 'fm-rw' }, [
            tr ? h('div', { class: 'trophy', 'aria-hidden': 'true' }, [TROPHY[tr.place] ?? '🏁']) : h('div', { class: 'trophy', 'aria-hidden': 'true' }, ['🐟']),
            h('h1', {}, [
              tr
                ? t('{place} in the {cup}', { place: tr.place === 1 ? t('Gold') : tr.place === 2 ? t('Silver') : t('Bronze'), cup: t(CUP_NAMES[tr.cupId] ?? tr.cupId) })
                : t('Rewards'),
            ]),
            tr ? h('p', { class: 'fm-prog-sub' }, [`${CLASSES[tr.cls].name} ${CLASSES[tr.cls].cc}${tr.mirror ? ` · ${t('Mirror')}` : ''}`]) : null,
            big,
            h('div', { class: 'fm-prog-reasons' }, fishChips(all)),
            all.unlocks.length ? h('div', { class: 'fm-prog-news' }, all.unlocks.map((u) => h('span', { class: 'fm-prog-chip gold' }, [`🎉 ${unlockLabel(u)}`]))) : null,
            all.achievements.length
              ? h(
                  'div',
                  { class: 'fm-prog-ach' },
                  all.achievements.map((id) => {
                    const d = achievementById(id);
                    return h('span', { class: 'fm-prog-badge' }, [`${d?.icon ?? '🏆'} ${d ? t(d.name) : id}`]);
                  }),
                )
              : null,
            h('p', {}, [bal]),
          ]),
          actionFooter([button(t('Continue'), close, { primary: true, act: 'continue' }), button(t('🏎️ Garage'), () => void screens.push('garage'), { act: 'garage' })]),
        ], 'fm-prog-screen'),
      );
      countUp(big, 0, all.total, 1000, (n) => `+${n} 🐟`);
    },
  };
}
