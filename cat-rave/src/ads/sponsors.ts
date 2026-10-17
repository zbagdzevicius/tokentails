/**
 * The HUD "Sponsors" strip: one sponsored link per live ad (name as text, rel="noopener nofollow
 * sponsored", new tab). Hidden while there are none.
 */
import './ads.css';
import type { LiveAd } from './api';

export const SPONSORED_REL = 'noopener nofollow sponsored';

export interface SponsorsStrip {
  el: HTMLElement;
  update(ads: readonly LiveAd[]): void;
}

export function createSponsorsStrip(): SponsorsStrip {
  const el = document.createElement('nav');
  el.className = 'rv-sponsors';
  el.setAttribute('aria-label', 'Sponsors');
  el.hidden = true;
  return {
    el,
    update(ads) {
      el.replaceChildren();
      el.hidden = ads.length === 0;
      if (!ads.length) return;
      const title = document.createElement('span');
      title.className = 'rv-sponsors-title';
      title.textContent = 'Sponsors';
      el.append(title);
      for (const ad of ads) {
        const a = document.createElement('a');
        a.className = 'rv-sponsor';
        a.href = ad.url;
        a.target = '_blank';
        a.rel = SPONSORED_REL;
        a.textContent = ad.name;
        a.title = `Sponsored by ${ad.name}`;
        el.append(a);
      }
    },
  };
}
