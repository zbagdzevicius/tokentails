// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/text.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/text.js  (owner: ui) — pure text helpers for every screen (GAME_DESIGN §6.6, §6.8, §14): string lookup with a
// safe fallback, HTML escaping, *emphasis*, device glyphs for the [Key] tokens in tutorial / prompt strings, times,
// hearts, objectives, chapter cards and ranks. Node-safe: no DOM, imports only core/config.js and the pure strings table.
import { LEVEL_IDS, KITTENS_BY_LEVEL, INPUT } from '../core/config.js';
import { S as STORY_STRINGS } from '../stubs/story/strings.js';
import { sword as swordIcon } from './icons.js';
import { glyphHtml, glyphWords, shieldCueHtml, ACTION_LABEL } from '../../../ui/inputGlyph.js';

export { glyphHtml, glyphWords, ACTION_LABEL };

/**
 * UI copy the ui needs that strings.js (story) does not carry yet (requested in requests/ui.md). strings.js wins as
 * soon as it has the key.
 */
export const UI_STRINGS = Object.freeze({
  'hud.riposte': 'Riposte!',
  'menu.quitConfirm': 'Return to the title screen? Your progress up to the last Lantern Stone is kept.',
  'menu.close': 'Close',
  'pause.foundIn': '{region}',
  'pause.kittensCount': '{n}/{max} found',
  'pause.lettersCount': '{n}/{max} found',
  'credits.title': 'Credits',
  'credits.made': 'Made with love for one very small knight.',
  'credits.team': 'Design · Code · Art · Music direction: Token Tails',
  'credits.assets': 'Asset attribution',
  // one source (TOKENTAILS-PLAN §10.4): the Pink Paw line lives in story/strings.js; this fallback reads it from there
  'credits.pinkpaw': STORY_STRINGS['credits.pinkpaw'].default,
  'vigil.swapNone': 'No squires yet. Rescue one!',
  'vigil.active': 'At your side',
  'results.infinite': '∞',
  'loading.hint': 'Loading',
  // ---- M2 hub shops (§13.3–§13.5) and the Quest Board (§12.5). `ui.*` keys are ui-local copy (strings.js may override).
  'ui.shop.barracks': 'Barracks',
  'ui.shop.satchel': 'Bigger Satchel {tier}',
  'ui.shop.satchel.desc': 'Carry {n} tuna snacks.',
  'ui.shop.sharp': 'Sharpness {tier}',
  'ui.shop.sharp.desc': 'All your damage ×{mul}.',
  'ui.shop.quickCharge': 'Quick Charge',
  'ui.shop.quickCharge.desc': 'Charge faster: tiers at {a} s and {b} s.',
  'ui.shop.valorGain': 'Valor Gain',
  'ui.shop.valorGain.desc': '+{p}% on every Valor gain.',
  'ui.shop.waveReach': 'Holy Wave Reach',
  'ui.shop.waveReach.desc': 'Holy Wave reaches {m} m.',
  'ui.shop.confirm': 'Buy?',
  'ui.shop.confirmLong': 'Press again to buy for {n} catnip.',
  'ui.shop.buyHint': 'Costs {n} catnip.',
  'ui.shop.equipHint': 'Yours! Choose to equip it.',
  'ui.shop.equippedNote': 'Equipped. Looking sharp!',
  'ui.shop.maxed': 'Fully upgraded.',
  'ui.shop.bought': 'Bought!',
  'ui.shop.locked': 'Not available yet.',
  'ui.shop.lockedChip': 'Locked',
  'ui.shop.need.kittens': 'Rescue {n} lost kittens to unlock.',
  'ui.shop.need.keep.brutus': 'Beat Sir Brutus to unlock.',
  'ui.shop.need.ending.seen': 'Finish the game to unlock.',
  'ui.shop.need.town.free': 'Free Pawsbury to unlock.',
  'ui.shop.need.memeCam': 'Strike a picture-purrfect pose to unlock.',
  'ui.shop.need.shard2': 'Needs the second Dawnstone shard.',
  'ui.skin.borrowed': 'Borrowed Blade',
  'ui.skin.borrowed.desc': "Marmalade's old sword. Still a bit too big.",
  'ui.skin.twig': 'Training Twig',
  'ui.skin.twig.desc': 'Same reach, same bite. Much more leafy.',
  'ui.skin.fishbone': 'Fishbone Sword',
  'ui.skin.fishbone.desc': 'Lunch, then legend.',
  'ui.skin.baguette': 'Baguette Blade',
  'ui.skin.baguette.desc': 'Crusty on the outside. Brave on the inside.',
  'ui.skin.diamond': 'Diamond Sword',
  'ui.skin.diamond.desc': 'Sparkles for every kitten brought home.',
  'ui.skin.toobig': 'Even More Too Big',
  'ui.skin.toobig.desc': "Sir Brutus's claymore. The tip drags. She doesn't care.",
  'ui.skin.dawnblade': 'Dawnblade',
  'ui.skin.dawnblade.desc': 'The borrowed blade, glowing gold forever.',
  'ui.cape.cream': 'Faded Cream',
  'ui.cape.cream.desc': "Marmalade's old cape. Patched with love.",
  'ui.cape.red': 'Royal Red',
  'ui.cape.red.desc': 'From the Royal Wardrobe. Nothing else fit.',
  'ui.cape.memeWhite': 'Moonlight White',
  'ui.cape.memeWhite.desc': 'For picture-purrfect poses.',
  'ui.cape.blue': 'Order Blue',
  'ui.cape.blue.desc': 'The colour of the old Order.',
  'ui.cape.green': 'Whiskerwood Green',
  'ui.cape.green.desc': 'Smells faintly of pine and cheese.',
  'ui.cape.midnight': 'Midnight',
  'ui.cape.midnight.desc': 'For quiet watches under the stars.',
  'ui.cape.gold': 'Gold',
  'ui.cape.gold.desc': 'The colour of the Golden Hour.',
  'ui.look.missing': '{n} still out there',
  'ui.look.all': 'All home!',
  'ui.board.here': 'You are here',
  'ui.board.new': 'New!',
  'ui.board.replay': 'Replay',
  'ui.board.all': 'Every chapter is cleared. Replay any for catnip!',
  // ---- M2 letters viewer, results bests, settings extras
  'ui.letters.from': 'Found in {region}',
  'ui.letters.none': 'Somewhere out there, a letter waits to be found.',
  'ui.letters.read': 'Read',
  'ui.results.best': 'Best: {time} · {rank}',
  'ui.results.newBest': 'New best time!',
  'ui.results.first': 'First clear!',
  'ui.results.newRank': 'New best rank!',
  'ui.settings.language': 'Language',
  'ui.settings.languageVal': 'English',
  'ui.settings.controls': 'Controls',
  'ui.settings.reset': 'Reset to defaults',
  'ui.settings.resetConfirm': 'Reset every setting to its default?',
  'ui.controls.title': 'Controls',
  // ---- CONTROLS_SPEC §10.1 ability-bar tooltips (title · one-line rule) and §10.7 settings rows
  'bar.guard': 'Shield · Hold to raise your pink paw shield and block. Tap it just as a blow lands to parry. Turns to the nearest threat.',
  'bar.dodge': 'Tumble · A quick roll: nothing can hurt you mid-tumble.',
  'bar.jump': 'Jump · Hop fences and gaps. Attack in the air to Pounce.',
  'bar.ability': 'Kitten power · Tap to cast at the cursor, hold to aim, let go to cast.',
  'bar.golden': 'Golden Hour · At full Valor: the sun is on your side.',
  'bar.milk': 'Snack Break · Heals 2 hearts. Don’t get hit while you munch.',
  'bar.meow': 'Meow · Hidden kittens answer. So do cows.',
  'bar.interact': 'Use · Talk, open, rescue. Lit when something is near.',
  'bar.holy': 'Holy Slash ready: hold Attack until it turns gold.',
  'ui.controls.preset': 'Keyboard and mouse',
  'ui.controls.na': '—',
  // TT3 §11.5 K8: the rebinding screen (keyboard and mouse only)
  'ui.controls.rebindHint': 'Click a key to change it.',
  'ui.controls.press': 'Press a key or mouse button for {action}. Press the Esc key to stop.',
  'ui.controls.refused': '{key} belongs to the browser. Pick another key.',
  'ui.controls.walk': '{key} walks. Pick another key.',
  'ui.controls.swapped': 'Swapped: {other} now uses {key}.',
  'ui.controls.saved': '{action}: {key}',
  'ui.controls.reset': 'Reset keys to default',
  'ui.controls.resetDone': 'Keys back to default.',
  'ui.controls.sticky': 'Tip: on Windows, pressing Shift 5 times may open Sticky Keys. K or the back side button of the mouse also rolls.',
  'pause.controls': 'Controls',
  'ui.tag.tap': 'Tap',
  'ui.touch.edit': 'Edit touch layout',
  'ui.touch.editHint': 'Drag the buttons where your thumbs like them.',
  'ui.touch.done': 'Done',
  'ui.touch.reset': 'Reset',
  'settings.camLock': 'Camera follows her',
  'settings.autoRiposte': 'Hit back after good timing by itself',
  'settings.standAutoFace': 'Shield turns to the hit',
  'settings.hapticTaps': 'Vibrate on button taps',
  'settings.cursorSize': 'Cursor size',
  'settings.cursorContrast': 'High-contrast cursor',
  'settings.pathPreview': 'Show the whole path',
  'ui.boss.crit': 'Crits ×2!',
  // ---- warm adventure phase (WA §4–§8, AUTOCAM §10, PERF I4). strings.js (story) wins as soon as it has the key.
  'settings.camZoom': 'Camera distance',
  'settings.camZoomPortrait': 'Camera distance (portrait)',
  'settings.camLockMode': 'Camera lock',
  'settings.camLockMode.locked': 'Locked',
  'settings.camLockMode.semi': 'Semi (edge pan)',
  'settings.camLockMode.free': 'Free (Y)',
  'settings.camCursorLead': 'Look toward the cursor',
  'settings.biggerHero': 'Bigger hero',
  'settings.hudMode': 'HUD',
  'settings.hudMode.calm': 'Calm',
  'settings.hudMode.full': 'Full',
  'settings.hitWords': 'Hit words (Snip! Snap!)',
  'settings.tutorialHints': 'Tutorial hints',
  'settings.fpsCap': 'Frame rate cap',
  'settings.fpsCap.auto': 'Auto',
  'settings.fpsCap.off': 'Off',
  'settings.batterySaver': 'Battery saver',
  'title.press': 'Press any key to play!',
  'title.tap': 'Tap to play!',
  'title.foot': 'A Token Tails game',
  'title.settings': 'Settings',
  'menu.continue': 'Keep going!',
  'menu.newGame': 'New adventure',
  'menu.stickers': 'Sticker book',
  'ui.stickers.title': 'Sticker book',
  'ui.stickers.count': '{n}/{max} stickers',
  'ui.stickers.none': 'Stickers you earn land here.',
  'hud.boss.bonked': 'BONKED!',
  'life.lost': 'Boing! Back on her paws. {n} lives left',
  'life.lost1': 'Boing! 1 life left. Careful-ish!',
  'life.last': 'Last life! Big brave hops!',
  'offer.kitten.q': 'Want gentler bonks? You can switch anytime.',
  'offer.kitten.yes': 'Yes please',
  'offer.kitten.no': 'I got this',
  'offer.kitten.toast': 'Kitten mode: gentle hits, wider parries.',
  'results.title': 'Hooray! Chapter clear!',
  'results.rank.pawsome': 'PAW-SOME!',
  'results.rank.purrfect': 'PURR-FECT!',
  'results.rank.clawsome': 'CLAW-SOME!',
  'results.rank.mewtiful': 'Good kitty!',
  'sticker.bonk': 'First Bonk!',
  'sticker.bow': 'Pink Bow!',
  'sticker.hop': 'Fence Hopper',
  'sticker.roll': 'Tumble Pro',
  'sticker.stand': 'Stand Strong',
  'sticker.parry': 'Perfect Parry!',
  'sticker.found': 'Found You!',
  'sticker.knight': 'Knight-ish!',
  'sticker.mochi': 'New Friend: Mochi',
  'card.holy.title': 'Holy Slash!',
  'card.holy.line': 'Hold [Attack] till you glow, then let go.',
  'card.golden.title': 'Golden Hour!',
  'card.golden.line': 'Full Valor: everything sparkles. Including you.',
  'card.mochi.title': 'Mochi joined the party!',
  'card.mochi.line': "Shield Wall: tap his portrait and he'll hold the line.",
  'card.sage.title': 'Sage joined!',
  'card.sage.line': 'Swap buddies at any Lantern Stone.',
  'card.clover.title': 'Clover joined!',
  'card.clover.line': "Three's a party.",
  'card.heartbell.title': 'Heart Bell!',
  'card.heartbell.line': 'One more heart. Ding!',
  'card.shard.title': 'Dawnstone shard!',
  'card.shard.line': "It's warm. Like a sunny windowsill.",
  'card.kitten.title': 'Kitten found! {n}/{max}',
  'card.kitten.line.1': 'Off home you go!',
  'card.kitten.line.2': 'Safe and snuggly.',
  'card.kitten.line.3': 'One more for the nap pile.',
  'card.bow.title': 'Pink Bow!',
  'card.bow.line': 'Tied on, just right.',
  'card.knight.title': 'Knight-ish!',
  'card.knight.line': 'Armour on. Mostly.',
});

