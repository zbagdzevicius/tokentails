// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/settings.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/settings.js  (owner: ui) — the Settings screen schema (GAME_DESIGN §14.3 + §14.4 accessibility) and the pure
// helpers that step / format / apply a value. Writing a setting = state.settings[key] = v, then `settings:changed
// {key, value}` (save autosaves, core re-applies quality, audio re-reads volumes). Difficulty lives in
// state.difficulty (not settings) and announces itself with the same event (the player re-reads its lives rules).
// Node-safe: no DOM.
import { E } from '../core/events.js';
import { DIFFICULTY, INPUT } from '../core/config.js';

/**
 * @typedef {object} SettingDef
 * @property {string} key       state.settings key (or 'difficulty')
 * @property {'slider'|'toggle'|'choice'} type
 * @property {string} label     strings key
 * @property {string} group     section heading id
 * @property {number} [min] @property {number} [max] @property {number} [step]
 * @property {(number|string)[]} [options]  choice values
 * @property {string[]} [optionLabels]      strings keys or literal labels per option
 * @property {'pct'|'mul'|'speed'} [fmt]
 * @property {string[]} [onOff]  toggle labels [off, on] (strings keys or literal)
 * @property {'classic'|'iso'} [cam]  only shown under that camera (CONTROLS_SPEC §10.7: invertY is classic-only)
 * @property {Dev|Dev[]} [dev]  only shown while the last-used input device is one of these (rows that do nothing on
 *   the current device are hidden: no cursor / edge-pan rows on a phone, no touch-button rows at a desk)
 * @property {Dev|Dev[]} [isoDev]  like `dev`, but only applied under the iso camera (look sensitivity: iso has no
 *   mouse / touch look, only the pad's right-stick nudge; classic keeps it for every device)
 */
/** @typedef {'kbm'|'touch'|'pad'} Dev */

