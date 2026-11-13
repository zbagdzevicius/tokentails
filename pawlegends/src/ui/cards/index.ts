/**
 * Champion card art in the match and the menus (stable API; import from 'ui/cards/index', since 'ui/cards' alone resolves to ui/cards.ts):
 *
 * - `cardReveal(parent, { hero, portrait?, tier?, anchor?, ribbon?, delayMs?, holdMs?, burst?, size? })` → handle
 *   `{ el, flip(), dispose(), done }`: a face-down card that flips up with a sparkle flash. DOM only.
 * - `RespawnCard`: the HUD's face-down countdown card (`down(secs)`, `reveal()`, `hide()`, `dispose()`).
 * - `heroCard(hero, opts)`, `cardFrame(opts)`, `flipCard(front)`, `cardBack()`: HTML builders.
 * - `attachCardTilt(root)`: pointer-follow foil and tilt for `.tt-card.foil-hover` under `root`.
 * - `heroElement(hero)`, `cardUrl(path)`, `elBg(el)`, `fxUrl(name)`, `preloadCardArt(urls)`, the element colours.
 * - `showVsIntro(...)` lives in `./vs` (its own lazy chunk: `import('../ui/cards/vs')`).
 */
export { CARD_ACCENT, CARD_BORDER, CARD_GRADIENT, TIER_GLOW, TIER_NAME, cardAttrs, cardUrl, cardVars, elBg, elIcon, fxUrl, heroElement, preloadCardArt, tierPattern, type CardElement, type CardTier } from './art';
export { cardFrame, type CardFrameOpts } from './frame';
export { attachCardTilt } from './tilt';
export { cardBack, flipCard, heroCard, heroPic, type HeroCardOpts } from './hero';
export { REVEAL_MS, RespawnCard, cardReveal, type CardRevealHandle, type CardRevealOpts } from './reveal';