/** Resolve a strings key through ctx.strings (A4); a missing resolver or key falls back to UI_STRINGS, then the key. */
export function tx(ctx, key, vars = null) {
  if (key == null) return '';
  const s = ctx?.strings;
  // CONTROLS_SPEC §12 ui 3: device-aware copy: `key.touch` / `key.pad` before the base (KBM hybrid) text
  const dev = ctx?.input?.device;
  if ((dev === 'touch' || dev === 'pad') && s?.has?.(`${key}.${dev}`)) return s.t(`${key}.${dev}`, vars);
  if (s?.t && (!s.has || s.has(key))) return s.t(key, vars);
  if (UI_STRINGS[key] != null) return fill(UI_STRINGS[key], vars);
  return fill(String(key), vars);
}

/**
 * E.TOAST payload → shown text. A keyed toast (`textKey ?? key`) resolves device-aware through tx() (CONTROLS_SPEC §12:
 * phones see `.touch`, pads `.pad`), unless the emitter pre-resolved text that differs from the key's base copy (e.g.
 * filled with vars it did not pass along) or the key is not a strings key (LevelKit `zone:blocked`): then `text` wins.
 * @param {object} ctx @param {{ text?: string, key?: string, textKey?: string, vars?: object }} p @returns {string}
 */
export function toastText(ctx, p) {
  if (!p) return '';
  const k = p.textKey ?? p.key, s = ctx?.strings;
  const known = k != null && (s?.has ? s.has(k) : (s?.t != null || UI_STRINGS[k] != null));
  if (known && (p.text == null || p.vars != null || (s?.t && p.text === s.t(k)))) return tx(ctx, k, p.vars ?? null);
  return p.text ?? (k != null ? tx(ctx, k, p.vars ?? null) : '');
}

