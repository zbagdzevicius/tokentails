/**
 * Racer select (also the garage when no garage screen is installed): the cat (your cat, Tofu, Pink Paw cats the
 * player has unlocked, each with its status date), the kart body (six, with Speed / Accel / Handling / Weight bars
 * and what unlocks the locked ones), paint and hat. The kart turns on the showroom turntable above the sheet and
 * every change shows at once. The pick is remembered.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { BODY_IDS, BODY_NAMES, HAT_IDS } from '../../content/ids';
import { KART_BODIES } from '../../content/karts';
import { DEFAULT_CAT, rgb888, type BodyId } from '../../types';
import { clearYourCat, saveYourCat, yourCat } from '../../share/yourcat/store';
import { h, statBars, tabs } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow, PAINTS } from '../flow';
import { chip, focusFirst, frame, hex, plain, primary, guardedBack } from './ui';

export type SelectNext = 'gp' | 'tt' | 'battle' | 'garage';

const HAT_ICON = ['—', '👑', '🧢', '🎀', '🎩', '🌀', '👨‍🍳', '🥳', '🏴‍☠️'];

/** Weight 0.8..1.3 on a 1..5 bar. */
export const weightBar = (w: number): number => Math.max(1, Math.min(5, 1 + ((w - 0.8) / 0.5) * 4));

export function mount(root: HTMLElement, params: unknown, _api: ScreenApi): ScreenHandle {
  const f = flow();
  const next = ((params as { next?: SelectNext } | undefined)?.next ?? 'gp') as SelectNext;
  const fr = frame(root, { title: next === 'garage' ? t('Garage') : t('Your racer'), sheet: true, cls: 'fm-m-select' });
  const hats = HAT_IDS.map((_, i) => i).filter((i) => i === 0 || !f.lock('hat', i));
  const names = [t('Cat'), t('Kart'), t('Paint'), ...(hats.length > 1 ? [t('Hat')] : [])];
  let tab = 0;
  const pane = h('div', { class: 'fm-m-pane' });
  const bar = tabs(names, (i) => {
    tab = i;
    render();
  });
  fr.body.append(bar, pane);

  const set = (fn: (l: ReturnType<typeof flow>['save']['look']) => void) => {
    f.update((s) => fn(s.look));
    f.refreshShowroom();
    render();
  };

  function render(): void {
    pane.innerHTML = '';
    const look = f.save.look;
    if (tab === 0) {
      const row = h('div', { class: 'fm-m-chips' });
      const choices = f.catChoices();
      const cur = choices.find((c) => c.id === look.cat) ?? choices[0];
      for (const c of choices) {
        const sw = [hex(rgb888(c.cat.base)), hex(rgb888(c.cat.secondary)), hex(rgb888(c.cat.tertiary))];
        row.append(chip(c.id === 'tofu' ? t('Tofu (grey tabby)') : c.name, () => set((l) => (l.cat = c.id)), { selected: c.id === cur.id, swatch: sw, sub: c.note }));
      }
      pane.append(row);
      const yc = yourCat();
      const maker = plain(yc ? t('📷 Edit your cat') : t('📷 Put your own cat in'), () => {
        void import('../../share/yourcat/maker').then((m) =>
          m.openMaker(f.shell.host, yourCat(), DEFAULT_CAT).then((r) => {
            if (r === undefined) return;
            if (r === null) {
              clearYourCat();
              set((l) => (l.cat = 'tofu'));
            } else {
              saveYourCat(r.cat, r.name, r.face);
              set((l) => (l.cat = 'own'));
            }
          }),
        );
      }, 'maker');
      pane.append(h('p', { class: 'fm-line' }, [maker]));
    } else if (tab === 1) {
      const row = h('div', { class: 'fm-m-chips' });
      for (const id of BODY_IDS) {
        const lock = f.lock('body', id);
        row.append(chip(t(BODY_NAMES[id]), () => set((l) => (l.body = id as BodyId)), { selected: look.body === id && !lock, locked: lock, act: `body-${id}` }));
      }
      pane.append(row);
      const b = KART_BODIES[(f.lock('body', look.body) ? 0 : look.body) as BodyId];
      pane.append(
        statBars([
          { label: t('Speed'), value: b.speed },
          { label: t('Accel'), value: b.accel },
          { label: t('Handling'), value: b.handling },
          { label: t('Weight'), value: weightBar(b.weight) },
        ]),
      );
    } else if (tab === 2) {
      const row = h('div', { class: 'fm-m-chips fm-m-paints' });
      PAINTS.forEach((p, i) => row.append(chip('', () => set((l) => (l.paint = i)), { selected: look.paint === i, swatch: p.map(hex), aria: t('Paint {n}', { n: i + 1 }) })));
      pane.append(row);
      const num = h('div', { class: 'fm-m-number' }, [
        h('span', {}, [t('Number')]),
        plain('−', () => set((l) => (l.number = (l.number + 99) % 100)), 'num-down'),
        h('b', {}, [String(look.number)]),
        plain('+', () => set((l) => (l.number = (l.number + 1) % 100)), 'num-up'),
      ]);
      pane.append(num);
    } else {
      const row = h('div', { class: 'fm-m-chips' });
      for (const i of hats) row.append(chip(i === 0 ? t('No hat') : t(HAT_IDS[i]), () => set((l) => (l.hat = i)), { selected: look.hat === i, icon: HAT_ICON[i] }));
      pane.append(row);
    }
  }
  render();

  const ready = () => {
    if (next === 'gp') void screens.push('class');
    else if (next === 'tt') void screens.push('tt');
    else if (next === 'battle') void screens.push('battle');
    else screens.back();
  };
  fr.footer.append(primary(next === 'garage' ? t('Done') : t('Ready ▶'), ready, 'ready'));
  focusFirst(root, '[data-act="ready"]');
  return { back: guardedBack };
}
