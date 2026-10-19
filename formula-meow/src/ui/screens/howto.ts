/**
 * How to play (audio-ui lane, lazy chunk; `registerScreen('howto')`): four tabs that teach the whole game in short
 * cards: Drive (steer, drift, mini-turbo tiers, Pounce Start, the big hand), Items (all eight, what forward and back
 * do), Boosts (pads, tricks, slipstream, fish coins, item boxes) and Controls (touch, keyboard, gamepad, menus).
 * The rules described here are the game's own (items-ai, tuning); nothing is promised that the game does not do.
 */
import type { ScreenApi, ScreenHandle } from '../../core/app/screens';
import { ITEM_ICON, ITEM_NAME, TIER_SHAPE } from '../../core/hud/hud';
import type { ItemId } from '../../types';
import { actionFooter, button, h, panel, tabs } from '../kit';
import { t } from '../i18n';
import { driftTierColors } from '../a11y';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function card(icon: string | Node, title: string, text: string): HTMLElement {
  return h('div', { class: 'fm-howto-card' }, [h('div', { class: 'i', 'aria-hidden': 'true' }, [icon]), h('div', {}, [h('b', {}, [title]), h('p', {}, [text])])]);
}

const ITEM_TEXT: Record<ItemId, string> = {
  hairball: 'Shoot it forward, or back with a swipe down. Spins out whoever it hits.',
  yarn: 'Forward: a homing yarn ball at the cat ahead. Back: a tangle trap. Holding it shields you from one hit from behind.',
  cucumber: 'Lob it ahead or drop it behind. A cat that runs into it leaps in fright.',
  catnip: 'Three speed boosts: one per press.',
  box: 'Hide in a box for 3 seconds. Hits bounce off.',
  bell: 'Ring it and every cat within 25 m wobbles.',
  zoomies: '3 seconds of autopilot at top speed. Any cat you touch spins out.',
  laser: 'The dot races to the leader and spins them out. Every cat it passes chases it for a moment.',
};
const ITEMS: ItemId[] = ['hairball', 'yarn', 'cucumber', 'catnip', 'box', 'bell', 'zoomies', 'laser'];

export function mount(root: HTMLElement, _params: unknown, api: ScreenApi): ScreenHandle {
  const cols = driftTierColors().map(hex);
  const tiers = h(
    'span',
    { class: 'fm-cb-preview' },
    TIER_SHAPE.map((s, i) => h('i', { style: `--c:${cols[i]}` }, [s])),
  );
  const drive = h('div', { class: 'fm-howto', role: 'tabpanel' }, [
    card('🕹️', t('Steer'), t('Left thumb, ← → or the left stick. Gas is automatic on touch (keys: ↑, pad: A).')),
    card('💨', t('Drift'), t('Hop into a bend and hold the drift: push the stick all the way into the turn (one-thumb), hold Space, or hold RB.')),
    card(tiers, t('Mini-turbo'), t('Hold the drift to charge it: blue, then orange, then pink. Let go for a turbo; pink is the biggest.')),
    card('🐾', t('Pounce Start'), t('Press gas right on MEOW! for a head start. Too early and your cat coughs.')),
    card('✋', t('The big hand'), t('Fall off or get stuck and a big hand puts you back on the road.')),
  ]);
  const items = h(
    'div',
    { class: 'fm-howto', role: 'tabpanel' },
    ITEMS.map((id) => card(ITEM_ICON[id], t(ITEM_NAME[id]), t(ITEM_TEXT[id]))),
  );
  const boosts = h('div', { class: 'fm-howto', role: 'tabpanel' }, [
    card('📦', t('Item boxes'), t('Drive through one to roll an item. Cats further back roll stronger items.')),
    card('⏩', t('Boost pads'), t('Drive over a pad for a burst of speed.')),
    card('🛹', t('Ramps and tricks'), t('Hop as you leave a ramp to do a trick. Land it for a boost.')),
    card('🌬️', t('Slipstream'), t('Tuck in right behind another cat to charge a slipstream boost.')),
    card('🐟', t('Fish coins'), t('Every coin you hold adds a little top speed, up to 10. Spinning out or leaping in fright drops 3.')),
  ]);
  const controls = h('div', { class: 'fm-howto', role: 'tabpanel' }, [
    card('👆', t('Touch'), t('Left thumb steers. Right thumb: tap to hop, swipe up for an item forward, down to throw it back. ☰ pauses.')),
    card('⌨️', t('Keyboard'), t('← → steer · ↑ gas · ↓ brake · Space hop and drift · Shift item (hold ↓ to throw back) · Q look back · R restart · Esc pause')),
    card('🎮', t('Gamepad'), t('Stick steers · A or RT gas · B or LT brake · RB drift · X or LB item (stick down: back) · Y look back · Start pause · Select restart')),
    card('🧭', t('Menus'), t('Arrows or the D-pad move, A or Enter picks, B or Esc goes back.')),
  ]);
  const pages = [drive, items, boosts, controls];
  const show = (i: number) => pages.forEach((p, j) => (p.hidden = i !== j));
  show(0);
  const row = tabs([t('Drive'), t('Items'), t('Boosts'), t('Controls')], show, 0);
  root.append(panel(t('How to play'), [row, ...pages, actionFooter([button(t('Got it'), () => api.close(), { primary: true, act: 'done' })])], 'fm-howto-panel'));
  return {};
}