/** @type {SettingDef[]} */
export const SETTINGS = Object.freeze([
  { key: 'master', type: 'slider', label: 'settings.master', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'music', type: 'slider', label: 'settings.music', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'sfx', type: 'slider', label: 'settings.sfx', group: 'audio', min: 0, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'invertY', type: 'toggle', label: 'settings.invertY', group: 'controls', cam: 'classic' },
  { key: 'sensitivity', type: 'slider', label: 'settings.sensitivity', group: 'controls', isoDev: 'pad', min: 0.25, max: 2.5, step: 0.05, fmt: 'mul' },
  { key: 'holdStand', type: 'toggle', label: 'settings.holdStand', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'holdCharge', type: 'toggle', label: 'settings.holdCharge', group: 'controls', onOff: ['Toggle', 'Hold'] },
  { key: 'autoStand', type: 'toggle', label: 'settings.autoStand', group: 'controls' },
  // CONTROLS_SPEC §10.7: the iso controls
  { key: 'controlPreset', type: 'choice', label: 'settings.controlPreset', group: 'controls', dev: 'kbm', options: ['hybrid', 'moba', 'diablo', 'mouseOnly', 'keyboardOnly'],
    optionLabels: ['Standard', 'Right-click moves', 'Left-click moves', 'Mouse only', 'Keyboard only'] },   // TT6: plain names, no genre jargon
  // AUTOCAM §10.3 / §10.4 / §12 camera rows (IMPLEMENTATION_PLAN §7.4; camLockMode replaces the camLock toggle, X19)
  { key: 'camZoom', type: 'slider', label: 'settings.camZoom', group: 'camera', min: 0.7, max: 1.4, step: 0.05, fmt: 'mul' },
  { key: 'camZoomPortrait', type: 'slider', label: 'settings.camZoomPortrait', group: 'camera', cam: 'iso', dev: 'touch', min: 0.7, max: 1.4, step: 0.05, fmt: 'mul' },
  { key: 'camLockMode', type: 'choice', label: 'settings.camLockMode', group: 'camera', cam: 'iso', dev: 'kbm', options: ['locked', 'semi', 'free'],
    optionLabels: ['settings.camLockMode.locked', 'settings.camLockMode.semi', 'settings.camLockMode.free'] },
  { key: 'camCursorLead', type: 'slider', label: 'settings.camCursorLead', group: 'camera', cam: 'iso', dev: 'kbm', min: 0, max: 0.15, step: 0.05, fmt: 'pct' },
  { key: 'biggerHero', type: 'toggle', label: 'settings.biggerHero', group: 'camera', cam: 'iso' },
  { key: 'autoAttack', type: 'choice', label: 'settings.autoAttack', group: 'controls', options: ['auto', 'chain', 'loop', 'off'], optionLabels: ['Auto', 'One combo', 'Keep going', 'Off'] },
  { key: 'castMode', type: 'choice', label: 'settings.castMode', group: 'controls', options: ['smart', 'indicator', 'dragOnly'], optionLabels: ['Smart', 'Show first', 'Drag only'] },
  { key: 'autoRiposte', type: 'choice', label: 'settings.autoRiposte', group: 'controls', options: ['auto', 'on', 'off'], optionLabels: ['Auto', 'On', 'Off'] },
  { key: 'standAutoFace', type: 'toggle', label: 'settings.standAutoFace', group: 'controls' },
  // WA §3.6: 'auto' = the whole path on touch during the prologue + Chapter 1 (fx pathPreviewOn); requests/ui.md
  { key: 'pathPreview', type: 'choice', label: 'settings.pathPreview', group: 'controls', options: ['auto', 'on', 'off'],
    optionLabels: ['settings.quality.auto', 'settings.on', 'settings.off'] },
  { key: 'edgePanSpeed', type: 'slider', label: 'settings.edgePanSpeed', group: 'camera', cam: 'iso', dev: 'kbm', min: 0.5, max: 2, step: 0.25, fmt: 'mul' },
  { key: 'touchSize', type: 'choice', label: 'settings.touchSize', group: 'controls', dev: 'touch', options: [0.8, 1, 1.2, 1.4], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'tapToMove', type: 'toggle', label: 'settings.tapToMove', group: 'controls', dev: 'touch' },
  { key: 'swipeTumble', type: 'toggle', label: 'settings.swipeTumble', group: 'controls', dev: 'touch' },
  { key: 'leftHanded', type: 'toggle', label: 'settings.leftHanded', group: 'controls', dev: 'touch' },
  { key: 'buttonOpacity', type: 'slider', label: 'settings.buttonOpacity', group: 'controls', dev: 'touch', min: 0.4, max: 1, step: 0.05, fmt: 'pct' },
  { key: 'haptics', type: 'choice', label: 'settings.haptics', group: 'controls', dev: ['touch', 'pad'], options: [0, 0.5, 1], optionLabels: ['Off', 'Soft', 'On'] },
  { key: 'hapticTaps', type: 'toggle', label: 'settings.hapticTaps', group: 'controls', dev: 'touch' },
  { key: 'difficulty', type: 'choice', label: 'settings.difficulty', group: 'game', options: ['kitten', 'knight'], optionLabels: ['difficulty.kitten', 'difficulty.knight'] },
  // WA §4.1 / §5.3 / §7.5
  { key: 'hudMode', type: 'choice', label: 'settings.hudMode', group: 'game', options: ['calm', 'full'], optionLabels: ['settings.hudMode.calm', 'settings.hudMode.full'] },
  // TOKENTAILS-PLAN §10.2 item 11: off hides the paw prints but keeps the edge arrow and the objective line
  { key: 'guideTrail', type: 'toggle', label: 'settings.guideTrail', group: 'game' },
  { key: 'hitWords', type: 'toggle', label: 'settings.hitWords', group: 'game' },
  { key: 'tutorialHints', type: 'toggle', label: 'settings.tutorialHints', group: 'game' },
  // PERF I4: the quality panel (Low / Med / High / Auto, the FPS cap, Battery saver)
  { key: 'quality', type: 'choice', label: 'settings.quality', group: 'perf', options: ['auto', 'low', 'med', 'high'],
    optionLabels: ['settings.quality.auto', 'settings.quality.low', 'settings.quality.med', 'settings.quality.high'] },
  { key: 'fpsCap', type: 'choice', label: 'settings.fpsCap', group: 'perf', options: ['auto', 30, 60, 'off'], optionLabels: ['settings.fpsCap.auto', '30', '60', 'settings.fpsCap.off'] },
  { key: 'batterySaver', type: 'toggle', label: 'settings.batterySaver', group: 'perf' },
  { key: 'shake', type: 'slider', label: 'settings.shake', group: 'access', min: 0, max: 1, step: 0.1, fmt: 'pct' },
  { key: 'reduceCameraMotion', type: 'toggle', label: 'settings.reduceCameraMotion', group: 'access' },
  { key: 'parryRing', type: 'choice', label: 'settings.parryRing', group: 'access', options: ['auto', 'on', 'off'], optionLabels: ['Auto', 'On', 'Off'] },
  { key: 'cursorSize', type: 'choice', label: 'settings.cursorSize', group: 'access', dev: 'kbm', options: [1, 1.5, 2], optionLabels: ['×1', '×1.5', '×2'] },
  { key: 'cursorContrast', type: 'toggle', label: 'settings.cursorContrast', group: 'access', dev: 'kbm' },
  { key: 'reduceFlashes', type: 'toggle', label: 'settings.reduceFlashes', group: 'access' },
  { key: 'patterns', type: 'toggle', label: 'settings.patterns', group: 'access' },
  { key: 'subtitleSize', type: 'choice', label: 'settings.subtitleSize', group: 'access', options: [0.85, 1, 1.25, 1.5], optionLabels: ['S', 'M', 'L', 'XL'] },
  { key: 'dialogSpeed', type: 'choice', label: 'settings.dialogSpeed', group: 'access', options: [0.5, 0.75, 1, 1.5, 2, 4], fmt: 'speed' },
]);