/** Key or literal text (cutscene `ui` steps pass either). */
export function txt(ctx, keyOrText, vars = null) {
  if (keyOrText == null || keyOrText === false) return '';
  if (typeof keyOrText !== 'string') return String(keyOrText);
  return ctx?.strings?.has?.(keyOrText) ? tx(ctx, keyOrText, vars) : fill(keyOrText, vars);
}

/** `{name}` placeholders from `vars` (unknown placeholders stay). */
export function fill(s, vars) {
  if (!vars || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escape. */
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]); }

/** Escaped HTML with `*emphasis*` → <em>. */
export function rich(s) { return esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }

/**
 * Split text into reveal segments: [{ text, em }]. `*a*` marks emphasis (the asterisks are not revealed).
 * @param {string} s @returns {{text:string, em:boolean}[]}
 */
export function segments(s) {
  const out = [];
  const re = /\*([^*]+)\*/g;
  let last = 0, m;
  const str = String(s ?? '');
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), em: false });
    out.push({ text: m[1], em: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last), em: false });
  return out;
}

/** Visible character count of a segment list. */
export function segLength(segs) { let n = 0; for (const s of segs) n += s.text.length; return n; }

/** HTML for the first `n` visible characters of `segs` (escaped). */
export function revealHtml(segs, n) {
  let left = Math.max(0, n | 0), html = '';
  for (const s of segs) {
    if (left <= 0) break;
    const part = s.text.length <= left ? s.text : s.text.slice(0, left);
    left -= part.length;
    html += s.em ? `<em>${esc(part)}</em>` : esc(part);
  }
  return html;
}

