/**
 * How to play: the controls for the device in use (touch, keyboard, gamepad), drifting and mini-turbo tiers, the
 * Pounce Start, the eight items, fish coins and the modes. Only rules the game really has.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { h, list, tabs } from '../../ui/kit';
import { t } from '../../ui/i18n';
import { driftTierColors } from '../../ui/a11y';
import { focusFirst, frame, hex, touchUi, guardedBack } from './ui';

export function mount(root: HTMLElement, _params: unknown, _api: ScreenApi): ScreenHandle {
  const fr = frame(root, { title: t('How to play'), cls: 'fm-m-howto' });
  const pane = h('div', { class: 'fm-m-pane' });
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].some((p) => !!p) : false;
  const sections = [t('Drive'), t('Items'), t('Modes')];
  const render = (i: number) => {
    pane.innerHTML = '';
    if (i === 0) {
      const ctl = touchUi()
        ? [t('Left thumb steers. Gas is automatic.'), t('Push the stick all the way into a bend to drift (or turn one-thumb drift off in Settings and hold the right thumb).'), t('Right thumb: tap to hop, swipe up to throw an item forward, down to throw it back.')]
        : pads
          ? [t('Left stick or D-pad steers, A or RT is gas, B or LT brakes.'), t('RB hops and drifts, X or LB uses the item (stick down: backwards), Y looks back.'), t('Start pauses, Select restarts.')]
          : [t('← → steer, ↑ gas, ↓ brake.'), t('Space hops and drifts, Shift or E uses the item (hold ↓ to throw it back), Q looks back.'), t('Esc pauses, R restarts.')];
      const [a, b, c] = driftTierColors();
      pane.append(
        list(ctl),
        h('h3', {}, [t('Drift for a mini-turbo')]),
        h('p', { class: 'fm-line fm-m-tiers' }, [
          h('i', { style: `background:${hex(a)}` }),
          t('blue'),
          h('i', { style: `background:${hex(b)}` }),
          t('orange'),
          h('i', { style: `background:${hex(c)}` }),
          t('pink'),
        ]),
        h('p', { class: 'fm-line' }, [t('Hold a drift and the sparks change colour. Let go for a boost: the longer the drift, the bigger the boost.')]),
        h('h3', {}, [t('Pounce Start')]),
        h('p', { class: 'fm-line' }, [t('Press gas right on MEOW! for a boost off the line. Too early and your kart coughs.')]),
        h('h3', {}, [t('Fish coins')]),
        h('p', { class: 'fm-line' }, [t('Each fish you hold adds a little top speed, up to 10. A spin-out drops three.')]),
      );
    } else if (i === 1) {
      pane.append(
        list([
          t('🟤 Hairball: shoot it forward or back; it bounces off walls.'),
          t('🧶 Yarn: forward it rolls after the cat ahead; back it leaves a tangle. Held, it blocks one hit from behind.'),
          t('🥒 Cucumber: lob it ahead or drop it behind. Cats leap in fright.'),
          t('🌿 Catnip: three quick boosts.'),
          t('📦 Box: hide inside for 3 seconds; hits bounce off.'),
          t('🔔 Bell: every cat within 25 m wobbles.'),
          t('⚡ Zoomies: 3 seconds of top speed on autopilot; cats you touch spin out.'),
          t('🔴 Laser Dot: runs to the leader; every cat it passes chases it.'),
        ]),
        h('p', { class: 'fm-line' }, [t('Cats further back get the stronger items.')]),
      );
    } else {
      pane.append(
        list([
          t('🏆 Grand Prix: four races, points for every place (15 for a win). Top three win a trophy.'),
          t('⏱️ Time Trial: you, three Catnips and a ghost. Beat the dev ghost for medals.'),
          t('🎈 Balloon Battle: pop balloons with items, ram cats while boosting to steal them.'),
          t('📅 Daily Cup: one race a day, the same for everyone. Your first finish is your ranked run.'),
          t('✍️ Track Doodle: draw a track, race it, send the link.'),
        ]),
      );
    }
  };
  fr.body.append(tabs(sections, render, 0), pane);
  render(0);
  fr.footer.remove();
  focusFirst(root, '[role="tab"]');
  return { back: guardedBack };
}