/** Section headings (literal; menus are English-only until localisation [STRETCH]). */
export const SETTING_GROUPS = Object.freeze({ audio: 'Sound', controls: 'Controls', camera: 'Camera', game: 'Game', perf: 'Performance', access: 'Accessibility' });

export const SETTING_BY_KEY = Object.freeze(Object.fromEntries(SETTINGS.map((d) => [d.key, d])));

const round = (v, step) => Math.round(v / step) * step;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const devIn = (list, d) => (Array.isArray(list) ? list.includes(d) : list === d);

/**
 * Is the row shown under the current camera and input device? (`cam: 'classic'` rows only with ?cam=classic, `'iso'`
 * only in iso; `dev` / `isoDev` rows only on those devices.) `device` omitted / null = no device filter.
 * @param {SettingDef} def @param {boolean} [iso] @param {Dev|null} [device]
 */
export function settingVisible(def, iso = true, device = null) {
  if (def.cam === 'classic' && iso) return false;
  if (def.cam === 'iso' && !iso) return false;
  if (device) {
    if (def.dev && !devIn(def.dev, device)) return false;
    if (iso && def.isoDev && !devIn(def.isoDev, device)) return false;
  }
  return true;
}

/**
 * The rows to show, in display order, grouped (one header per group). On touch the Controls group comes first and its
 * touch rows lead it (CONTROLS_SPEC §9: a phone player opens Settings to resize / move buttons, not to scroll past
 * Sound). Pure.
 * @param {boolean} [iso] @param {Dev|null} [device]
 * @returns {SettingDef[]}
 */