/** Characters revealed after `t` seconds at `cps` × speed (§14.2: 30 chars/s × settings.dialogSpeed). */
export function revealCount(len, t, speed = 1, cps = 30) {
  if (!(len > 0)) return 0;
  return Math.min(len, Math.floor(Math.max(0, t) * cps * Math.max(0.1, speed || 1)));
}

/** Seconds until `len` characters are revealed. */
export function revealDuration(len, speed = 1, cps = 30) { return Math.max(0, len) / (cps * Math.max(0.1, speed || 1)); }

// ------------------------------------------------------------------ device glyphs (§6.6: "glyphs are swapped in by ui")
/** Short label per action and device (§15.1 keyboard, §15.2 gamepad, §15.3 touch). */
export const ACTION_GLYPH = Object.freeze({
  // TOKENTAILS-PLAN §11.2 (TT3) preset `hybrid`: WASD moves, LMB attacks, RMB / Q = the Stand, Space = jump,
  // Shift = Tumble, F = the Paw Trick, G = the kitten, Z / MMB = peek and ranges
  kbm: { attack: 'LMB', guard: 'RMB', dodge: 'Shift', jump: 'Space', interact: 'E', confirm: 'Enter', back: 'Esc', ability: 'G', milk: 'R',
    meow: 'C', golden: 'V', pause: 'Esc', lockon: 'Tab', move: 'WASD', wasd: 'WASD', look: 'Mouse', recenter: 'Home', zoom: 'Wheel', attackMove: 'X',
    stop: 'H', camLock: 'Y', aim: 'Mouse', trick: 'F', trick1: '1', trick2: '2', trick3: '3', sprint: 'hold Shift', peek: 'Z', ranges: 'Z', centre: 'Home' },
  pad: { attack: 'X', guard: 'LB', dodge: 'B', jump: 'A', interact: 'Y', confirm: 'A', back: 'B', ability: 'LT', milk: 'D-pad ↑',
    meow: 'D-pad ↓', golden: 'LB + X', pause: 'Start', lockon: 'R3', move: 'L-stick', wasd: 'L-stick', look: 'R-stick', recenter: 'R3', zoom: 'View', aim: 'R-stick',
    attackMove: '—', stop: '—', camLock: '—', centre: '—', peek: 'L3 (hold)', ranges: 'L3 (hold)', trick: 'RT', trick1: 'RT + ←', trick2: 'RT + →', trick3: 'RT + ↑',
    sprint: 'hold B' },
  touch: { attack: '⚔', guard: 'Stand', dodge: 'Tumble', jump: 'Jump', interact: '!', confirm: 'Tap', back: 'Back', ability: 'Kitten',
    milk: 'Snack', meow: 'Meow', golden: 'Golden', pause: '❚❚', lockon: 'Tap foe', move: 'Stick / tap', wasd: 'Left thumb', look: 'Drag right',
    recenter: 'Tap', zoom: 'Pinch', aim: 'Drag', attackMove: '—', stop: '—', camLock: '—', centre: '—', peek: '—', ranges: '—', trick: ':3',
    trick1: 'Hold :3', trick2: 'Hold :3', trick3: 'Hold :3', sprint: 'Hold Tumble' },
});

