/**
 * Cup select: Kibble Cup and Catnip Cup with their four tracks (mirrored races marked), the best trophy in this
 * class, and what unlocks a locked cup. Starting a new cup while one is in progress asks first.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { trackById } from '../../core/track/tracks';
import { CUPS } from '../../content/cups';
import { Modifier } from '../../types';
import { h, modal } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import type { ClassPick } from '../store';
import { classLabel, focusFirst, frame, TROPHY, guardedBack } from './ui';

export function mount(root: HTMLElement, params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const cls = ((params as { cls?: ClassPick } | undefined)?.cls ?? f.save.last.cls) as ClassPick;
  const fr = frame(root, { title: t('Pick a cup'), sub: classLabel(cls), sheet: true });
  const s = f.save;
  const list = h('div', { class: 'fm-m-cups' });
  for (const cup of CUPS) {
    const lock = f.lock('cup', cup.id);
    const best = s.trophies[`${cup.id}:${cls}`] ?? 0;
    const tracks = cup.races.map((r, i) => {
      const mirror = cls === 3 || (r.modifiers & Modifier.Mirror) !== 0;
      return h('li', {}, [`${i + 1}. ${trackById(r.track).name}${mirror ? ` · ${t('mirror')}` : ''}`]);
    });
    const card = h('button', { class: `fm-m-cup${lock ? ' locked' : ''}`, type: 'button', 'aria-disabled': lock ? 'true' : null, 'data-act': `cup-${cup.id}` }, [
      h('span', { class: 'fm-m-cup-ic', 'aria-hidden': 'true' }, [cup.id === 'kibble' ? '🍖' : '🌿']),
      h('span', { class: 'fm-m-cup-name' }, [t(cup.name)]),
      h('span', { class: 'fm-m-cup-best' }, [best ? `${TROPHY[best]} ${t('best')}` : lock ? `🔒 ${lock}` : t('no trophy yet')]),
      h('ol', {}, tracks),
    ]);
    card.addEventListener('click', () => {
      if (lock) return;
      const inProgress = f.cupInProgress();
      if (!inProgress) return f.startCup(cup.id, cls);
      void modal(t('Start a new cup?'), t('The cup in progress will be dropped.'), [t('Start new'), t('Cancel')]).then((i) => {
        if (i === 0) f.startCup(cup.id, cls);
      });
    });
    list.append(card);
  }
  fr.body.append(list);
  fr.footer.remove();
  focusFirst(root, `[data-act="cup-${s.last.cupId}"]:not([aria-disabled])`);
  return { back: guardedBack };
}
