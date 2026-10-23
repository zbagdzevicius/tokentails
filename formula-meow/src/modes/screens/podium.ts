/**
 * Podium (lazy chunk): the cup's top three on their plinths with the trophy and confetti (the showroom), and a
 * panel with your place, points, the trophy you won and anything the cup unlocked. Then the rewards screen (when
 * the progression lane installs one), the next cup, the same cup again, or the menu.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { hasScreen, screens } from '../../core/app/screens';
import { CUPS } from '../../content/cups';
import type { RacerInfo } from '../../types';
import { h } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import { hasRewards } from '../../progression/api';
import { standings, simClass } from '../gp/cup';
import type { CupRun } from '../store';
import { classLabel, focusFirst, frame, plain, primary, TROPHY, heldBack } from './ui';

interface PodiumParams {
  run: CupRun;
  outcome: { place: number; trophy: number; points: number };
  opened: string[];
}

const TROPHY_NAME = ['', 'Gold trophy!', 'Silver trophy!', 'Bronze trophy!'];

export function mount(root: HTMLElement, params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const p = params as PodiumParams | undefined;
  if (!p?.run) {
    queueMicrotask(() => f.goMenu());
    return {};
  }
  const { run, outcome, opened } = p;
  const cup = CUPS.find((c) => c.id === run.cupId)!;
  const order = standings(run);
  const top3: RacerInfo[] = order.slice(0, 3).map((fi) => {
    const r = run.field[fi];
    return { name: r.name, cat: r.cat, kart: r.kart, hat: r.hat };
  });
  f.podiumScene(top3, outcome.trophy || 0);
  root.classList.add('fm-m-podium');
  const fr = frame(root, { title: `${t(cup.name)} · ${classLabel(run.cls)}`, sheet: true, noBack: true, cls: 'fm-m-podium-panel' });
  const names = h('ol', { class: 'fm-m-podium-names' }, top3.map((r, i) => h('li', { class: order[i] === run.field.findIndex((x) => x.player) ? 'me' : '' }, [`${TROPHY[i + 1]} ${r.name}`])));
  fr.body.append(
    h('div', { class: 'fm-place' }, [ordinalHtml(outcome.place)]),
    h('p', { class: 'fm-m-trophy' }, [outcome.trophy ? t(TROPHY_NAME[outcome.trophy]) : t('No trophy this time: the top three win one.')]),
    h('p', { class: 'fm-line' }, [t('{n} points', { n: outcome.points })]),
    names,
  );
  for (const o of opened) fr.body.append(h('p', { class: 'fm-m-unlock' }, [t('Unlocked: {x}', { x: o })]));
  const i = CUPS.findIndex((c) => c.id === run.cupId);
  const nextCup = CUPS[i + 1];
  const nextOpen = nextCup && !f.lock('cup', nextCup.id);
  // the rewards show once, before the podium is left whichever way (they used to pop up over the menu later)
  // playtest: an 8th place overall opened a big pink "Rewards 🎁" onto "+0 🐟": with nothing waiting there is no button
  const rewardsUp = hasScreen('rewards') && hasRewards();
  let seen = !rewardsUp;
  const rewardsParams = { cupId: run.cupId, cls: simClass(run.cls), place: outcome.place, points: outcome.points };
  const via = (go: () => void) => () => {
    if (seen) return go();
    seen = true;
    void screens.push('rewards', { ...rewardsParams, then: go });
  };
  if (rewardsUp) {
    // two rows: Rewards full width, then the three small buttons
    // B1: the rewards can be opened once; after that the button says so and does nothing (it showed "+0 🐟" again)
    const rw = primary(
      t('Rewards 🎁'),
      () => {
        if (seen) return;
        seen = true;
        void screens.push('rewards', rewardsParams);
        rw.disabled = true;
        rw.textContent = t('Rewards claimed ✓');
        rw.classList.remove('primary');
        // the next action becomes the main one
        const next = fr.footer.querySelector<HTMLButtonElement>('[data-act="next-cup"], [data-act="menu"]');
        next?.classList.add('primary');
      },
      'rewards',
    );
    rw.classList.add('big', 'fm-m-rw');
    fr.footer.append(rw);
  }
  if (nextOpen) fr.footer.append((rewardsUp ? plain : primary)(t('Next cup ▶'), via(() => f.startCup(nextCup.id, run.cls)), 'next-cup'));
  fr.footer.append(plain(t('Again ↻'), via(() => f.startCup(run.cupId, run.cls)), 'again'));
  fr.footer.append(plain(t('Menu'), via(() => f.goMenu()), 'menu'));
  focusFirst(root);
  return {
    back: () => {
      if (heldBack()) return true;
      via(() => f.goMenu())();
      return true;
    },
  };
}

function ordinalHtml(n: number): HTMLElement {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return h('span', {}, [String(n), h('small', {}, [s])]);
}
