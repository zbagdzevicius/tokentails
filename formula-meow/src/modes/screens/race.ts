/**
 * Single race ([integrator]): class (Mirror included once unlocked) and any of the six circuits, with the best time
 * the device has for it. Start runs one race with the usual Again / Next / Menu results.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { TRACK_IDS } from '../../content/ids';
import { trackById } from '../../core/track/tracks';
import { h, keepFocus } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import type { ClassPick } from '../store';
import { classChips } from './class';
import { chip, focusFirst, frame, primary, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const fr = frame(root, { title: t('Single race'), sub: t('One race, any track'), sheet: true, cls: 'fm-m-tt' });
  let cls: ClassPick = f.save.last.quickCls;
  if (cls !== 0 && f.lock('class', cls)) cls = 0;
  let track = f.save.last.quickTrack;
  const classes = h('div');
  const tracks = h('div', { class: 'fm-m-chips fm-m-tracks' });
  fr.body.append(classes, tracks);

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
  }
  render();

  fr.footer.append(primary(t('Race! ▶'), () => f.startQuick(track, cls), 'start'));
  focusFirst(root, '[data-act="start"]');
  return { back: guardedBack };
}
