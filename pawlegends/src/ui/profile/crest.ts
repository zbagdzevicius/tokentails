/**
 * The Profile screen's rank crests (round 2 critique: "each tier needs a distinct crest"): one inline SVG per ranked
 * tier, each with its own silhouette, not one shield recoloured. Kitten is a round cat-head medallion, Tabby a striped
 * gold shield, Alley a shield with wings, Lion a shield in a spiky mane, Legend the mane with a crown and a gem.
 * Unranked is a hollow grey shield; Placements a dashed one with a question mark. Brand v6 colours. Pure strings.
 */
export type CrestTier = 'none' | 'placements' | 'kitten' | 'tabby' | 'alley' | 'lion' | 'legend';

const PAW = 'M12 13c-3 0-6 2.6-6 5.2 0 1.6 1.4 2.3 3 2.3 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.6 0 3-.7 3-2.3C18 15.6 15 13 12 13zM6.5 11a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zm11 0a2 2.4 0 1 0 0-4.8 2 2.4 0 0 0 0 4.8zM9.3 7.4a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2zm5.4 0a2.1 2.6 0 1 0 0-5.2 2.1 2.6 0 0 0 0 5.2z';
const SHIELD = 'M50 10 L86 22 L82 66 Q78 88 50 104 Q22 88 18 66 L14 22 Z';

const COLORS: Readonly<Record<CrestTier, [string, string, string]>> = Object.freeze({
  // [light, base, deep]
  none: ['#8d82a6', '#5b5076', '#3a3150'],
  placements: ['#b9b0cf', '#6b5d86', '#3a3150'],
  kitten: ['#ffd6e4', '#ff8fb8', '#c8135b'],
  tabby: ['#fff1b8', '#f2c14e', '#a8741a'],
  alley: ['#d3e3ff', '#7aa7ff', '#2c4fb3'],
  lion: ['#ffd2a8', '#ff8a3d', '#b24a0e'],
  legend: ['#f0d9ff', '#c084fc', '#6b21a8'],
});

const paw = (x: number, y: number, s: number, fill: string): string => `<path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="${PAW}"/>`;

/** The crest for a tier as an SVG string (decorative: aria-hidden; the label says the rank). */
export function crestSvg(tier: CrestTier): string {
  const [l, b, dk] = COLORS[tier] ?? COLORS.none;
  const g = `pfx-cg-${tier}`;
  const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="0.55" stop-color="${b}"/><stop offset="1" stop-color="${dk}"/></linearGradient></defs>`;
  const open = `<svg class="pfx-crestsvg" viewBox="0 0 100 112" aria-hidden="true" data-crest="${tier}">${defs}`;
  const rim = '#2a1f3d';
  let body = '';
  switch (tier) {
    case 'none':
      body = `<path d="${SHIELD}" fill="rgb(255 255 255 / 0.04)" stroke="${b}" stroke-width="5"/>${paw(26, 32, 2, b)}`;
      break;
    case 'placements':
      body = `<path d="${SHIELD}" fill="rgb(255 255 255 / 0.05)" stroke="${l}" stroke-width="4" stroke-dasharray="9 7"/><text x="50" y="72" text-anchor="middle" font-size="40" font-weight="900" fill="${l}" font-family="system-ui, sans-serif">?</text>`;
      break;
    case 'kitten':
      // a round cat head: two ears and a medallion
      body = `<path d="M22 40 L28 10 L46 28 Z M78 40 L72 10 L54 28 Z" fill="url(#${g})" stroke="${rim}" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="60" r="36" fill="url(#${g})" stroke="${rim}" stroke-width="4"/><circle cx="50" cy="60" r="27" fill="none" stroke="${l}" stroke-width="2" opacity="0.8"/>${paw(29, 38, 1.75, rim)}`;
      break;
    case 'tabby':
      // a gold shield with tabby stripes on its shoulders
      body = `<path d="${SHIELD}" fill="url(#${g})" stroke="${rim}" stroke-width="4" stroke-linejoin="round"/><path d="M22 28 L34 32 M22 38 L33 41 M22 48 L32 50 M78 28 L66 32 M78 38 L67 41 M78 48 L68 50" stroke="${dk}" stroke-width="4" stroke-linecap="round"/>${paw(28, 36, 1.85, rim)}`;
      break;
    case 'alley':
      // wings behind a blue shield
      body = `<path d="M18 34 Q2 40 4 62 Q12 56 18 58 Q8 66 12 80 Q20 70 24 70 Z M82 34 Q98 40 96 62 Q88 56 82 58 Q92 66 88 80 Q80 70 76 70 Z" fill="${l}" stroke="${rim}" stroke-width="3" stroke-linejoin="round"/><path d="${SHIELD}" fill="url(#${g})" stroke="${rim}" stroke-width="4" stroke-linejoin="round"/><path d="M50 18 L50 98" stroke="${l}" stroke-width="2" opacity="0.35"/>${paw(28, 36, 1.85, rim)}`;
      break;
    case 'lion':
    case 'legend': {
      // a spiky mane ring behind the shield; Legend adds a crown and a gem
      const spikes: string[] = [];
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2;
        const a1 = a0 + Math.PI / 16;
        const a2 = a0 + Math.PI / 8;
        const p = (a: number, r: number): string => `${(50 + Math.cos(a) * r).toFixed(1)} ${(60 + Math.sin(a) * r).toFixed(1)}`;
        spikes.push(`${i ? 'L' : 'M'}${p(a0, 36)} L${p(a1, 50)} L${p(a2, 36)}`);
      }
      body = `<path d="${spikes.join(' ')} Z" fill="${dk}" stroke="${rim}" stroke-width="2.5" stroke-linejoin="round"/><path d="${SHIELD}" fill="url(#${g})" stroke="${rim}" stroke-width="4" stroke-linejoin="round" transform="translate(9 12) scale(0.82)"/>${paw(31, 42, 1.55, rim)}`;
      if (tier === 'legend')
        body += `<path d="M30 20 L36 2 L44 14 L50 0 L56 14 L64 2 L70 20 Z" fill="#ffd166" stroke="${rim}" stroke-width="3" stroke-linejoin="round"/><path d="M50 84 L56 92 L50 100 L44 92 Z" fill="#ff8fb8" stroke="${rim}" stroke-width="2.5"/>`;
      break;
    }
  }
  return `${open}${body}</svg>`;
}
