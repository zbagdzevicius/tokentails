/**
 * The PawLegends logo (brand/pawlegends, founder pick #48): the yellow-and-purple wordmark with the lightning slash and
 * the cat paw + dog paw fist-bump. Web copies live in public/assets/brand (logo-720.webp, about 2x for the 360 px the
 * lobby draws; logo-compact-640.webp, the wordmark without the paws for short landscape screens, where the full logo
 * would push the Play button down). index.html's boot splash shows the same logo-720.webp.
 */
const base = (): string => import.meta.env.BASE_URL ?? './';

/** The accessible name everywhere the logo replaces a text title. */
export const LOGO_ALT = 'PawLegends';

/** `<h1 class="logo">` with the full logo, swapped for the compact wordmark on short landscape screens. */
export function logoHtml(): string {
  const b = base();
  return `<h1 class="logo brand-logo"><picture><source media="(max-height: 480px)" srcset="${b}assets/brand/logo-compact-640.webp" width="640" height="178"><img src="${b}assets/brand/logo-720.webp" alt="${LOGO_ALT}" width="720" height="454" decoding="async" fetchpriority="high"></picture></h1>`;
}
