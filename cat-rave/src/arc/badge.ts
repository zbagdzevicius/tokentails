/**
 * The "MOON RAVE · LIVE ON Arc · THIS WEEK" HUD badge: a neon frame with our wordmark, "LIVE ON" and the
 * official white Arc logo on a dark plate. Wide desktops (>= 1180 px): the bottom-right corner above the
 * hint (under or beside the tool buttons it covered the right moon-ring ad slot). Narrower screens:
 * a one-line pill about 32 px tall in the top-left stats block ("● LIVE ON Arc · this week", hud.ts places
 * it), so it never covers Add a cat, the arrivals list or an ad slot.
 *
 * The phone pill spells "Arc" in text instead of the logo: Arc's logo guidelines (v1.0, 08.2025, section
 * 3.3) set a 50 px minimum height, which a 32 px pill cannot hold. The logo itself stays unmodified: the
 * glow belongs to the frame, never to the logo; it keeps its proportions, its clear space and at least
 * 50 px of height wherever it is shown. If the logo file fails to load the badge falls back to the plain
 * text "Arc" (no approximation of the mark).
 */
import './arc.css';
import { ARC_LOGO_SVG, ARC_TRADEMARK, brandUrl } from './arcweek';

export interface ArcBadge {
  el: HTMLElement;
  setVisible(on: boolean): void;
}

export function createArcBadge(): ArcBadge {
  const el = document.createElement('a');
  el.className = 'rv-arc-badge';
  el.href = 'https://www.arc.network/';
  el.target = '_blank';
  el.rel = 'noopener';
  el.title = `Moon Rave is live on Arc Network this week. ${ARC_TRADEMARK}`;
  el.setAttribute('aria-label', 'Live on Arc Network this week');
  // Our own brand leads the badge (Moon Rave stays the primary brand, public/brand/SOURCE.md); the
  // founder's wording "this week" is visible text, not only in the label.
  const brand = document.createElement('span');
  brand.className = 'rv-arc-brand rv-display';
  brand.textContent = 'MOON RAVE';
  const live = document.createElement('span');
  live.className = 'rv-arc-live rv-display';
  const dot = document.createElement('i');
  dot.className = 'rv-arc-dot';
  dot.setAttribute('aria-hidden', 'true');
  live.append(dot, document.createTextNode('LIVE ON'));
  const week = document.createElement('span');
  week.className = 'rv-arc-week rv-display';
  week.textContent = 'THIS WEEK';
  const plate = document.createElement('span');
  plate.className = 'rv-arc-plate';
  const img = document.createElement('img');
  img.className = 'rv-arc-logo';
  img.alt = 'Arc';
  img.decoding = 'async';
  img.draggable = false;
  img.src = brandUrl(ARC_LOGO_SVG);
  img.addEventListener('error', () => {
    // TODO: logo file missing; plain text stands in (never a redrawn mark).
    const text = document.createElement('span');
    text.className = 'rv-arc-text rv-display';
    text.textContent = 'Arc';
    img.replaceWith(text);
  });
  plate.append(img);
  // Desktop: "● LIVE ON [logo]" on one line, "THIS WEEK" under it.
  const row = document.createElement('span');
  row.className = 'rv-arc-row';
  row.append(live, plate);
  // Phone: one line, text only (the logo cannot shrink below 50 px).
  const pill = document.createElement('span');
  pill.className = 'rv-arc-pill';
  const pillDot = document.createElement('i');
  pillDot.className = 'rv-arc-dot';
  pillDot.setAttribute('aria-hidden', 'true');
  const pillName = document.createElement('b');
  pillName.className = 'rv-arc-pill-name';
  pillName.textContent = 'Arc';
  pill.append(pillDot, document.createTextNode('LIVE ON '), pillName, document.createTextNode(' · this week'));
  el.append(brand, row, week, pill);
  el.hidden = true;
  return {
    el,
    setVisible(on) {
      el.hidden = !on;
    },
  };
}