/** Semantic glyph tokens (§12 ui 3): resolve through the active bindings / device, never shown as written. */
const SEMANTIC = new Set(['stand', 'tumble', 'jump', 'move', 'attack', 'interact', 'ability', 'milk', 'snack', 'meow', 'golden', 'zoom', 'ls', 'rs', 'rb',
  'trick', 'peek', 'sprint', 'pause', 'skip']);

/** Keyboard token (as written in strings.js) → action. */
export const TOKEN_ACTION = Object.freeze({
  // TT3 §11.2: Space = jump, RMB / Q = the Stand, F = the Paw Trick, G = the kitten, Z = peek
  wasd: 'wasd', mouse: 'look', space: 'jump', shift: 'dodge', rmb: 'guard', lmb: 'attack', j: 'attack', l: 'guard', k: 'dodge', f: 'trick',
  e: 'interact', enter: 'confirm', q: 'guard', g: 'ability', r: 'milk', c: 'meow', v: 'golden', esc: 'pause', p: 'pause', tab: 'lockon', '⚔': 'attack',
  z: 'peek', stand: 'guard', tumble: 'dodge', jump: 'jump', move: 'move', attack: 'attack', interact: 'interact', ability: 'ability', milk: 'milk', snack: 'milk',
  meow: 'meow', golden: 'golden', zoom: 'zoom', ls: 'move', rs: 'aim', rb: 'guard', y: 'camLock', x: 'attackMove', h: 'stop',
  trick: 'trick', peek: 'peek', sprint: 'sprint', pause: 'pause', skip: 'pause', start: 'pause', home: 'centre', r3: 'lockon',
});

