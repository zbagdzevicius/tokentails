/**
 * Desktop side panels (GDD 5.2, 8 streamer layout): targets and the accomplice on the left, ghosts and Rap Sheet
 * progress on the right; the Club streamer flag adds a dare QR code. CSS shows them only on a wide screen
 * (`.bc-sides` is hidden below 900 px and on touch phones), so a portrait phone never sees them. The classes are
 * `bc-sp*`, not the run HUD's `bc-side` (its own Must-Wreck aside), which the panels hide while they show.
 */
import { h } from '../dom';

export interface SidePanelsProps {
  targets: { icon: string; name: string }[];
  accomplice?: string; // "Mila wants the tuna can"
  ghosts: string[]; // "Mochi · 6,375"
  rapLine?: string; // "41 crimes · 12 of 48 stamps"
  /** Club streamer layout: dare QR (SVG markup from platform qrSvg) and the short link under it. */
  qr?: { svg: string; caption: string } | null;
  streamer: boolean;
}

export interface SidePanels {
  /** Strike a target through when it is wrecked (prop order of the briefing list). */
  hit(index: number): void;
  dispose(): void;
}

export function mountSidePanels(host: HTMLElement, p: SidePanelsProps): SidePanels {
  const items = p.targets.map((t) => h('li', {}, h('span', { 'aria-hidden': 'true' }, `${t.icon} `), t.name));
  const left = h(
    'aside',
    { class: 'bc-sp bc-sp-left', 'aria-label': 'Targets' },
    h('div', { class: 'bc-kicker' }, 'Must-Wreck'),
    h('ul', { class: 'bc-sp-targets' }, ...items),
    p.accomplice ? h('p', { class: 'bc-sp-acc' }, `🐾 ${p.accomplice}`) : null,
  );
  const qr = p.qr?.svg ? h('div', { class: 'bc-sp-qr' }) : null;
  if (qr && p.qr) {
    // the SVG comes from qrcode-generator (our own markup, no user text inside)
    qr.innerHTML = p.qr.svg;
    qr.append(h('small', {}, p.qr.caption));
  }
  const right = h(
    'aside',
    { class: 'bc-sp bc-sp-right', 'aria-label': 'Ghosts and Rap Sheet' },
    p.ghosts.length ? h('div', { class: 'bc-kicker' }, 'Ghosts') : null,
    p.ghosts.length ? h('ul', { class: 'bc-sp-ghosts' }, ...p.ghosts.map((g) => h('li', {}, `👻 ${g}`))) : null,
    p.rapLine ? h('div', { class: 'bc-kicker' }, 'Rap Sheet') : null,
    p.rapLine ? h('p', { class: 'bc-small' }, p.rapLine) : null,
    qr ? h('div', { class: 'bc-kicker' }, 'Dare the stream') : null,
    qr,
  );
  const root = h('div', { class: `bc-sides${p.streamer ? ' is-streamer' : ''}` }, left, right);
  host.appendChild(root);
  return {
    hit(i) {
      items[i]?.classList.add('is-hit');
    },
    dispose: () => root.remove(),
  };
}
