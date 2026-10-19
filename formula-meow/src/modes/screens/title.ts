/**
 * Title screen: the logo over the attract race (the scripted bot drives a random track behind it), "TAP TO START" /
 * "PRESS ANY KEY". Any tap, key or pad button opens the main menu (and unlocks audio with the same gesture).
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { screens } from '../../core/app/screens';
import { h } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { flow } from '../flow';
import { touchUi } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  root.classList.add('fm-m-title');
  const go = () => {
    if (done) return;
    done = true;
    flow().update((s) => (s.menuSeen = true));
    void screens.replace('menu');
  };
  let done = false;
  const start = h('button', { class: 'fm-m-start', type: 'button', 'data-act': 'start' }, [h('span', {}, [touchUi() ? t('TAP TO START') : t('PRESS ANY KEY')])]);
  start.addEventListener('click', go);
  root.append(
    h('div', { class: 'fm-m-logo', role: 'img', 'aria-label': 'Formula Meow' }, [h('span', {}, ['FORMULA']), h('b', {}, ['MEOW']), h('i', { 'aria-hidden': 'true' }, ['🏁'])]),
    h('p', { class: 'fm-m-tagline fm-outline' }, [t('Kart racing with real shelter cats')]),
    start,
    h('p', { class: 'fm-m-foot' }, [t('Your rivals are real cats from Pink Paw shelter, Lithuania.')]),
  );
  root.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('a')) return;
    go();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.key === 'Tab') return;
    e.preventDefault();
    go();
  };
  window.addEventListener('keydown', onKey);
  // any pad button (focusNav only clicks a focused control)
  let raf = 0;
  const seen = new Set<number>();
  const poll = () => {
    raf = requestAnimationFrame(poll);
    if (root.hidden || !navigator.getGamepads) return;
    for (const p of navigator.getGamepads()) {
      if (!p) continue;
      const any = p.buttons.some((b) => b.pressed);
      if (any && seen.has(p.index)) go();
      if (!any) seen.add(p.index);
    }
  };
  raf = requestAnimationFrame(poll);
  return {
    back: () => true,
    unmount: () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    },
  };
}
