/**
 * Consent banner (GDD 14): small, bottom, non-blocking. "Help us count crimes? Anonymous stats, no ads."
 * Yes / No thanks -> onChoice; the banner then tucks itself away (the caller may also unmount it). Nothing is
 * pre-chosen; Escape does not decide for the player.
 */
import type { ConsentProps, Unmount } from '../types';
import { btn, h } from '../ui/dom';
import { scope } from './shared';

export function mountConsent(host: HTMLElement, p: ConsentProps): Unmount {
  const s = scope();
  let done = false;
  const choose = (granted: boolean): void => {
    if (done) return;
    done = true;
    root.classList.add('is-out');
    p.onChoice(granted);
    const t = setTimeout(() => root.remove(), 260);
    s.defer(() => clearTimeout(t));
  };
  const root = h(
    'aside',
    { class: 'bmt-consent', role: 'region', 'aria-label': 'Anonymous stats' },
    h('span', { class: 'bmt-consent-ico', 'aria-hidden': 'true' }, '🐾'),
    h('p', { class: 'bmt-consent-txt' }, h('strong', {}, 'Help us count crimes?'), ' Anonymous stats, no ads.'),
    h('div', { class: 'bmt-consent-btns' }, btn('No thanks', () => choose(false), 'bc-link bmt-consent-no'), btn('Yes', () => choose(true), 'bc-cta bmt-consent-yes')),
  );
  // not a screen: no focus steal, no back handling
  return s.mount(host, root);
}
