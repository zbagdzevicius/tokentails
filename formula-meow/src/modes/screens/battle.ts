/** Balloon Battle lobby: the rules in four lines, your record, and the start button. */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { RUG } from '../../core/track/tracks';
import { h, list } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import { BATTLE } from '../battle/rules';
import { classLabel, focusFirst, frame, primary, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const s = f.save;
  const fr = frame(root, { title: t('Balloon Battle'), sub: `${RUG.name} · ${classLabel(f.battleClass())}`, sheet: true });
  fr.body.append(
    list([
      t('🎈 {n} balloons each, {m} minutes on the clock.', { n: BATTLE.balloons, m: BATTLE.time / 60 }),
      t('💥 Pop a balloon with an item: +1 point.'),
      t('⚡ Ram a cat while boosting to steal a balloon: +1 point.'),
      t('🏆 Most points when the clock ends wins. Lose all your balloons: −1 point, and you are back in {s} s.', { s: BATTLE.outTime }),
    ]),
  );
  if (s.battle.played) fr.body.append(h('p', { class: 'fm-line' }, [t('Your record: {w} wins in {n} battles', { w: s.battle.wins, n: s.battle.played })]));
  fr.footer.append(primary(t('Battle! ▶'), () => f.startBattle(), 'start'));
  focusFirst(root, '[data-act="start"]');
  return { back: guardedBack };
}