export function visibleSettings(iso = true, device = null) {
  const rows = SETTINGS.filter((d) => settingVisible(d, iso, device));
  const order = device === 'touch' ? GROUP_ORDER_TOUCH : GROUP_ORDER;
  const rank = (d) => {
    const g = order.indexOf(d.group);
    return (g < 0 ? order.length : g) * 2 + (device === 'touch' && d.group === 'controls' && !devIn(d.dev, 'touch') ? 1 : 0);
  };
  return rows.map((d, i) => [d, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

/** Group display order (one header per group); on touch Controls (touch rows first) and Camera lead. */
const GROUP_ORDER = ['audio', 'controls', 'camera', 'game', 'perf', 'access'];
const GROUP_ORDER_TOUCH = ['controls', 'camera', 'audio', 'game', 'perf', 'access'];

/** Current value of a setting (difficulty from state.difficulty). */
export function readSetting(state, key) {
  if (key === 'difficulty') return state?.difficulty ?? 'knight';
  return state?.settings?.[key];
}

/** Is the setting locked? (§7.9: Nine Lives is fixed for the save, so difficulty can't change.) */
export function settingLocked(state, key) { return key === 'difficulty' && state?.difficulty === 'nine'; }

/**
 * Next value after one step `dir` (−1 / +1; toggles flip on any non-zero dir). Pure.
 * @param {SettingDef} def @param {any} value @param {number} dir
 */
export function stepSetting(def, value, dir) {
  if (!def || !dir) return value;
  if (def.type === 'toggle') return !value;
  if (def.type === 'slider') {
    const v = typeof value === 'number' ? value : def.min;
    return +clamp(round(v + Math.sign(dir) * def.step, def.step), def.min, def.max).toFixed(4);
  }
  const opts = def.options ?? [];
  if (!opts.length) return value;
  let i = opts.indexOf(value);
  if (i < 0) i = nearestIndex(opts, value);
  i = clamp(i + Math.sign(dir), 0, opts.length - 1);
  return opts[i];
}

/** Slider value from a 0..1 track position (pointer drags). Pure. */
export function sliderFromFrac(def, f) {
  const v = def.min + clamp(f, 0, 1) * (def.max - def.min);
  return +clamp(round(v, def.step), def.min, def.max).toFixed(4);
}

/** 0..1 track position of a slider value. Pure. */
export function sliderFrac(def, v) { return def.max > def.min ? clamp(((+v || 0) - def.min) / (def.max - def.min), 0, 1) : 0; }

function nearestIndex(opts, v) {
  if (typeof v !== 'number') return 0;
  let best = 0, bd = Infinity;
  opts.forEach((o, i) => { const d = Math.abs(o - v); if (d < bd) { bd = d; best = i; } });
  return best;
}

/**
 * Display text for a value. `t(key)` resolves strings keys (literal labels pass through).
 * @param {SettingDef} def @param {any} v @param {(k:string)=>string} [t]
 */
export function formatSetting(def, v, t = (k) => k) {
  const lab = (k) => { const s = t(k); return s ?? k; };
  if (def.type === 'toggle') {
    if (def.onOff) return v ? def.onOff[1] : def.onOff[0];
    return v ? lab('settings.on') : lab('settings.off');
  }
  if (def.type === 'slider') {
    if (def.fmt === 'pct') return `${Math.round((+v || 0) * 100)}%`;
    if (def.fmt === 'mul') return `×${(+v || 0).toFixed(2)}`;
    return String(v);
  }
  const i = (def.options ?? []).indexOf(v);
  if (def.optionLabels && i >= 0) return lab(def.optionLabels[i]);
  if (def.fmt === 'speed') return `×${v}`;
  return String(v ?? '');
}

/**
 * Write a setting and announce it (`settings:changed {key, value}`). Returns the stored value. Validates difficulty
 * against Appendix A and refuses to leave Nine Lives (§7.9).
 */
export function applySetting(ctx, key, value) {
  const st = ctx?.state;
  if (!st) return value;
  if (key === 'difficulty') {
    if (!DIFFICULTY[value] || settingLocked(st, key)) return st.difficulty;
    st.difficulty = value;
  } else {
    st.settings ??= {};
    st.settings[key] = value;
    // K7: the retired boolean camLock stays in sync with camLockMode until its readers move
    if (key === 'camLockMode' && 'camLock' in st.settings) st.settings.camLock = value === 'locked';
  }
  ctx.bus?.emit(E.SETTINGS_CHANGED, { key, value });
  return value;
}

/**
 * Reset every §14.3 setting to the §19.7 defaults (difficulty is a save property, not a setting: kept). Writes each
 * changed key through applySetting so audio / core / save react. Returns the keys that changed.
 */
export function resetSettings(ctx, defaults) {
  const st = ctx?.state;
  if (!st || !defaults) return [];
  const changed = [];
  for (const def of SETTINGS) {
    if (def.key === 'difficulty' || !(def.key in defaults)) continue;
    if (st.settings?.[def.key] !== defaults[def.key]) { applySetting(ctx, def.key, defaults[def.key]); changed.push(def.key); }
  }
  return changed;
}

/**
 * The Controls card (CONTROLS_SPEC §6.2–§6.4, TOKENTAILS-PLAN §11.2): [action, label] rows; glyphs come from text.js per
 * device (the KBM column follows the previewed preset). The label shown is strings key `controls.<action>` when
 * strings carries it (menus.js controlLabel); the label here is the built-in fallback.
 */
export const CONTROL_ROWS = Object.freeze([
  ['move', 'Move'], ['attack', 'Attack · hold to charge'], ['guard', 'Shield · tap just in time to bounce hits back'],
  ['jump', 'Jump · Attack in the air: Pounce'], ['dodge', 'Roll · hold to sprint'], ['interact', 'Use · talk, open'],
  ['trick', 'Paw Trick · tap to cast, hold to aim'], ['trick1', 'Pick Paw Trick 1'], ['trick2', 'Pick Paw Trick 2'], ['trick3', 'Pick Paw Trick 3'],
  ['twirl', 'Ribbon Twirl · jump again in the air, hold'],
  ['ability', 'Kitten power'], ['milk', 'Snack Break'], ['meow', 'Meow'], ['golden', 'Golden Hour · or Shield + Attack'],
  ['lockon', 'Pick a foe · press again for the next'], ['attackMove', 'Walk there, fight on the way'], ['stop', 'Stop'], ['zoom', 'Zoom'], ['camLock', 'Camera lock'],
  ['peek', 'Look ahead · show how far foes reach'], ['pause', 'Pause · hold to skip scenes'],
]);

/**
 * TT6 fix round: row labels in the words of the device in use (touch players never read "click"). Rows not listed
 * here use CONTROL_ROWS. Pure. @param {string} act @param {string} label @param {Dev} dev
 */
export function controlRowLabel(act, label, dev) {
  if (act === 'attack') return dev === 'kbm' ? 'Attack · hold to charge · click a foe' : dev === 'touch' ? 'Attack · hold to charge · tap a foe' : label;
  return label;
}

// ------------------------------------------------------------------ TT3 §11.5 K8: keyboard and mouse rebinding
/** The actions the Controls card can rebind (keyboard and mouse only; the pad keeps the standard layout). */
export const REBIND_ACTIONS = Object.freeze(['attack', 'guard', 'jump', 'dodge', 'interact', 'trick', 'ability', 'milk', 'meow',
  'golden', 'peek', 'lockon', 'pause']);
/** Actions that always share the codes of another (one hold): `ranges` follows `peek`. */
const LINKED = Object.freeze({ peek: ['ranges'] });
/** Actions a rebind never swaps into (menu navigation and fixed keys). */
const NO_SWAP = new Set(['navUp', 'navDown', 'navLeft', 'navRight', 'confirm', 'back', 'ranges', 'sprint']);

/**
 * Why `code` cannot be bound, or null. 'browser': Ctrl, Alt, Meta, an F-key or Esc (browser and system shortcuts;
 * Esc always pauses); 'walk': a walking key while the preset walks on WASD / arrows. Pure.
 * @param {string} code @param {{ wasd?: boolean }} [o]
 */
export function rebindRefusal(code, { wasd = true } = {}) {
  if (typeof code !== 'string' || !code) return 'browser';
  if (code === 'Escape' || INPUT.unbindable?.test(code)) return 'browser';
  if (wasd && Object.values(INPUT.move).flat().includes(code)) return 'walk';
  return null;
}

/** The code an action shows on the card (mouse first for attack / guard / move, else the first key). Pure. */
export function shownCode(action, codes) {
  if (!codes?.length) return null;
  const mouseFirst = action === 'attack' || action === 'guard' || action === 'move';
  if (mouseFirst) return codes.find((c) => c.startsWith('Mouse')) ?? codes[0];
  // Esc is never the one replaced (it always pauses): Pause shows and rebinds its other key (P)
  return codes.find((c) => !c.startsWith('Mouse') && c !== 'Escape') ?? codes.find((c) => c !== 'Escape') ?? codes[0];
}

/**
 * Rebind `action` to `code`: the code the card shows for it is replaced by `code` (its other codes stay); any other
 * action that used `code` gets the replaced code instead (a swap), or loses `code` when it has nothing to take. Returns
 * the new `settings.bindings` object (a fresh copy) and the swapped action ids. `table` is the active effective
 * table (`input.keyTable`: preset + bindings). Pure.
 * @param {Record<string,string[]>} table @param {Record<string,string[]>|null} bindings @param {string} action @param {string} code
 * @returns {{ bindings: Record<string,string[]>, swapped: string[] }}
 */
export function rebindAction(table, bindings, action, code) {
  const out = {};
  for (const [a, c] of Object.entries(bindings ?? {})) if (Array.isArray(c)) out[a] = c.slice();
  const cur = (table?.[action] ?? []).slice();
  const old = shownCode(action, cur);
  let next = old ? cur.map((c) => (c === old ? code : c)) : [code, ...cur];
  next = next.filter((c, i) => next.indexOf(c) === i);
  next.sort((a, b) => (a === code ? -1 : b === code ? 1 : 0));
  out[action] = next;
  const linked = LINKED[action] ?? [];
  for (const l of linked) out[l] = next.slice();
  const swapped = [];
  for (const [a, codes] of Object.entries(table ?? {})) {
    if (a === action || linked.includes(a) || NO_SWAP.has(a) || !codes?.includes(code)) continue;
    const give = old && old !== code && !codes.includes(old);
    out[a] = codes.map((c) => (c === code ? (give ? old : null) : c)).filter(Boolean);
    for (const l of LINKED[a] ?? []) out[l] = out[a].slice();
    swapped.push(a);
  }
  return { bindings: out, swapped };
}