/** Short readable label for a KeyboardEvent.code / mouse code (keycaps, the ability-bar corner glyph). Pure. */
export function codeLabel(code) {
  if (!code) return '';
  const m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  const n = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (n) return n[1];
  return ({ Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', Tab: 'Tab',
    Escape: 'Esc', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Bksp', Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'M4', Mouse4: 'M5',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: 'Home' })[code] ?? code;
}

/** Actions whose KBM glyph prefers a mouse button when one is bound (LMB attack, RMB Stand, RMB move). */
const MOUSE_FIRST = new Set(['attack', 'move', 'guard']);

/**
 * The preferred bound code for an action from the active KBM bindings (`input.codesFor`), or null. Pure given the
 * codes: mouse-first actions show their mouse button, every other action its first keyboard key.
 * @param {string} action @param {string[]} codes
 */
export function preferredCode(action, codes) {
  if (!codes?.length) return null;
  if (MOUSE_FIRST.has(action)) return codes.find((c) => c.startsWith('Mouse')) ?? codes[0];
  return codes.find((c) => !c.startsWith('Mouse')) ?? codes[0];
}

/** Actions whose KBM glyph never comes from a binding (they name a gesture, not a key). */
const FIXED_KBM = new Set(['wasd', 'look', 'aim', 'zoom', 'confirm', 'back', 'sprint']);

/**
 * Glyph label for an action on a device ('kbm' | 'pad' | 'touch'). With `input` (the core Input) on KBM the label
 * follows the active preset and rebinding (`input.codesFor`), so presets never need new strings (§12 ui 3).
 */
export function actionGlyph(action, device = 'kbm', input = null) {
  // TT3 §11.3 Ribbon Twirl: the jump key again, held in the air (a row on the controls card, not an action)
  if (action === 'twirl') return `${actionGlyph('jump', device, input)} ×2`;
  if (device === 'kbm' && input?.codesFor && !FIXED_KBM.has(action)) {
    const c = preferredCode(action, input.codesFor(action));
    if (c) return codeLabel(c);
    if (action === 'move') return ACTION_GLYPH.kbm.wasd;      // keyboardOnly: no move click, WASD walks
  }
  const t = ACTION_GLYPH[device] ?? ACTION_GLYPH.kbm;
  return t[action] ?? ACTION_GLYPH.kbm[action] ?? String(action ?? '');
}

/** The KBM preset ids (§6.2), in menu order. */
export const PRESET_IDS = Object.freeze(['hybrid', 'moba', 'diablo', 'mouseOnly', 'keyboardOnly']);

/**
 * KBM glyph for an action under any preset (the controls card previews presets without switching). Pure: the codes
 * are `bindings[action]` ?? the preset's table ?? the base hybrid table (core Input merges them the same way).
 * `move` reads "RMB / WASD" when the preset also walks on WASD.
 * @param {string} action @param {string} preset @param {Record<string,string[]>} [bindings]
 */
export function presetGlyph(action, preset = 'hybrid', bindings = null) {
  const P = INPUT.presets?.[preset] ?? INPUT.presets?.hybrid ?? { keys: {}, wasd: true };
  const codesOf = (a) => bindings?.[a] ?? P.keys?.[a] ?? INPUT.keys?.[a] ?? [];
  if (action === 'move') {
    const c = preferredCode('move', codesOf('move'));
    const parts = [c ? codeLabel(c) : null, P.wasd !== false ? 'WASD' : null].filter(Boolean);
    return parts.join(' / ') || ACTION_GLYPH.kbm.move;
  }
  if (action === 'twirl') return `${presetGlyph('jump', preset, bindings)} ×2`;
  if (action === 'pause') {           // Esc always pauses; the card shows the rebindable key beside it
    const other = codesOf('pause').find((c) => c !== 'Escape' && !c.startsWith('Mouse'));
    return other ? `Esc / ${codeLabel(other)}` : 'Esc';
  }
  return actionGlyph(action, 'kbm', { codesFor: codesOf });
}

/**
 * Inner HTML of a keycap: the touch Attack glyph ⚔ is drawn as the sword icon (TT4: the UI font has no ⚔, so it showed
 * as a tiny "×" in the pink chip), anything else is escaped text.
 * @param {string} label
 */
export function keyCapInner(label) { return label === '⚔' ? `${swordIcon('#FFFFFF')}<span class="ui-key-a11y">⚔</span>` : esc(label); }

/**
 * TT6: the input glyph (icon) HTML for an action on a device, bindings and preset aware: a mouse with the right
 * button lit for the hybrid Shield, a pad bumper, the touch Shield button. `o.label` true adds the plain word.
 * @param {string} action @param {'kbm'|'pad'|'touch'} [device] @param {any} [input] @param {{ label?: boolean|string, cls?: string }} [o]
 */
export function actionGlyphHtml(action, device = 'kbm', input = null, o = {}) {
  return glyphHtml(actionGlyph(action, device, input), device, { action, ps: device === 'pad' && input?.padKind === 'ps', ...o });
}

/** TT6: plain words for an action's input ("right mouse button", "left bumper", "Shield button"). Never "RMB". */
export function actionWords(action, device = 'kbm', input = null) {
  return glyphWords(actionGlyph(action, device, input), device, device === 'pad' && input?.padKind === 'ps');
}

/** TT6: semantic tokens that get their plain word beside the icon ("Hold [Stand]" → "Hold [mouse] Shield"). */
const INLINE_WORD = new Set(['guard', 'attack', 'dodge', 'jump', 'interact', 'ability', 'golden', 'trick', 'milk']);

/**
 * The label a `[token]` resolves to on `device`, and its action (null for an unknown token). Pure.
 * @returns {{ label: string, act: string|null, sem: boolean }}
 */
export function tokenLabel(inner, device = 'kbm', input = null) {
  const head = String(inner ?? '').trim().split(/\s+/)[0];
  const act = TOKEN_ACTION[head.toLowerCase()] ?? null;
  const sem = SEMANTIC.has(head.toLowerCase());
  // semantic tokens ([Stand], [Attack] …) always resolve; a literal keyboard token ([Space]) resolves through the
  // bindings only when the preset / rebinding moved that action off the written key
  let label = head;
  if (act) {
    if (device !== 'kbm' || sem || act === 'attack') label = actionGlyph(act, device, input);
    else if (input?.codesFor && !FIXED_KBM.has(act)) {
      const codes = input.codesFor(act);
      if (codes.length && !codes.some((c) => codeLabel(c).toLowerCase() === head.toLowerCase())) label = actionGlyph(act, device, input);
    }
  }
  return { label, act, sem };
}

/** One `[token]` → glyph HTML for `device` (TT6 icons; `plain` = the sentence without tokens, for the word rule). */
function tokenHtml(inner, device, input, plain = '') {
  const parts = inner.split(/\s+/);
  const head = parts[0], rest = parts.slice(1).join(' ');
  if (head.toLowerCase() === 'shieldcue') return shieldCueHtml() + (rest ? `<span class="ui-key-x">${esc(rest)}</span>` : '');
  const { label, act, sem } = tokenLabel(inner, device, input);
  const word = act && sem && INLINE_WORD.has(act) && !plain.toLowerCase().includes(String(ACTION_LABEL[act] ?? '').toLowerCase());
  const html = glyphHtml(label, device, { action: act ?? undefined, label: word ? ACTION_LABEL[act] : null, ps: device === 'pad' && input?.padKind === 'ps' });
  return `${html}${rest ? `<span class="ui-key-x">${esc(rest)}</span>` : ''}`;
}

/**
 * Tutorial / prompt text → HTML with device glyphs (TT6 icons): `[Stand]` becomes a mouse with the right button lit
 * plus "Shield" (a bumper on a pad, the Shield button on touch), `[Space]` a keycap, `[ShieldCue]` the gold "!" shield the
 * player sees over a foe, a bare ⚔ / 🛡 the attack / Shield glyph, `*x*` emphasis. Everything else is escaped.
 * @param {string} text @param {'kbm'|'pad'|'touch'} [device]
 */
export function glyphify(text, device = 'kbm', input = null) {
  const str = String(text ?? '');
  const plain = str.replace(/\[[^\]]+\]/g, ' ');
  let out = '', last = 0;
  const re = /\[([^\]]+)\]/g;
  let m;
  let prev = null, prevEnd = -1;
  while ((m = re.exec(str))) {
    const gap = str.slice(last, m.index);
    const html = tokenHtml(m[1].trim(), device, input, plain);
    // "[Esc] or [P]" on a pad is the same button twice: show it once (TT6)
    if (prev === html && prevEnd === last && /^\s*(?:or|\/)\s*$/.test(gap)) { last = m.index + m[0].length; prevEnd = last; continue; }
    // a full stop or "!" right after a glyph stays on its line and sits close (it read "snack (R) ." before)
    const end = m.index + m[0].length, punct = /^[.,!?:;]+/.exec(str.slice(end))?.[0] ?? '';
    out += plainGlyphs(gap, device, input) + (punct ? `<span class="ig-nb">${html}${esc(punct)}</span>` : html);
    prev = html; last = end + punct.length; prevEnd = last;
  }
  out += plainGlyphs(str.slice(last), device, input);
  return out;
}

