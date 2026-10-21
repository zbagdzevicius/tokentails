/**
 * Time-trial select: class, track (personal best and medal per track), the medal times from the dev ghost, and which
 * ghost to race (your best, the dev ghost, or none). The dev ghost is an in-house run by the Token Tails team's test
 * driver, computed on this device the first time a track is picked.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { TRACK_IDS } from '../../content/ids';
import { trackById } from '../../core/track/tracks';
import { h, keepFocus, tabs } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow, fmt } from '../flow';
import type { ClassPick, GhostPick } from '../store';
import { CLASS_BLURB_TT, classChips } from './class';
import { chip, focusFirst, frame, MEDAL, primary, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const fr = frame(root, { title: t('Time Trial'), sub: t('Three Catnips, no rivals, just the clock'), sheet: true, cls: 'fm-m-tt' });
  let cls: ClassPick = f.save.last.ttCls;
  if (cls !== 0 && f.lock('class', cls)) cls = 0;
  let track = f.save.last.ttTrack;
  let ghost: GhostPick = f.save.last.ghost;
  let alive = true;
  const classes = h('div');
  const tracks = h('div', { class: 'fm-m-chips fm-m-tracks' });
  const detail = h('div', { class: 'fm-m-tt-detail' });
  fr.body.append(classes, tracks, detail);

  const renderClasses = () => {
    classes.innerHTML = '';
    classes.append(
      classChips((c) => {
        cls = c;
        renderAll();
      }, cls, false, CLASS_BLURB_TT),
    );
  };

  const renderTracks = () => {
    tracks.innerHTML = '';
    for (const id of TRACK_IDS) {
      const rec = f.ttRecord(id, cls);
      const old = rec ? null : f.ttOldRecord(id, cls);
      const sub = rec ? `${MEDAL[rec.medal] ? MEDAL[rec.medal] + ' ' : ''}${fmt(rec.best)}` : old ? t('old record {t}', { t: fmt(old.best) }) : t('no time yet');
      tracks.append(chip(trackById(id).name, () => ((track = id), renderAll()), { selected: id === track, sub, act: `track-${id}` }));
    }
  };

  let gen = 0;
  const renderDetail = () => {
    const my = ++gen;
    detail.innerHTML = '';
    const rec = f.ttRecord(track, cls);
    const old = f.ttOldRecord(track, cls);
    const medals = h('div', { class: 'fm-m-medals' }, [t('Medal times…')]);
    detail.append(medals);
    const fill = (dev: number | null) => {
      if (my !== gen || !alive) return;
      medals.innerHTML = '';
      if (dev == null) {
        medals.append(t('No dev time for this track yet: set your own record.'));
        return;
      }
      const [g, s, b] = f.medalTimes(dev);
      medals.append(h('span', {}, [`🥇 ${fmt(g)}`]), h('span', {}, [`🥈 ${fmt(s)}`]), h('span', {}, [`🥉 ${fmt(b)}`]));
    };
    const known = f.devTime(track, cls);
    if (known !== undefined) fill(known);
    else void f.devGhost(track, cls).then((r) => fill(r?.time ?? null));
    if (rec) detail.append(h('p', { class: 'fm-line' }, [t('Your best: {t}', { t: fmt(rec.best) })]));
    else if (old) detail.append(h('p', { class: 'fm-line' }, [t('Your record {t} is from an older version of the game; its ghost cannot race. Set a new one!', { t: fmt(old.best) })]));
    const picks: GhostPick[] = ['pb', 'dev', 'off'];
    const hasPb = !!rec?.ghost;
    // "your best" stays the pick without a record yet: this run races the dev ghost, the next one your own
    const shown: GhostPick = ghost === 'pb' && !hasPb ? 'dev' : ghost;
    const labels = [t('Your best'), t('Dev ghost'), t('No ghost')];
    const row = tabs(labels, (i) => {
      if (picks[i] === 'pb' && !hasPb) return renderDetail();
      ghost = picks[i];
    }, picks.indexOf(shown));
    row.classList.add('fm-m-ghosts');
    row.setAttribute('aria-label', t('Ghost'));
    if (!hasPb) row.querySelector<HTMLButtonElement>('[role="tab"]')!.disabled = true;
    detail.append(h('p', { class: 'fm-m-label' }, [t('Race against')]), row);
    detail.append(h('p', { class: 'fm-m-note' }, [t('Dev ghost (Token Tails team): an in-house run by our test driver, made on this device.')]));
  };

  function renderAll(): void {
    keepFocus(root, () => {
      renderClasses();
      renderTracks();
      renderDetail();
    });
  }
  renderAll();

  const go = primary(t('Start ▶'), () => {
    go.disabled = true;
    go.textContent = t('Loading ghost…');
    void f.startTt(track, cls, ghost).catch(() => {
      go.disabled = false;
      go.textContent = t('Start ▶');
      f.toast(t('That did not load. Try again.'));
    });
  }, 'start');
  fr.footer.append(go);
  focusFirst(root, '[data-act="start"]');
  return {
    back: guardedBack,
    unmount: () => {
      alive = false;
    },
  };
}
