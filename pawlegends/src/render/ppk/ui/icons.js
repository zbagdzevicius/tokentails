// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/icons.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/icons.js  (owner: ui) — inline SVG icon strings (art.md §13 "ink-line style: 2px ink, round caps, flat
// parchment fills, a single pink or gold accent"). No image assets: everything is vector and recoloured by CSS where
// useful. Pure strings (node-safe). Gradient / clip ids are unique per call (uid()).
// Token Tails (docs/TOKENTAILS-PLAN.md §2.3, §2.6): the currency icon is a catnip sprig (internal id stays `fish`) and the
// heal item a tuna-snack tin (internal id stays `milk`); Clementine's head is the ivory Token Tails coat with crimson eyes
// and her pink bow on the LEFT ear; the logo ties the bow on the first "O", or on the first letter when there is none.

import { BRAND } from '../core/brand.js';

let _uid = 0;
/** Unique id prefix for SVG defs (several copies of an icon may live in the same document). */
export function uid(p = 'u') { _uid = (_uid + 1) % 1e9; return `${p}${_uid.toString(36)}`; }

export const INK = '#3A2A1F';
export const PINK = '#F2A2B8', PINK_DEEP = '#D9668A', GOLD = '#D9B26A', GOLD_DEEP = '#A87C32', HEART = '#F0668E', DANGER = '#E04646';

const HEART_PATH = 'M16 28C6 20.5 1.5 14.6 1.5 9 1.5 4.6 4.8 1.5 8.8 1.5c3.2 0 5.6 1.8 7.2 4.6 1.6-2.8 4-4.6 7.2-4.6 4 0 7.3 3.1 7.3 7.5 0 5.6-4.5 11.5-14.5 19Z';
const HEART_LEFT = 'M16 28C6 20.5 1.5 14.6 1.5 9 1.5 4.6 4.8 1.5 8.8 1.5c3.2 0 5.6 1.8 7.2 4.6Z';