/** Text with `[tokens]` → plain words for text-only places ("Hold right mouse button to skip"). Pure. */
export function glyphText(text, device = 'kbm', input = null) {
  return String(text ?? '').replace(/\[([^\]]+)\]/g, (m, inner) => {
    if (inner.trim().toLowerCase() === 'shieldcue') return 'the gold shield';
    const { label, act } = tokenLabel(inner, device, input);
    return act ? glyphWords(label, device, device === 'pad' && input?.padKind === 'ps') : inner;
  }).replace(/⚔/g, () => actionWords('attack', device, input)).replace(/🛡/g, () => actionWords('guard', device, input));
}

function plainGlyphs(s, device, input) {
  return rich(s).replace(/⚔/g, () => actionGlyphHtml('attack', device, input)).replace(/🛡/g, () => actionGlyphHtml('guard', device, input));
}

// ------------------------------------------------------------------ numbers
/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(+sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** Hearts for the HUD: one entry per heart (2 HP each): 'full' | 'half' | 'empty'. */
export function heartStates(hp, maxHp) {
  const n = Math.max(0, Math.ceil((+maxHp || 0) / 2));
  const v = Math.max(0, Math.min(+hp || 0, n * 2));
  const out = new Array(n);
  for (let i = 0; i < n; i++) { const left = v - i * 2; out[i] = left >= 2 ? 'full' : left >= 1 ? 'half' : 'empty'; }
  return out;
}

/** 0..1 fraction (safe). */
export function frac(v, max) { return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0; }

/** Objective line text: `textKey` with {n, value, max, p} filled (§6.6 obj.*). */
export function objectiveText(ctx, p) {
  if (!p) return '';
  const max = p.max ?? 0, value = p.value ?? 0;
  const vars = { n: Math.floor(value), value: Math.floor(value), max, p: Math.round(frac(value, max) * 100) };
  return p.textKey ? tx(ctx, p.textKey, vars) : '';
}

// ------------------------------------------------------------------ chapters, regions, ranks
/** Level → chapter number (§4.2: the prologue and Ch. 1 share `meadow`). */
export const LEVEL_CHAPTER = Object.freeze({ meadow: 1, forest: 2, town: 3, gate: 4, bog: 5, keep: 6 });

/**
 * Chapter card text. `chapter`: a number, 'prologue' / 'epilogue', a level id, or `{ n | id, title, region, level }`.
 * @returns {{ label: string, title: string, region: string }}
 */
export function chapterInfo(ctx, chapter, levelId = null) {
  let n = chapter, title = null, region = null, level = levelId;
  let label = null;
  if (chapter && typeof chapter === 'object') {
    n = chapter.n ?? chapter.id ?? chapter.chapter; title = chapter.title ?? null; region = chapter.region ?? null;
    level = chapter.level ?? level; label = chapter.label ?? null;
  }
  if (typeof n === 'string' && LEVEL_CHAPTER[n]) { level = level ?? n; n = LEVEL_CHAPTER[n]; }
  if (typeof n === 'string' && /^\d+$/.test(n)) n = +n;
  const special = n === 'prologue' || n === 'epilogue';
  if (label == null) label = special ? tx(ctx, `ch.label.${n}`) : tx(ctx, 'ch.label', { n });
  if (!level && typeof n === 'number') level = LEVEL_IDS[n - 1] ?? null;
  if (n === 'prologue' && !level) level = 'meadow';
  return {
    label,
    title: title != null ? txt(ctx, title) : tx(ctx, `ch.${n}`),
    region: region != null ? txt(ctx, region) : (level ? tx(ctx, `region.${level}`) : ''),
  };
}

/** Rank id → strings key (§6.8 results.ranks). */
/** WA §4.4: four warm rank words (no letter grades). Ids are save data (`bestRank`): `mewtiful` reads "Good kitty!". */
export const RANK_KEYS = Object.freeze({ pawsome: 'results.rank.pawsome', purrfect: 'results.rank.purrfect', clawsome: 'results.rank.clawsome', mewtiful: 'results.rank.mewtiful' });

/** Rank ids from worst to best (records compare by this order). */
export const RANK_ORDER = Object.freeze(['mewtiful', 'clawsome', 'purrfect', 'pawsome']);

/**
 * §6.8 + WA §4.4: rank by lives lost in the level (works on every difficulty): ≤ 1 PAW-SOME!, ≤ 3 PURR-FECT!,
 * ≤ 5 CLAW-SOME!, else Good kitty! (world's own rankFor still sends three ids; any of the four displays).
 */
export function rankFor(livesLost) {
  const l = Math.max(0, livesLost | 0);
  return l <= 1 ? 'pawsome' : l <= 3 ? 'purrfect' : l <= 5 ? 'clawsome' : 'mewtiful';
}

/** Kittens found in `levelId` out of its 3 (§12.1). */
export function levelKittens(state, levelId) {
  const mine = KITTENS_BY_LEVEL[levelId] ?? [];
  const have = state?.kittens ?? [];
  let n = 0;
  for (const k of mine) if (have.includes(k)) n++;
  return { n, max: mine.length };
}

/** The Lost Letter id of a level (§6.7: one per level, 'l1'..'l6' in level order). */
export function levelLetterId(levelId) {
  const i = LEVEL_IDS.indexOf(levelId);
  return i >= 0 ? `l${i + 1}` : null;
}

/** 'memeWhite' → 'Meme White' (id → words; display names come from strings). */
export function titleCase(id) {
  return String(id ?? '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
