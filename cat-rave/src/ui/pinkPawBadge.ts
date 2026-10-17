/**
 * The shelter in the Add-a-cat sheets: a slim line under the title with Pink Paw's round logo and where the money
 * goes. Shown on every step of the in-page checkout (the receipt included) and in the HUD's fallback sheet.
 * The logo is self-hosted (public/brand/pink-paw-logo.webp); if it fails to load the line stays, without it.
 */
import { brandUrl } from '../arc/arcweek';
import { PP_LOGO_ALT, PP_LOGO_FILE } from '../world/pinkPawLayout';
import './pinkPawBadge.css';

/** `checkout`: the in-page checkout, where every rave dollar goes to the shelter. `rave`: the HUD's fallback sheet, whose
 * links also include a $5 shelter-cat adoption that pays the shelter half, so it says what the rave is for instead. */
export const PP_BADGE_TEXT = Object.freeze({ checkout: 'Your $ goes to the ', rave: 'We rave for the ', name: 'Pink Paw', tail: ' cat shelter' });

export function pinkPawBadge(kind: 'checkout' | 'rave' = 'checkout', doc: Document = document): HTMLElement {
  const row = doc.createElement('p');
  row.className = 'rv-pp-badge';
  const img = doc.createElement('img');
  img.className = 'rv-pp-logo';
  img.src = brandUrl(PP_LOGO_FILE);
  img.alt = PP_LOGO_ALT;
  img.width = 40;
  img.height = 40;
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  const text = doc.createElement('span');
  const name = doc.createElement('strong');
  name.textContent = PP_BADGE_TEXT.name;
  text.append(PP_BADGE_TEXT[kind], name, PP_BADGE_TEXT.tail);
  row.append(img, text);
  return row;
}