/** HUD heart (§14.2: #F0668E with a white highlight; half-hearts). @param {'full'|'half'|'empty'} state */
export function heart(state = 'full') {
  const fill = state === 'full' ? `<path d="${HEART_PATH}" fill="${HEART}"/>` : state === 'half' ? `<path d="${HEART_LEFT}" fill="${HEART}"/>` : '';
  const hi = state === 'empty' ? '' : '<ellipse cx="8.6" cy="7.4" rx="3.1" ry="1.9" fill="#fff" opacity=".85" transform="rotate(-32 8.6 7.4)"/><circle cx="12.4" cy="5.2" r="1" fill="#fff" opacity=".8"/>';
  return `<svg class="ico-heart" viewBox="0 0 32 30" aria-hidden="true"><path d="${HEART_PATH}" fill="#3A2A1F" fill-opacity=".38"/>${fill}${hi}`
    + `<path d="${HEART_PATH}" fill="none" stroke="#5A2232" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

const SHIELD_PATH = 'M12 1.5 21.5 4.4V12c0 6.6-4.2 11.4-9.5 14.4C6.7 23.4 2.5 18.6 2.5 12V4.4Z';
/** The paw-shield outline (24 × 28 box): the HUD icon, the touch button, the input glyph and the in-world bubble share it. */
export const PAW_SHIELD_PATH = SHIELD_PATH;
/** Paw-shield colours (Pink Paw pink, a deep-pink ribbon rim, a cream paw; gold while the parry window is open). */
export const PAW_SHIELD = Object.freeze({ hi: '#FFC4D4', fill: '#FF8FB1', rim: '#C2457A', paw: '#FFF6EC', gold: '#F2B53A', grey: '#C9C2C6', greyRim: '#6E6468', ink: '#5A2232' });
/** Paw print parts inside the shield box: [pad cx, cy, rx, ry] and the four toes [cx, cy, r]. */
const PS_PAD = [12, 16.6, 3.5, 2.9];
const PS_TOES = [[8.2, 12.4, 1.45], [10.6, 10.3, 1.5], [13.4, 10.3, 1.5], [15.8, 12.4, 1.45]];
/** The Shield states (shieldLook / the HUD): ready, active (held), parry (window open), lockout, broken; `cracks` 0..2. */
export const SHIELD_STATES = Object.freeze(['ready', 'active', 'parry', 'lockout', 'broken']);

/**
 * The Pink Paw shield (TT6): a pink heater shield with a cream paw print and a deep-pink ribbon rim. One shape for the
 * touch button, the ability-bar slot, the Grit pips, the input glyph and the in-world bubble (fx/ShieldBubble.js), so
 * "[icon] to shield" points at something the player sees. `state`: 'ready' | 'active' (a soft halo) | 'parry' (gold
 * rim) | 'lockout' / 'broken' (grey); `cracks` 1..2 draws Grit lost.
 * @param {string} [state] @param {{ cracks?: number, cls?: string }} [o]
 */
export function pawShield(state = 'ready', o = {}) {
  const g = uid('ps'), C = PAW_SHIELD;
  const grey = state === 'lockout' || state === 'broken';
  const rim = state === 'parry' ? C.gold : grey ? C.greyRim : C.rim;
  const halo = state === 'active' || state === 'parry'
    ? `<path d="${SHIELD_PATH}" fill="none" stroke="${state === 'parry' ? C.gold : C.fill}" stroke-width="5" stroke-linejoin="round" opacity=".45"/>` : '';
  const fill = grey ? C.grey : `url(#${g})`;
  const cracks = Math.max(0, Math.min(2, o.cracks | 0)) + (state === 'broken' ? 2 : 0);
  let crack = '';
  if (cracks >= 1) crack += `<path d="M12 3.2 10.4 8.2 13 10.6 11 15" fill="none" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;
  if (cracks >= 2) crack += `<path d="M19.6 6.5 16.4 9.8 17.6 13.4 14.6 18.5" fill="none" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;
  return `<svg class="ico-shield ico-pawshield${o.cls ? ` ${o.cls}` : ''}" viewBox="0 0 24 28" aria-hidden="true" data-state="${state}">`
    + `<defs><linearGradient id="${g}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${C.hi}"/><stop offset="1" stop-color="${C.fill}"/></linearGradient></defs>`
    + halo
    + `<path d="${SHIELD_PATH}" fill="${fill}" stroke="${rim}" stroke-width="${state === 'parry' ? 2.2 : 1.7}" stroke-linejoin="round"/>`
    + `<path d="M12 4.2 19.2 6.4V12c0 5-3.1 8.7-7.2 11.1C7.9 20.7 4.8 17 4.8 12V6.4Z" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round" opacity="${grey ? '.35' : '.6'}"/>`
    + `<g fill="${grey ? '#EEE8EA' : C.paw}" stroke="${grey ? C.greyRim : C.rim}" stroke-width=".7">`
    + `<ellipse cx="${PS_PAD[0]}" cy="${PS_PAD[1]}" rx="${PS_PAD[2]}" ry="${PS_PAD[3]}"/>`
    + PS_TOES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')
    + `</g>${crack}</svg>`;
}

/**
 * The parry cue (TT6 fix round): the shield that pops over a foe's head before a parry-able strike. Gold all over with a
 * pink "!" badge, so it never reads as Clem's own pink shield (the critic saw two pink shields in one spot). The lesson
 * line draws the same icon (inputGlyph shieldCueHtml). `pop` adds a gold halo (the "ting").
 * @param {{ pop?: boolean, cls?: string }} [o]
 */
export function alertShield(o = {}) {
  const g = uid('as');
  const halo = o.pop ? `<path d="${SHIELD_PATH}" fill="none" stroke="#FFE27A" stroke-width="5" stroke-linejoin="round" opacity=".55"/>` : '';
  return `<svg class="ico-shield ico-alertshield${o.cls ? ` ${o.cls}` : ''}" viewBox="-1 -1 27 30" aria-hidden="true" data-state="cue">`
    + `<defs><linearGradient id="${g}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#FFF4B8"/><stop offset="1" stop-color="#FFC23D"/></linearGradient></defs>`
    + halo
    + `<path d="${SHIELD_PATH}" fill="url(#${g})" stroke="#9A5B12" stroke-width="1.9" stroke-linejoin="round"/>`
    + `<g fill="#FFFFFF" stroke="#9A5B12" stroke-width=".7">`
    + `<ellipse cx="${PS_PAD[0]}" cy="${PS_PAD[1]}" rx="${PS_PAD[2]}" ry="${PS_PAD[3]}"/>`
    + PS_TOES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')
    + '</g>'
    + `<circle cx="20.2" cy="4.6" r="4.4" fill="${PAW_SHIELD.rim}" stroke="#FFFFFF" stroke-width="1.2"/>`
    + '<path d="M20.2 2.2V5.4" stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round"/><circle cx="20.2" cy="7.3" r=".95" fill="#FFFFFF"/>'
    + '</svg>';
}

/** Grit pip: a small paw shield (§14.2; TT6 pink like the Shield). @param {'full'|'empty'|'cracked'} state */
export function gritShield(state = 'full') {
  if (state === 'empty' || state === 'cracked') {
    const crack = state === 'cracked' ? `<path d="M12 3 10 9.5 13.5 12 10.5 17.5 12.5 25" fill="none" stroke="${PAW_SHIELD.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    // TT6 fix round: a pale cream shield with a cocoa rim (the dark olive one had no contrast on grass)
    return `<svg class="ico-grit" viewBox="0 0 24 28" aria-hidden="true"><path d="${SHIELD_PATH}" fill="#FFF6EC" fill-opacity="${state === 'cracked' ? '.8' : '.6'}" stroke="#5A3B2E" stroke-width="1.8" stroke-linejoin="round"/>${crack}</svg>`;
  }
  return pawShield('ready', { cls: 'ico-grit' }).replace('class="ico-shield ico-pawshield ico-grit"', 'class="ico-grit ico-pawshield"');
}

/** Brand palette for the currency and snack icons (mint leaves; the Token Tails catnip's lilac flower spike). */
const NIP = Object.freeze({
  silver: { hi: '#E6FBEF', mid: '#8FE3C0', lo: '#3FA87A', vein: '#2E7D5B', stem: '#4E8F5E' },
  gold: { hi: '#FFF6C8', mid: '#FFCC55', lo: '#D9962A', vein: '#A8681A', stem: '#B8862E' },
});
/** The catnip flower spike: lilac #F0C5FD at the tip down to #9A88C9 (TOKENTAILS-PLAN §10.4). */
export const CATNIP_LILAC = Object.freeze({ hi: '#F0C5FD', lo: '#9A88C9' });

/**
 * The heal item: a tuna-snack tin (§14.2 slot; internal id `milk`, "Snack Break"). Empty tins are outlined.
 * The function keeps its old name so every caller (HUD, ability bar, touch, toasts, fly-to-HUD) is unchanged.
 */
export function milkBottle(full = true) {
  const body = 'M3 14.5c0-1.4 3.6-2.5 8-2.5s8 1.1 8 2.5v13c0 1.5-3.6 2.8-8 2.8s-8-1.3-8-2.8Z';
  if (!full) {
    return `<svg class="ico-milk ico-snack" viewBox="0 0 22 34" aria-hidden="true"><path d="${body}" fill="${INK}" fill-opacity=".3"/>`
      + `<path d="${body}" fill="none" stroke="#5B4A3C" stroke-width="1.6" stroke-linejoin="round"/>`
      + '<ellipse cx="11" cy="14.5" rx="8" ry="2.5" fill="none" stroke="#5B4A3C" stroke-width="1.2"/></svg>';
  }
  return `<svg class="ico-milk ico-snack" viewBox="0 0 22 34" aria-hidden="true">`
    // the tin: silver side, a pink paper label with a little fish, a gold pull-ring lid
    + `<path d="${body}" fill="#C9D3DC"/>`
    + `<path d="M3 18.4c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v6.6c0 1.4-3.6 2.5-8 2.5S3 26.4 3 25Z" fill="${PINK}"/>`
    + `<path d="M7 23.2c1.6-1.6 3.6-1.8 5.4-.6l1.8-1.2v3.2l-1.8-1.2c-1.8 1.2-3.8 1-5.4-.2Z" fill="#FFF8EE"/>`
    + `<path d="${body}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<ellipse cx="11" cy="14.5" rx="8" ry="2.5" fill="#E7EAEE" stroke="${INK}" stroke-width="1.3"/>`
    + `<ellipse cx="12.6" cy="13.9" rx="2.4" ry="1" fill="none" stroke="${GOLD_DEEP}" stroke-width="1.2"/>`
    + '<path d="M5 17.5v8" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".85"/>'
    // a tiny heart above: it heals
    + `<path d="M11 9.6C8.4 7.8 7.2 6.4 7.2 5c0-1.1.8-1.9 1.8-1.9.8 0 1.5.5 2 1.2.5-.7 1.2-1.2 2-1.2 1 0 1.8.8 1.8 1.9 0 1.4-1.2 2.8-3.8 4.6Z" fill="${HEART}" stroke="#5A2232" stroke-width=".9"/></svg>`;
}

/**
 * The currency: a catnip sprig (internal id `fish`): mint leaves and a lilac flower spike at the tip, as Token Tails
 * draws catnip. `gold` = the golden catnip worth 10 (gold leaves, same lilac spike; the mint sprig is 1).
 * @param {boolean} [gold]
 */
export function fish(gold = false) {
  const g = uid('cn'), f = uid('cf'), c = gold ? NIP.gold : NIP.silver;
  const leaf = (d) => `<path d="${d}" fill="url(#${g})" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  // the flower spike: stacked lilac florets on the stem tip (top-right), lightest at the tip
  const florets = [[33.2, 4.6, 2.3, 1.9], [34.9, 3.1, 2.1, 1.7], [36.2, 1.9, 1.7, 1.4]]
    .map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(-32 ${x} ${y})" fill="url(#${f})" stroke="${INK}" stroke-width="1"/>`).join('');
  return `<svg class="ico-fish ico-catnip${gold ? ' is-gold' : ''}" viewBox="0 0 38 22" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${c.hi}"/><stop offset=".55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.lo}"/></linearGradient>`
    + `<linearGradient id="${f}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CATNIP_LILAC.hi}"/><stop offset="1" stop-color="${CATNIP_LILAC.lo}"/></linearGradient></defs>`
    // stem (lying across the icon, bottom-left to top-right)
    + `<path d="M4 19.5C12 15 22 10 34 4" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`
    + `<path d="M4 19.5C12 15 22 10 34 4" fill="none" stroke="${c.stem}" stroke-width="1.6" stroke-linecap="round"/>`
    // three pairs of serrated heart-shaped leaves
    + leaf('M11 15.6C7.4 13.6 6.2 9.8 8.4 7.6c1.8.4 3.6 2.6 4 5.2Z') + leaf('M12.6 16.2c1 3.6 4.4 5.2 7 4-.2-2-2.6-3.6-5.4-4.4Z')
    + leaf('M19.6 11.8C16.6 9 16.4 5 19 3.4c1.6.8 2.8 3.4 2.6 6Z') + leaf('M21.4 12.2c1.6 3.2 5.2 4 7.4 2.4-.6-1.8-3.2-3-6-3Z')
    + leaf('M28 7.6c-1.8-2.8-1-6 1.6-6.6 1.2 1 1.6 3.4.8 5.6Z') + leaf('M29.6 7.4c2.2 1.8 5 1.6 6.4-.4-1-1.4-3.4-1.8-5.6-1Z')
    + `<path d="M9.4 9.4 11.6 13M18.8 5.4l1.4 4.4M28.6 2.8l.4 3.4" stroke="${c.vein}" stroke-width=".9" stroke-linecap="round" opacity=".8"/>`
    + `<circle cx="9.6" cy="8.6" r=".9" fill="#fff" opacity=".85"/><circle cx="19" cy="4.6" r=".9" fill="#fff" opacity=".85"/>`
    + florets
    + (gold ? `<path d="M34.5 12.5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8Z" fill="#FFF6C8" stroke="${GOLD_DEEP}" stroke-width=".7"/>` : '')
    + '</svg>';
}

/**
 * The Token Tails gold ":3" coin (TOKENTAILS-PLAN §10.2 / §10.7: G1's edge arrow and badge, the results card). A
 * generic gold disc with a cat face; `px` is the rendered size. Pure SVG string.
 * @param {number} [px]
 */
export function ttCoin(px = 32) {
  const g = uid('tc'), s = Math.max(8, Math.round(px));
  return `<svg class="ico-ttcoin" width="${s}" height="${s}" viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="${g}" cx=".4" cy=".35" r=".75">`
    + '<stop offset="0" stop-color="#FFE9A0"/><stop offset=".55" stop-color="#FFCC55"/><stop offset="1" stop-color="#E0A23A"/></radialGradient></defs>'
    + '<circle cx="20" cy="20" r="18" fill="#C9862A" stroke="#4A1D08" stroke-width="2.2"/>'
    + `<circle cx="20" cy="19" r="15" fill="url(#${g})"/>`
    + '<path d="M9.5 14a12 12 0 0 1 8-6.5" fill="none" stroke="#FFF6D6" stroke-width="2" stroke-linecap="round" opacity=".85"/>'
    // the ":3" face: two eyes and a little "w" mouth
    + '<g fill="#4A1D08"><ellipse cx="14.8" cy="17" rx="2" ry="2.5"/><ellipse cx="25.2" cy="17" rx="2" ry="2.5"/></g>'
    + '<path d="M14.5 23.2q2.8 3 5.5 0q2.7 3 5.5 0" fill="none" stroke="#4A1D08" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';
}

/**
 * A Pink Paw print (TOKENTAILS-PLAN §10.2 / §10.7: G1's trail prints, step dots and badge): a love-pink #FF7AA2 pad
 * with soft-pink #FFB3C7 bean highlights and a maroon #4A1D08 rim. A generic paw, never Pink Paw's daisy logo.
 * `ivory: true` draws the Token Tails ivory pad (#F3EEE6) with pink beans instead.
 * @param {number} [px] @param {{ ivory?: boolean }} [o]
 */
export function pinkPaw(px = 24, { ivory = false } = {}) {
  const s = Math.max(8, Math.round(px));
  const pad = ivory ? '#F3EEE6' : '#FF7AA2', bean = '#FF7AA2', hi = ivory ? '#FFFFFF' : '#FFB3C7';
  const toes = [[15.4, 20.6, -18], [20.6, 16, -6], [27.4, 16, 6], [32.6, 20.6, 18]];
  return `<svg class="ico-pinkpaw" width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><g stroke="#4A1D08" stroke-width="2">`
    + `<ellipse cx="24" cy="30" rx="8.6" ry="7.2" fill="${pad}"/>`
    + toes.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="3.5" ry="4.4" transform="rotate(${r} ${x} ${y})" fill="${pad}"/>`).join('')
    + '</g>'
    + (ivory ? `<ellipse cx="24" cy="31" rx="4.6" ry="3.4" fill="${bean}"/>` + toes.map(([x, y]) => `<ellipse cx="${x}" cy="${y + 0.6}" rx="1.7" ry="2.2" fill="${bean}"/>`).join('') : '')
    + `<ellipse cx="21" cy="27.4" rx="3" ry="1.6" fill="${hi}" opacity=".85"/>`
    + toes.map(([x, y]) => `<circle cx="${x - 0.8}" cy="${y - 1.4}" r="1" fill="${hi}" opacity=".85"/>`).join('')
    + '</svg>';
}

/**
 * Little cat head (lives icon §14.2 "cat head with a bow"; kitten counter). The defaults are Clementine in the Token
 * Tails coat (ivory, no stripes, salmon inner ears, crimson eyes, pink bow). Pass `deep` for tabby stripes (kittens).
 */
export function catHead({ fur = '#F3EEE6', deep = null, cream = '#FFFFFF', bow = true, eyes = '#B3212F', ear = '#F2A08C' } = {}) {
  const bowSvg = bow ? `<g transform="translate(29 7.2) rotate(18)"><path d="M0 0-5.6-3.4c-.9-.5-1.9.1-1.9 1.1v4.6c0 1 1 1.6 1.9 1.1Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1"/>`
    + `<path d="M0 0 5.6-3.4c.9-.5 1.9.1 1.9 1.1v4.6c0 1-1 1.6-1.9 1.1Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1"/><circle r="1.6" fill="#E88AA6" stroke="${PINK_DEEP}" stroke-width=".8"/></g>` : '';
  return `<svg class="ico-cat" viewBox="0 0 40 36" aria-hidden="true">`
    + `<path d="M7 15 6 3.5 16 9.5M33 15 34 3.5 24 9.5" fill="${fur}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M9 12.5 8.4 6.8 13.4 9.6M31 12.5 31.6 6.8 26.6 9.6" fill="${ear}"/>`
    + `<path d="M4 21c0-8 7-12.5 16-12.5S36 13 36 21c0 7.5-7 12.5-16 12.5S4 28.5 4 21Z" fill="${fur}" stroke="${INK}" stroke-width="1.6"/>`
    + (deep ? `<path d="M20 9.5v4M15.5 10.5l1 3.4M24.5 10.5l-1 3.4" stroke="${deep}" stroke-width="1.6" stroke-linecap="round"/>` : '')
    + `<ellipse cx="20" cy="27" rx="7.5" ry="5" fill="${cream}"/>`
    + `<circle cx="13.6" cy="20.5" r="3.2" fill="${eyes}"/><circle cx="26.4" cy="20.5" r="3.2" fill="${eyes}"/>`
    + `<circle cx="13.6" cy="20.8" r="1.8" fill="${INK}"/><circle cx="26.4" cy="20.8" r="1.8" fill="${INK}"/>`
    + '<circle cx="12.6" cy="19.5" r="1" fill="#fff"/><circle cx="25.4" cy="19.5" r="1" fill="#fff"/>'
    + `<path d="M18.6 24.6h2.8L20 26.2Z" fill="#C97F7A"/><path d="M17.4 27.4c1.2 1 2.1.5 2.6-.4.5.9 1.4 1.4 2.6.4" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>`
    + `${bowSvg}</svg>`;
}

/** Translucent ghost kitten (§7.6: floats up out of the lives icon and waves). */
export function ghostKitten() {
  return '<svg class="ico-ghost" viewBox="0 0 48 60" aria-hidden="true">'
    + '<ellipse cx="24" cy="5" rx="9" ry="2.6" fill="none" stroke="#FFE3A3" stroke-width="2"/>'
    + '<path d="M10 22 8.5 9.5 18 15.5M38 22 39.5 9.5 30 15.5" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1.4" stroke-linejoin="round"/>'
    + '<path d="M7 30c0-10 7.5-15 17-15s17 5 17 15v18c0 3-2 5-4 3l-3-3-3 3-3-3-4 3-4-3-3 3-3-3-3 3c-2 2-4 0-4-3Z" fill="#FFFFFF" fill-opacity=".92" stroke="#C9D3E3" stroke-width="1.4"/>'
    + '<path d="M40 31c4-3 6-7 5-10" fill="none" stroke="#C9D3E3" stroke-width="3.2" stroke-linecap="round" class="ghost-paw"/>'
    + `<path d="M15.5 28.5q2-2.4 4 0M28.5 28.5q2-2.4 4 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    + '<ellipse cx="14.5" cy="32.5" rx="2.4" ry="1.4" fill="#F7B6C8" opacity=".8"/><ellipse cx="33.5" cy="32.5" rx="2.4" ry="1.4" fill="#F7B6C8" opacity=".8"/>'
    + `<path d="M22.6 31.4h2.8L24 33Z" fill="#E59BA5"/><path d="M21.4 34c1.2 1 2.1.5 2.6-.4.5.9 1.4 1.4 2.6.4" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>`
    + `<g transform="translate(33 13) rotate(15)"><path d="M0 0-4.6-2.8c-.8-.4-1.6.1-1.6.9v3.8c0 .8.8 1.3 1.6.9Z" fill="${PINK}"/><path d="M0 0 4.6-2.8c.8-.4 1.6.1 1.6.9v3.8c0 .8-.8 1.3-1.6.9Z" fill="${PINK}"/><circle r="1.3" fill="#E88AA6"/></g>`
    + '</svg>';
}

/** Parchment letter with a pink wax seal; `found` adds a check. */
export function letter(found = true) {
  return `<svg class="ico-letter" viewBox="0 0 36 28" aria-hidden="true"><rect x="2" y="3" width="32" height="22" rx="2.5" fill="${found ? '#F4E7C9' : '#3A2A1F'}" fill-opacity="${found ? 1 : 0.3}" stroke="${INK}" stroke-width="1.6"/>`
    + `<path d="M2.8 4.2 18 15.5 33.2 4.2" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" opacity="${found ? 0.8 : 0.5}"/>`
    + `<circle cx="18" cy="15" r="5.2" fill="${found ? PINK_DEEP : '#7B6A5C'}" stroke="#9E3C5F" stroke-width="1"/>`
    + (found ? '<path d="M15.6 15.2 17.4 17 20.6 13.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : '') + '</svg>';
}

/** Heart Bell (toast). */
export function bell() {
  return `<svg class="ico-bell" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4c-5.5 0-8.5 4.2-8.5 9.5v5L5 22.5h22L24.5 18.5v-5C24.5 8.2 21.5 4 16 4Z" fill="${GOLD}" stroke="${GOLD_DEEP}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<circle cx="16" cy="25.2" r="2.6" fill="${GOLD_DEEP}"/><path d="M11 10.5c.8-2 2.2-3.2 4-3.6" stroke="#FFF1C4" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
    + `<path d="M10 3.4 16 6l6-2.6" fill="none" stroke="${PINK_DEEP}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

/** Sword (skin unlock toast; also the touch attack button). */
export function sword(color = '#E7EAEE') {
  return '<svg class="ico-sword" viewBox="0 0 32 32" aria-hidden="true">'
    + `<path d="M23.5 3.5 27.5 4.5 28.5 8.5 14 23 9 18Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M24.5 6 12 18.5" stroke="#9AA3AE" stroke-width="1.2"/>`
    + `<path d="M6.5 15.5 16.5 25.5" stroke="${GOLD}" stroke-width="3.2" stroke-linecap="round"/><path d="M6.5 15.5 16.5 25.5" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity=".5"/>`
    + `<path d="M11 21 5.5 26.5" stroke="#6B4429" stroke-width="3.2" stroke-linecap="round"/><circle cx="4.6" cy="27.4" r="2.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/></svg>`;
}

/** Shield (touch Shield button, ability bar): the Pink Paw shield (TT6). */
export function shield(state = 'ready', o = {}) { return pawShield(state, o); }

/** Cape (cape unlock toast). */
export function cape(color = '#FFF3E2', hem = GOLD) {
  return `<svg class="ico-cape" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14l2.5 22c-3 2-6 2.5-9.5 1-3.5 1.5-6.5 1-9.5-1Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M9 4h14" stroke="${hem}" stroke-width="3" stroke-linecap="round"/><path d="M13 9l-1.5 15M19 9l1.5 15" stroke="${INK}" stroke-width="1" opacity=".35"/></svg>`;
}

/** Wax seal with an embossed paw (§13 "pink wax seals with an embossed paw for confirm and save"). */
export function waxSeal(color = PINK_DEEP, glyph = 'paw') {
  const g = uid('ws');
  const inner = glyph === 'paw' ? pawPath('#FFFFFF', 0.55) : glyph === 'check'
    ? '<path d="M15 25.5 21 31.5 33 18.5" fill="none" stroke="#FFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>' : '';
  const blob = 'M24 2.5c3 0 4.4 2.6 7.1 3.4 2.7.9 5.6-.4 7.5 1.7 2 2 .8 4.9 1.7 7.6.9 2.7 3.4 4 3.4 6.8s-2.5 4.3-3.4 7c-.9 2.7.4 5.6-1.6 7.6-2 2-4.9.8-7.6 1.7-2.7.9-4.1 3.5-7.1 3.5s-4.3-2.6-7-3.5c-2.8-.9-5.7.4-7.7-1.6-2-2-.7-4.9-1.6-7.6-.9-2.7-3.5-4.2-3.5-7.1s2.6-4.1 3.5-6.8c.9-2.7-.4-5.6 1.6-7.6s4.9-.8 7.6-1.7C19.7 5.1 21 2.5 24 2.5Z';
  return `<svg class="ico-seal" viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="${g}" cx=".38" cy=".32" r=".8">`
    + `<stop offset="0" stop-color="#FFFFFF" stop-opacity=".45"/><stop offset=".35" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>`
    + `<path d="${blob}" fill="${color}" stroke="#9E3C5F" stroke-width="1.2"/><circle cx="24" cy="24" r="13.5" fill="none" stroke="#9E3C5F" stroke-width="1.4" opacity=".7"/>`
    + `<g opacity=".9">${inner}</g><path d="${blob}" fill="url(#${g})"/></svg>`;
}

/** Paw print shapes centred on (24, 24) in a 48 box (used by seals and the loading bar). */
export function pawPath(color = INK, opacity = 1) {
  return `<g fill="${color}" opacity="${opacity}"><ellipse cx="24" cy="28.5" rx="7.4" ry="6.2"/><ellipse cx="15.4" cy="20.6" rx="3" ry="3.8" transform="rotate(-18 15.4 20.6)"/>`
    + '<ellipse cx="20.6" cy="16" rx="3" ry="3.9" transform="rotate(-6 20.6 16)"/><ellipse cx="27.4" cy="16" rx="3" ry="3.9" transform="rotate(6 27.4 16)"/>'
    + '<ellipse cx="32.6" cy="20.6" rx="3" ry="3.8" transform="rotate(18 32.6 20.6)"/></g>';
}

/** Standalone paw icon. */
export function paw(color = INK) { return `<svg class="ico-paw" viewBox="0 0 48 48" aria-hidden="true">${pawPath(color)}</svg>`; }

/** Golden Hour glyph: a little sun (§14.2 Valor at 100). */
export function sun(color = '#FFD34D') {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x1 = 16 + Math.cos(a) * 9.5, y1 = 16 + Math.sin(a) * 9.5, x2 = 16 + Math.cos(a) * 14, y2 = 16 + Math.sin(a) * 14;
    rays += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }
  return `<svg class="ico-sun" viewBox="0 0 32 32" aria-hidden="true"><g stroke="${color}" stroke-width="2.4" stroke-linecap="round">${rays}</g>`
    + `<circle cx="16" cy="16" r="6.6" fill="${color}" stroke="${GOLD_DEEP}" stroke-width="1.4"/><circle cx="14" cy="14" r="2" fill="#FFF6DA"/></svg>`;
}

/** Shard of the Dawnstone (toast). */
export function shard() {
  return `<svg class="ico-shard" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2 24 12 19 30 13 30 8 12Z" fill="#FFE3A3" stroke="${GOLD_DEEP}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M16 2 16 30M8 12h16" stroke="${GOLD_DEEP}" stroke-width="1" opacity=".6"/><path d="M12 9.5 15 5.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

/** Objective flag / check (toast). */
export function flag() {
  return `<svg class="ico-flag" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 3.5V29" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="M8.6 5h16l-3.6 5.5 3.6 5.5h-16Z" fill="${PINK}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/** Threat arrow (screen-edge chevron, points right; rotated by CSS). */
export function chevron() {
  return '<svg class="ico-chev" viewBox="0 0 40 40" aria-hidden="true"><path d="M8 6 34 20 8 34 14 20Z" fill="currentColor" stroke="#2A1E18" stroke-width="2.4" stroke-linejoin="round"/>'
    + '<path d="M12 11 26 19" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/></svg>';
}

/** Circular progress ring (stroke-dashoffset driven). r = 20 in a 48 box; circumference RING_LEN. */
export const RING_LEN = 2 * Math.PI * 20;
export function ring(cls = 'ring') {
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><circle class="ring-bg" cx="24" cy="24" r="20" fill="none" stroke-width="5"/>`
    + `<circle class="ring-fg" cx="24" cy="24" r="20" fill="none" stroke-width="5" stroke-linecap="round" transform="rotate(-90 24 24)" stroke-dasharray="${RING_LEN.toFixed(2)}" stroke-dashoffset="${RING_LEN.toFixed(2)}"/></svg>`;
}

/** Touch: tumble, jump, pause, milk, meow icons. */
export function tumble() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 20a9 9 0 1 1 9 7" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M5.5 15.5 8 21l5-3" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function jump() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 16 16 8l8 8M8 24l8-8 8 8" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export function pauseIcon() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="9" y="7" width="5" height="18" rx="2" fill="${INK}"/><rect x="18" y="7" width="5" height="18" rx="2" fill="${INK}"/></svg>`;
}
export function meowFace() {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 13 5.5 4.5 12.5 8.5M26 13l.5-8.5-7 4" fill="#F0C08F" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M4 17c0-6 5.5-9 12-9s12 3 12 9-5.5 10-12 10S4 23 4 17Z" fill="#F0C08F" stroke="${INK}" stroke-width="1.6"/>`
    + `<path d="M10 16q2-2 4 0M18 16q2-2 4 0" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    + `<ellipse cx="16" cy="22.5" rx="2.6" ry="2.2" fill="#C97F7A" stroke="${INK}" stroke-width="1"/></svg>`;
}

/** Game-over illustration: Clementine (ivory coat, pink bow) curled asleep around her sword (§14.3). */
export function sleepingCat() {
  return '<svg class="ill-sleep" viewBox="0 0 240 130" aria-hidden="true">'
    + '<ellipse cx="120" cy="116" rx="96" ry="9" fill="#3A2A1F" opacity=".18"/>'
    // sword lying in front
    + `<path d="M28 108 196 96" stroke="#C8CDD5" stroke-width="7" stroke-linecap="round"/><path d="M28 108 196 96" stroke="${INK}" stroke-width="1.4" opacity=".35"/>`
    + `<path d="M196 96 214 94" stroke="#6B4429" stroke-width="6" stroke-linecap="round"/><path d="M193 84 198 108" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/><circle cx="218" cy="93.7" r="4.4" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`
    // cape
    + '<path d="M58 98c-6-30 20-58 62-58s70 26 64 58Z" fill="#A3202C" stroke="#5A0E16" stroke-width="2"/>'
    // curled body
    + `<path d="M66 100c-4-24 18-46 52-46 30 0 56 16 56 40 0 6-2 8-6 8H72c-4 0-6-0-6-2Z" fill="#F3EEE6" stroke="${INK}" stroke-width="2"/>`
    // tail wrapped
    + `<path d="M170 96c14-2 22-14 14-24-6-8-18-6-20 2" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/><path d="M170 96c14-2 22-14 14-24-6-8-18-6-20 2" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>`
    // pauldron
    + '<path d="M118 66c10-6 26-4 32 6-8 2-22 4-32-6Z" fill="#C8CDD5" stroke="#4E535A" stroke-width="1.6"/>'
    // head
    + `<path d="M58 72 56 50 72 61M96 66 104 46 86 58" fill="#F3EEE6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + '<path d="M60 68 59.5 55 68 61" fill="#F2A08C"/>'
    + `<ellipse cx="78" cy="80" rx="27" ry="21" fill="#F3EEE6" stroke="${INK}" stroke-width="2"/>`
    + '<ellipse cx="78" cy="89" rx="13" ry="8.5" fill="#FFFFFF"/>'
    + `<path d="M64 78q5 4 10 0M84 78q5 4 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    + '<ellipse cx="62" cy="86" rx="4" ry="2.4" fill="#F7B6C8" opacity=".7"/><ellipse cx="96" cy="86" rx="4" ry="2.4" fill="#F7B6C8" opacity=".7"/>'
    + `<path d="M76 85h4l-2 2Z" fill="#C97F7A"/>`
    // bow on her left ear (viewer's right ear here)
    + `<g transform="translate(98 52) rotate(24)"><path d="M0 0-8-5c-1.3-.8-2.8.2-2.8 1.6v6.8c0 1.4 1.5 2.4 2.8 1.6Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1.4"/><path d="M0 0 8-5c1.3-.8 2.8.2 2.8 1.6v6.8c0 1.4-1.5 2.4-2.8 1.6Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1.4"/><circle r="2.4" fill="#E88AA6" stroke="${PINK_DEEP}" stroke-width="1"/></g>`
    // zzz
    + `<g class="zzz" fill="${INK}" font-family="Nunito, Fredoka, system-ui, sans-serif" font-weight="800"><text x="108" y="38" font-size="15">z</text><text x="122" y="26" font-size="19">z</text><text x="140" y="14" font-size="23">z</text></g>`
    + '</svg>';
}

/**
 * The game logo (art.md §13 title screen): the title in gold letters with the pink bow tied on the first "O"; a title
 * without an "O" (like the current one) gets the bow on its first letter instead (top-left, tilted). Returns HTML.
 * `text` is plain text (escaped here; default: core/brand.js BRAND.titleCaps); `sub` is trusted HTML (callers escape it).
 */
export function logoHtml(text = BRAND.titleCaps, sub = '') {
  const chars = [...String(text ?? '')];
  let at = chars.findIndex((c) => c === 'O' || c === 'o');
  const onO = at >= 0;
  if (!onO) at = chars.findIndex((c) => c.trim() !== '');
  const letters = chars.map((c, i) => {
    const ch = c === ' ' ? '&nbsp;' : esc1(c);
    if (i === at) return `<span class="logo-l ${onO ? 'logo-o' : 'logo-first'}" style="--i:${i}">${ch}<span class="logo-bow">${bowSvg()}</span></span>`;
    return `<span class="logo-l" style="--i:${i}">${ch}</span>`;
  }).join('');
  return `<div class="logo"><div class="logo-word">${letters}</div>${sub ? `<div class="logo-sub">${sub}</div>` : ''}</div>`;
}

const ESC1 = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc1(c) { return ESC1[c] ?? c; }

/** A standalone pink bow (logo, portrait frames). */
export function bowSvg() {
  return '<svg class="ico-bow" viewBox="0 0 44 26" aria-hidden="true">'
    + `<path d="M22 13 4.5 3.2C2.6 2.1.5 3.4.5 5.6v14.8c0 2.2 2.1 3.5 4 2.4Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M22 13 39.5 3.2c1.9-1.1 4 .2 4 2.4v14.8c0 2.2-2.1 3.5-4 2.4Z" fill="${PINK}" stroke="${PINK_DEEP}" stroke-width="1.6" stroke-linejoin="round"/>`
    + '<path d="M5 7.5 15 12M39 7.5 29 12" stroke="#FFD2DE" stroke-width="2" stroke-linecap="round"/>'
    + `<path d="M18.5 13 15 25M25.5 13 29 25" stroke="${PINK_DEEP}" stroke-width="3" stroke-linecap="round"/>`
    + `<ellipse cx="22" cy="13" rx="4.6" ry="5.2" fill="#E88AA6" stroke="${PINK_DEEP}" stroke-width="1.6"/></svg>`;
}

/** Device glyphs for the Controls card header. */
export function keyboardIco() {
  return `<svg class="ico-dev" viewBox="0 0 48 32" aria-hidden="true"><rect x="2" y="5" width="44" height="22" rx="4" fill="#FFFDF6" stroke="${INK}" stroke-width="2"/>`
    + `<g fill="${INK}" opacity=".7">${[8, 15, 22, 29, 36].map((x) => `<rect x="${x}" y="10" width="4.5" height="4" rx="1"/><rect x="${x + 2}" y="16" width="4.5" height="4" rx="1"/>`).join('')}</g>`
    + `<rect x="14" y="21.5" width="20" height="3" rx="1.4" fill="${PINK_DEEP}"/></svg>`;
}
export function padIco() {
  return `<svg class="ico-dev" viewBox="0 0 48 32" aria-hidden="true"><path d="M12 6h24c6 0 10 6 10 14 0 6-3 9-6 9-4 0-6-6-9-6H17c-3 0-5 6-9 6-3 0-6-3-6-9C2 12 6 6 12 6Z" fill="#FFFDF6" stroke="${INK}" stroke-width="2"/>`
    + `<path d="M12 12v8M8 16h8" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="34" cy="13" r="2.3" fill="${PINK_DEEP}"/><circle cx="38.5" cy="17.5" r="2.3" fill="${GOLD}"/><circle cx="29.5" cy="17.5" r="2.3" fill="#5E8FA8"/><circle cx="34" cy="22" r="2.3" fill="#7FB04E"/></svg>`;
}
export function touchIco() {
  return `<svg class="ico-dev" viewBox="0 0 48 32" aria-hidden="true"><rect x="6" y="2" width="36" height="28" rx="5" fill="#FFFDF6" stroke="${INK}" stroke-width="2"/>`
    + `<circle cx="16" cy="20" r="5" fill="none" stroke="${INK}" stroke-width="1.8" opacity=".6"/><circle cx="33" cy="20" r="3.4" fill="${PINK_DEEP}"/><circle cx="36" cy="12" r="2.4" fill="${GOLD}"/></svg>`;
}

/** Dizzy meter glyph: a swirl with two little stars (boss bar, §14.2 gold Dizzy bar). */
export function dizzyStars() {
  return `<svg class="ico-dizzy" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 16c0-2 3-2 3 0 0 3.5-6 3.5-6 0 0-5 9-5 9 0 0 6.5-12 6.5-12 0 0-8 15-8 15 0" fill="none" stroke="#FFD34D" stroke-width="2.4" stroke-linecap="round"/>`
    + `<path d="M5 6l1 2.4 2.4 1-2.4 1L5 13l-1-2.6-2.4-1 2.4-1ZM27 21l.9 2 2 .9-2 .9-.9 2.2-.9-2.2-2-.9 2-.9Z" fill="#FFF6DA" stroke="${GOLD_DEEP}" stroke-width=".8"/></svg>`;
}

// ------------------------------------------------------------------ Phase W (WARM_ADVENTURE_SPEC §3.4, §4, §5.4, §7.5)
/** Cocoa ink of the candy skin (WA §2.7 allowlist). */
export const COCOA = '#5A3B2E';

/**
 * Telegraph glyph shapes (WA §3.4; the same five-plus-two language fx draws on the ground): drawn in a 24-unit box,
 * white fill with a cocoa outline so they read on any arrow colour. Unknown names fall back to the chevron pair.
 */
const GLYPH = {
  shield: '<path d="M12 3 19.5 5.6v5.8c0 4.8-3.3 8.1-7.5 9.6-4.2-1.5-7.5-4.8-7.5-9.6V5.6Z"/>',
  star8: '<path d="M12 2.5l1.9 4.9 4.8-2.1-2.1 4.8 4.9 1.9-4.9 1.9 2.1 4.8-4.8-2.1-1.9 4.9-1.9-4.9-4.8 2.1 2.1-4.8L2.5 12l4.9-1.9-2.1-4.8 4.8 2.1Z"/>',
  chevron2: '<path d="M4 4.5h4.6L15 12l-6.4 7.5H4L10.4 12Z"/><path d="M11 4.5h4.6L22 12l-6.4 7.5H11L17.4 12Z"/>',
  dots6: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="4.6" r="2.1"/><circle cx="18.4" cy="8.3" r="2.1"/><circle cx="18.4" cy="15.7" r="2.1"/><circle cx="12" cy="19.4" r="2.1"/><circle cx="5.6" cy="15.7" r="2.1"/><circle cx="5.6" cy="8.3" r="2.1"/>',
  paw: '<ellipse cx="12" cy="15" rx="4.6" ry="3.9"/><ellipse cx="6.4" cy="9.6" rx="1.9" ry="2.4"/><ellipse cx="9.8" cy="6.2" rx="1.9" ry="2.5"/><ellipse cx="14.2" cy="6.2" rx="1.9" ry="2.5"/><ellipse cx="17.6" cy="9.6" rx="1.9" ry="2.4"/>',
  crowfoot: '<path d="M12 21V11M12 11 5.5 4.5M12 11V3.2M12 11l6.5-6.5" fill="none" stroke-width="3.2" stroke-linecap="round"/>',
  arrow: '<path d="M3.5 12h11.5M11 6l7.5 6-7.5 6" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>',
};
export const GLYPH_NAMES = Object.freeze(Object.keys(GLYPH));

/** One telegraph glyph as an inline SVG (`name` from TELEGRAPH.glyph). */
export function glyph(name, fill = '#FFFFFF') {
  const g = GLYPH[name] ?? GLYPH.chevron2;
  const lineOnly = name === 'crowfoot' || name === 'arrow';
  return `<svg class="ico-glyph" viewBox="0 0 24 24" aria-hidden="true">`
    + (lineOnly
      ? `<g stroke="${COCOA}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">${g.replace(/stroke-width="[^"]+"/g, '')}</g><g stroke="${fill}" fill="none">${g}</g>`
      : `<g fill="${fill}" stroke="${COCOA}" stroke-width="1.8" stroke-linejoin="round" paint-order="stroke fill">${g}</g>`)
    + '</svg>';
}

/** Four-point twinkle star (results stamp ring, celebration sparkles). */
export function star4(color = '#FFE066') {
  return `<svg class="ico-star4" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.4 7.1 7.1 2.4-7.1 2.4L12 20.5l-2.4-7.1L2.5 11l7.1-2.4Z" fill="${color}" stroke="${COCOA}" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

/** Settings gear for the title (WA §4.3: 48 px, top-right). */
export function gear() {
  let teeth = '';
  for (let i = 0; i < 8; i++) teeth += `<rect x="13.6" y="1.6" width="4.8" height="6" rx="1.6" transform="rotate(${i * 45} 16 16)"/>`;
  return `<svg class="ico-gear" viewBox="0 0 32 32" aria-hidden="true"><g fill="#FFF8EE" stroke="${COCOA}" stroke-width="1.8" stroke-linejoin="round">${teeth}<circle cx="16" cy="16" r="10"/></g>`
    + `<circle cx="16" cy="16" r="4.2" fill="#FF9EC0" stroke="${COCOA}" stroke-width="1.8"/></svg>`;
}

/** The ghost-paw demo hand (WA §7.5: 64 px cream paw with a cocoa outline). */
export function ghostPaw() {
  return `<svg class="ico-ghostpaw" viewBox="0 0 64 64" aria-hidden="true"><g fill="#FFF8EE" stroke="${COCOA}" stroke-width="3" stroke-linejoin="round">`
    + '<ellipse cx="32" cy="40" rx="13" ry="11"/><ellipse cx="16.5" cy="25" rx="5.2" ry="6.6"/><ellipse cx="26" cy="15.5" rx="5.2" ry="6.8"/>'
    + '<ellipse cx="38" cy="15.5" rx="5.2" ry="6.8"/><ellipse cx="47.5" cy="25" rx="5.2" ry="6.6"/></g>'
    + '<g fill="#FFB8CF"><ellipse cx="32" cy="41" rx="7" ry="5.6"/><circle cx="16.5" cy="26" r="2.4"/><circle cx="26" cy="16.6" r="2.4"/><circle cx="38" cy="16.6" r="2.4"/><circle cx="47.5" cy="26" r="2.4"/></g></svg>';
}

/** Sticker art (WA §5.4 / ON §7.2): a die-cut disc (white 4 px rim) in the sticker colour with an icon inside. */
export function sticker(color, inner) {
  return `<svg class="ico-sticker" viewBox="0 0 88 88" aria-hidden="true"><circle cx="44" cy="44" r="40" fill="#FFFFFF" stroke="${COCOA}" stroke-width="2"/>`
    + `<circle cx="44" cy="44" r="34.5" fill="${color}"/><path d="M22 30a26 26 0 0 1 22-14" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".55"/>`
    + stickerInner(inner) + '</svg>';
}

/**
 * TT5 B: the sticker's inner icon. The icons are whole `<svg>` strings; nested without a size they filled the 88 unit
 * box from (24, 24) and drew off the disc. Give a nested `<svg>` an explicit 40 x 40 box centred on the disc (the inline
 * style beats any class width rule); plain shapes keep the old 24 unit group. Pure.
 * @param {string} inner
 */
export function stickerInner(inner) {
  const s = String(inner ?? '').trim();
  if (!s) return '';
  if (/^<svg[\s>]/i.test(s)) {
    const open = s.slice(0, s.indexOf('>'))
      .replace(/\s(?:x|y|width|height|style|preserveAspectRatio)="[^"]*"/gi, '');
    return `${open} x="24" y="24" width="40" height="40" preserveAspectRatio="xMidYMid meet" style="width:40px;height:40px;overflow:visible">${s.slice(s.indexOf('>') + 1)}`;
  }
  return `<g transform="translate(29 29) scale(1.25)">${s}</g>`;
}

/** A tick in a mint disc (chip success, WA §7.5). */
export function tick() {
  return `<svg class="ico-tick" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#9BE3C4" stroke="${COCOA}" stroke-width="1.8"/><path d="M7 12.4l3.2 3.2L17 8.6" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * TT3 Paw Trick: the Catnip Cloud pouch (TOKENTAILS-PLAN §11.3 #3): a lilac drawstring bag with a mint tie, a catnip
 * sprig peeking out and two little puffs. Pure SVG string.
 */
export function catnipPouch() {
  const g = uid('cp');
  return `<svg class="ico-pouch" viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="${g}" cx=".38" cy=".4" r=".75">`
    + `<stop offset="0" stop-color="${CATNIP_LILAC.hi}"/><stop offset="1" stop-color="${CATNIP_LILAC.lo}"/></radialGradient></defs>`
    + '<path d="M18 9.5c-1.5-3 .5-5.5 2.6-6 1.4 2.4.8 4.6-.8 6.4" fill="#8FE3C0" stroke="#2E7D5B" stroke-width="1.4" stroke-linejoin="round"/>'
    + `<path d="M13.5 13.5c-6 4-8.5 10-7.5 15.5C7.2 35 13 37.5 20 37.5S32.8 35 34 29c1-5.5-1.5-11.5-7.5-15.5Z" fill="url(#${g})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + '<path d="M12.5 12.5q7.5 3.2 15 0" fill="none" stroke="#4E8F5E" stroke-width="3" stroke-linecap="round"/>'
    + '<path d="M11.5 20.5q2.5-2.8 5.2-1.8" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>'
    + `<circle cx="31.5" cy="8" r="3.2" fill="${CATNIP_LILAC.hi}" stroke="${INK}" stroke-width="1.2"/><circle cx="35.5" cy="12.5" r="2" fill="${CATNIP_LILAC.hi}" stroke="${INK}" stroke-width="1.1"/>`
    + `<path d="M17 27.5q3 2.6 6 0" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="24" r="1.3" fill="${INK}"/><circle cx="24" cy="24" r="1.3" fill="${INK}"/>`
    + '</svg>';
}

/** TT3 Paw Trick: the Ribbon Twirl (§11.3 #2): Clem's pink bow with two spin loops. Pure SVG string. */
export function ribbonBow() {
  return '<svg class="ico-ribbon" viewBox="0 0 40 40" aria-hidden="true">'
    + `<path d="M6 13a16 9 0 0 1 28 0" fill="none" stroke="${PINK}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="4 4"/>`
    + `<path d="M9 33a13 6 0 0 0 22 0" fill="none" stroke="${PINK}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 4"/>`
    + `<path d="M20 22 8.5 15.5c-2-1-3.5.4-3.3 2.4l.6 6.2c.2 2 2 3 3.8 2.1Z" fill="${PINK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + `<path d="M20 22l11.5-6.5c2-1 3.5.4 3.3 2.4l-.6 6.2c-.2 2-2 3-3.8 2.1Z" fill="${PINK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="20" cy="22" r="3.6" fill="${PINK_DEEP}" stroke="${INK}" stroke-width="2"/>`
    + '<path d="M9 18.5l3 1.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>'
    + '</svg>';
}
