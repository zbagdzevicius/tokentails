/**
 * Single race ([integrator]): class (Mirror included once unlocked), any of the six circuits, and the Wild Card row
 * (ITERATION-4.md F11): no mutator, one of the five, or "Surprise me" (one the class allows, dealt at the start and
 * revealed on the grid banner). Start runs one race with the usual Again / Next / Menu results.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { TRACK_IDS } from '../../content/ids';
import { trackById } from '../../core/track/tracks';
import { h, keepFocus } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { CLASSES } from '../../tuning';
import { flow } from '../flow';
import type { ClassPick } from '../store';
import { MUTATORS, type WildPick } from '../mutators';
import { simClass } from '../gp/cup';
import { classChips } from './class';
import { chip, focusFirst, frame, primary, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const fr = frame(root, { title: t('Single race'), sub: t('One race, any track'), sheet: true, cls: 'fm-m-tt fm-m-quick' });
  let cls: ClassPick = f.save.last.quickCls;
  if (cls !== 0 && f.lock('class', cls)) cls = 0;
  let track = f.save.last.quickTrack;
  let wild: WildPick = f.save.last.quickWild;
  const classes = h('div');
  const tracks = h('div', { class: 'fm-m-chips fm-m-tracks' });
  const wildHead = h('h3', { class: 'fm-m-wild-h' }, [t('Wild Card'), h('small', {}, [t('optional: shake up the items')])]);
  const wildRow = h('div', { class: 'fm-m-chips fm-m-wild', role: 'group', 'aria-label': t('Wild Card') });
  fr.body.append(classes, tracks, wildHead, wildRow);

  function render(): void {
    keepFocus(root, build);
  }
  function build(): void {
    classes.innerHTML = '';
    classes.append(
      classChips((c) => {
        cls = c;
        render();
      }, cls, false),
    );
    tracks.innerHTML = '';
    for (const id of TRACK_IDS) {
      const def = trackById(id);
      tracks.append(chip(def.name, () => ((track = id), render()), { selected: id === track, sub: t('{n} laps', { n: def.laps }), act: `track-${id}` }));
    }
    wildRow.innerHTML = '';
    const sim = simClass(cls);
    wildRow.append(chip(t('Off'), () => ((wild = 'none'), render()), { selected: wild === 'none', sub: t('Normal items'), icon: '🏁', act: 'wild-none' }));
    for (const m of MUTATORS) {
      const locked = sim < m.minCls ? t('From {c}', { c: `${CLASSES[m.minCls].cc}` }) : null;
      wildRow.append(chip(t(m.name), () => ((wild = m.id), render()), { selected: wild === m.id && !locked, locked, sub: t(m.blurb), icon: m.icon, act: `wild-${m.id}` }));
    }
    const s = chip(t('Surprise me'), () => ((wild = 'surprise'), render()), { selected: wild === 'surprise', sub: t('A Wild Card dealt on the grid'), icon: '🎲', act: 'wild-surprise' });
    s.classList.add('fm-m-surprise');
    wildRow.append(s);
  }
  render();

  fr.footer.append(primary(t('Race! ▶'), () => f.startQuick(track, cls, wild), 'start'));
  focusFirst(root, '[data-act="start"]');
  return { back: guardedBack };
}
