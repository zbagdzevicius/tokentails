// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/inputGlyph.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/inputGlyph.js  (owner: ui) — TT6 input glyphs: no player ever has to decode "RMB", "LMB" or "LB".
// Every input is drawn as an icon for the device the player is using (input.device, the last one touched):
//   keyboard and mouse  a mouse with the left / right / middle button lit, a side button, the wheel; keycaps for keys
//                       (the letters printed on the key: Q, E, Space, Shift, Esc); a 2 × 2 WASD cluster
//   gamepad             coloured face buttons (Xbox A B X Y, or the PlayStation shapes when `input.padKind` is 'ps'),
//                       bumper and trigger shapes, sticks, a D-pad with the pressed arm lit, View and Start
//   touch               the very icon of the on-screen button (sword, Pink Paw shield, roll, jump, kitten, snack, meow,
//                       "!", sun, ":3" coin, pause) in a mini round button, plus tap / drag / pinch / joystick gestures
// Each glyph is inline SVG (or a keycap) with role="img", an aria-label and a title in plain words ("Right mouse
// button"), a hidden plain-words copy for text-only readers, and `data-glyph` (an abstract id tests can check).
// Bindings are unchanged: labels still come from text.js (actionGlyph / presetGlyph / codeLabel); only how they are
// shown changes. Pure strings (node-safe).
import * as I from '../render/ppk/ui/icons.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Plain words per action (labels next to a glyph, aria text). One table. */
export const ACTION_LABEL = Object.freeze({
  attack: 'Attack', guard: 'Shield', dodge: 'Roll', jump: 'Jump', interact: 'Use', confirm: 'OK', back: 'Back',
  ability: 'Kitten power', milk: 'Snack', meow: 'Meow', golden: 'Golden Hour', pause: 'Pause', lockon: 'Pick target',
  move: 'Move', wasd: 'Move', look: 'Look', aim: 'Aim', recenter: 'Center camera', centre: 'Center camera', zoom: 'Zoom',
  attackMove: 'Walk and fight', stop: 'Stop', camLock: 'Camera lock', trick: 'Paw Trick', trick1: 'Paw Trick 1',
  trick2: 'Paw Trick 2', trick3: 'Paw Trick 3', sprint: 'Sprint', peek: 'Look ahead', ranges: 'Ranges', twirl: 'Twirl',
});

// ------------------------------------------------------------------ colours
const INK = '#3A2A1F', CREAM = '#FFFDF6', LIT = '#FF7AA2', LIT_RIM = '#C2457A';
const XBOX = { A: '#5DB13E', B: '#E2574C', X: '#3D8FE0', Y: '#E8B21E' };
const PS = { A: ['cross', '#5C8DE0'], B: ['circle', '#E2574C'], X: ['square', '#E27BB8'], Y: ['triangle', '#3FB59A'] };

// ------------------------------------------------------------------ the glyph table (id → words + kind)
/** Keyboard key codes → [glyph id, keycap text, words]. Letters and digits are built on the fly. */
const KEY_CAPS = Object.freeze({
  Space: ['key-space', 'Space', 'Space bar'], Shift: ['key-shift', '⇧ Shift', 'Shift key'], Tab: ['key-tab', 'Tab', 'Tab key'],
  Esc: ['key-esc', 'Esc', 'Esc key'], Enter: ['key-enter', 'Enter', 'Enter key'], Home: ['key-home', 'Home', 'Home key'],
  Bksp: ['key-backspace', '⌫', 'Backspace key'], Ctrl: ['key-ctrl', 'Ctrl', 'Control key'], Alt: ['key-alt', 'Alt', 'Alt key'],
  Meta: ['key-meta', '⌘', 'Windows or Command key'],
  '↑': ['key-up', '↑', 'Up arrow key'], '↓': ['key-down', '↓', 'Down arrow key'], '←': ['key-left', '←', 'Left arrow key'], '→': ['key-right', '→', 'Right arrow key'],
});
const MOUSE = Object.freeze({
  LMB: ['mouse-left', 'Left mouse button'], RMB: ['mouse-right', 'Right mouse button'], MMB: ['mouse-middle', 'Middle mouse button (wheel click)'],
  M4: ['mouse-back', 'Back side mouse button'], M5: ['mouse-forward', 'Forward side mouse button'], Wheel: ['mouse-wheel', 'Mouse wheel'],
  Mouse: ['mouse-move', 'Move the mouse'],
});
const PAD = Object.freeze({
  A: ['pad-a', 'A button', 'Cross button'], B: ['pad-b', 'B button', 'Circle button'], X: ['pad-x', 'X button', 'Square button'],
  Y: ['pad-y', 'Y button', 'Triangle button'],
  LB: ['pad-lb', 'Left bumper', 'L1 button'], RB: ['pad-rb', 'Right bumper', 'R1 button'],
  LT: ['pad-lt', 'Left trigger', 'L2 trigger'], RT: ['pad-rt', 'Right trigger', 'R2 trigger'],
  'L-stick': ['pad-ls', 'Left stick', 'Left stick'], 'R-stick': ['pad-rs', 'Right stick', 'Right stick'],
  L3: ['pad-l3', 'Press the left stick', 'Press the left stick'], R3: ['pad-r3', 'Press the right stick', 'Press the right stick'],
  View: ['pad-view', 'View button', 'Create button'], Start: ['pad-start', 'Menu button', 'Options button'],
  'D-pad ↑': ['pad-dpad-up', 'D-pad up', 'D-pad up'], 'D-pad ↓': ['pad-dpad-down', 'D-pad down', 'D-pad down'],
  'D-pad ←': ['pad-dpad-left', 'D-pad left', 'D-pad left'], 'D-pad →': ['pad-dpad-right', 'D-pad right', 'D-pad right'],
  '↑': ['pad-dpad-up', 'D-pad up', 'D-pad up'], '↓': ['pad-dpad-down', 'D-pad down', 'D-pad down'],
  '←': ['pad-dpad-left', 'D-pad left', 'D-pad left'], '→': ['pad-dpad-right', 'D-pad right', 'D-pad right'],
});
/** Touch labels (text.js ACTION_GLYPH.touch) → [glyph id, words]. Buttons reuse the real on-screen button icons. */
const TOUCH = Object.freeze({
  '⚔': ['touch-attack', 'Sword button'], Stand: ['touch-guard', 'Shield button'], Tumble: ['touch-dodge', 'Roll button'],
  Jump: ['touch-jump', 'Jump button'], Kitten: ['touch-ability', 'Kitten button'], Snack: ['touch-milk', 'Snack button'],
  Meow: ['touch-meow', 'Meow button'], '!': ['touch-interact', 'Use button'], Golden: ['touch-golden', 'Golden Hour button'],
  ':3': ['touch-trick', 'Paw Trick button'], '❚❚': ['touch-pause', 'Pause button'],
  Tap: ['gesture-tap', 'Tap'], 'Tap foe': ['gesture-tap', 'Tap a foe'], tap: ['gesture-tap', 'Tap'], Stick: ['gesture-stick', 'Joystick'],
  'Left thumb': ['gesture-stick', 'Joystick'], 'Drag right': ['gesture-drag', 'Drag on the right'], Drag: ['gesture-drag', 'Drag'],
  Pinch: ['gesture-pinch', 'Pinch'], Swipe: ['gesture-swipe', 'Swipe'], Back: ['gesture-tap', 'Tap Back'],
});

/** The touch button icon per action: the same function touch.js draws its cluster with (TT6: shared map). */
export const TOUCH_ICONS = Object.freeze({
  attack: () => I.sword(), guard: () => I.pawShield('ready'), dodge: () => I.tumble(), jump: () => I.jump(),
  ability: () => I.catHead({ fur: '#F2C38B', deep: '#C98A4B', bow: false, eyes: '#3A2A1F', ear: '#F2A08C' }),
  milk: () => I.milkBottle(true), meow: () => I.meowFace(), interact: () => '<b class="ig-bang">!</b>', golden: () => I.sun(),
  trick: () => I.ttCoin(40), pause: () => I.pauseIcon(),
});
const TOUCH_ACTION = Object.freeze({ 'touch-attack': 'attack', 'touch-guard': 'guard', 'touch-dodge': 'dodge', 'touch-jump': 'jump',
  'touch-ability': 'ability', 'touch-milk': 'milk', 'touch-meow': 'meow', 'touch-interact': 'interact', 'touch-golden': 'golden',
  'touch-trick': 'trick', 'touch-pause': 'pause' });

// ------------------------------------------------------------------ SVG drawings
const MOUSE_BODY = 'M10 1.5c4.4 0 7.5 3.2 7.5 7.6v9.8c0 4.4-3.1 7.6-7.5 7.6S2.5 23.3 2.5 18.9V9.1c0-4.4 3.1-7.6 7.5-7.6Z';
/** A mouse with one part lit: 'left' | 'right' | 'middle' | 'back' | 'forward' | 'wheel' | 'move'. */
function mouseSvg(part) {
  const lit = (d) => `<path d="${d}" fill="${LIT}"/>`;
  let inner = '';
  if (part === 'left') inner = lit('M10 1.5C5.6 1.5 2.5 4.7 2.5 9.1v3.4H10Z');
  if (part === 'right') inner = lit('M10 1.5c4.4 0 7.5 3.2 7.5 7.6v3.4H10Z');
  const wheelLit = part === 'middle' || part === 'wheel';
  const wheel = `<rect x="8.4" y="4.2" width="3.2" height="5.6" rx="1.6" fill="${wheelLit ? LIT : CREAM}" stroke="${INK}" stroke-width="1.2"/>`;
  const side = part === 'back' || part === 'forward'
    ? `<rect x="1.2" y="${part === 'back' ? 16.5 : 12.8}" width="3.2" height="3.2" rx="1" fill="${LIT}" stroke="${INK}" stroke-width="1"/>` : '';
  const arrows = part === 'wheel'
    ? `<path d="M23 6.5 25 4l2 2.5M23 21.5l2 2.5 2-2.5" fill="none" stroke="${LIT_RIM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : part === 'move' ? `<path d="M21.5 9.5c2 1.4 3 3 3 4.5s-1 3.1-3 4.5M24.5 7c2.6 2 4 4.4 4 7s-1.4 5-4 7" fill="none" stroke="${LIT_RIM}" stroke-width="1.6" stroke-linecap="round"/>` : '';
  const vb = arrows ? '0 0 30 28' : '0 0 20 28';
  return `<svg class="ig-svg" viewBox="${vb}" aria-hidden="true"><path d="${MOUSE_BODY}" fill="${CREAM}"/>${inner}`
    + `<path d="M2.5 12.5H17.5M10 1.5V4.2M10 9.8V12.5" stroke="${INK}" stroke-width="1.3"/>${wheel}${side}`
    + `<path d="${MOUSE_BODY}" fill="none" stroke="${INK}" stroke-width="1.7"/>${arrows}</svg>`;
}

/** W A S D as a 2 × 2-ish cluster of keycaps. */
function wasdSvg() {
  const cap = (x, y, ch) => `<rect x="${x}" y="${y}" width="10" height="10" rx="2.6" fill="${CREAM}" stroke="${INK}" stroke-width="1.5"/>`
    + `<text x="${x + 5}" y="${y + 7.6}" text-anchor="middle" font-size="7.4" font-weight="700" fill="${INK}" font-family="inherit">${ch}</text>`;
  return `<svg class="ig-svg" viewBox="0 0 35 24" aria-hidden="true">${cap(12.5, 1, 'W')}${cap(1, 13, 'A')}${cap(12.5, 13, 'S')}${cap(24, 13, 'D')}</svg>`;
}

/** A face button: Xbox letters in colour, or the PlayStation shapes. */
function faceSvg(btn, ps) {
  if (ps) {
    const [shape, col] = PS[btn];
    const sh = shape === 'cross' ? '<path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'
      : shape === 'circle' ? '<circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="2.2"/>'
        : shape === 'square' ? '<rect x="7.6" y="7.6" width="8.8" height="8.8" rx="1" fill="none" stroke="#fff" stroke-width="2.2"/>'
          : '<path d="M12 6.8 17 15.6H7Z" fill="none" stroke="#fff" stroke-width="2.1" stroke-linejoin="round"/>';
    return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#3B3340" stroke="${INK}" stroke-width="1.5"/>`
      + `${sh.replace(/#fff/g, col)}</svg>`;
  }
  return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="${XBOX[btn]}" stroke="${INK}" stroke-width="1.5"/>`
    + `<text x="12" y="16.3" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="inherit">${btn}</text></svg>`;
}

/** A bumper (LB / RB) or trigger (LT / RT) with its label (or L1 / L2 on a PlayStation pad). */
function shoulderSvg(id, ps) {
  const right = id[0] === 'R', trig = id[1] === 'T';
  const txt = ps ? `${id[0]}${trig ? 2 : 1}` : id;
  if (trig) {
    const d = right ? 'M6 25V9c0-4.4 3.6-7.5 8-7.5 3 0 6 1.8 6 5.6V25Z' : 'M18 25V9c0-4.4-3.6-7.5-8-7.5-3 0-6 1.8-6 5.6V25Z';
    return `<svg class="ig-svg" viewBox="0 0 24 27" aria-hidden="true"><path d="${d}" fill="#5B4A3C" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<text x="12" y="19" text-anchor="middle" font-size="8.6" font-weight="800" fill="#fff" font-family="inherit">${txt}</text></svg>`;
  }
  const d = right ? 'M2 17V9.5C2 5 5 2 10 2h11c4 0 7 3 7 7.5V17Z' : 'M28 17V9.5C28 5 25 2 20 2H9C5 2 2 5 2 9.5V17Z';
  return `<svg class="ig-svg" viewBox="0 0 30 19" aria-hidden="true"><path d="${d}" fill="#5B4A3C" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<text x="15" y="13.6" text-anchor="middle" font-size="8.6" font-weight="800" fill="#fff" font-family="inherit">${txt}</text></svg>`;
}

/** A thumbstick ('L' / 'R'); `press` draws the click (L3 / R3) as a ring pushed down. */
function stickSvg(side, press) {
  const push = press
    ? `<path d="M12 .6v3.6M10 2.4 12 4.4l2-2" fill="none" stroke="${LIT_RIM}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="9.6" fill="#8A7E86" stroke="${INK}" stroke-width="1.5"/>`
    + `<circle cx="12" cy="12.4" r="6.6" fill="${press ? LIT : '#5B4A3C'}" stroke="${INK}" stroke-width="1.3"/>`
    + `<text x="12" y="15.6" text-anchor="middle" font-size="8.6" font-weight="800" fill="#fff" font-family="inherit">${side}</text>${push}</svg>`;
}

/** A D-pad cross with one arm lit. */
function dpadSvg(dir) {
  const arm = { up: 'M9 1.5h6v7.5H9Z', down: 'M9 15h6v7.5H9Z', left: 'M1.5 9H9v6H1.5Z', right: 'M15 9h7.5v6H15Z' }[dir];
  return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 1.5h6V9h7.5v6H15v7.5H9V15H1.5V9H9Z" fill="#5B4A3C" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`
    + `<path d="${arm}" fill="${LIT}"/></svg>`;
}

/** View (two overlapping windows) and Start / Menu (three lines) as small round buttons. */
function smallPadSvg(kind) {
  const inner = kind === 'view'
    ? '<rect x="6.2" y="7" width="7.6" height="6" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/><rect x="10.2" y="10.6" width="7.6" height="6" rx="1" fill="#5B4A3C" stroke="#fff" stroke-width="1.5"/>'
    : '<path d="M7 8h10M7 12h10M7 16h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>';
  return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#5B4A3C" stroke="${INK}" stroke-width="1.5"/>${inner}</svg>`;
}

/** Touch gestures: a fingertip tap with ripples, a drag, a pinch, a swipe, the joystick. */
function gestureSvg(kind) {
  const tip = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${LIT}" stroke="${INK}" stroke-width="1.4"/>`;
  let body;
  if (kind === 'tap') body = `<circle cx="12" cy="12" r="9" fill="none" stroke="${LIT_RIM}" stroke-width="1.3" opacity=".55"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="${LIT_RIM}" stroke-width="1.4"/>${tip(12, 12)}`;
  else if (kind === 'drag') body = `<path d="M7 12h12M16 8.6l3.4 3.4-3.4 3.4" fill="none" stroke="${LIT_RIM}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>${tip(6, 12)}`;
  else if (kind === 'swipe') body = `<path d="M5 17C9 9 14 7 20 7M16.4 4.4 20 7l-3 3" fill="none" stroke="${LIT_RIM}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>${tip(5, 17)}`;
  else if (kind === 'pinch') body = `<path d="M3.5 20.5 8 16M20.5 3.5 16 8M3.5 16.5v4h4M20.5 7.5v-4h-4" fill="none" stroke="${LIT_RIM}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>${tip(10, 14)}${tip(14, 10)}`;
  else body = `<circle cx="12" cy="12" r="9.6" fill="${CREAM}" stroke="${INK}" stroke-width="1.5" opacity=".9"/><circle cx="14" cy="10.4" r="4.6" fill="${LIT}" stroke="${INK}" stroke-width="1.4"/>`;
  return `<svg class="ig-svg" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// ------------------------------------------------------------------ resolving one atom
/**
 * One label atom → { id, words, html } for `device`. `ps` = a PlayStation pad. Unknown atoms become a plain keycap.
 * @param {string} atom @param {'kbm'|'pad'|'touch'} device @param {boolean} [ps]
 */
export function glyphAtom(atom, device = 'kbm', ps = false) {
  const a = String(atom ?? '').trim();
  if (!a) return null;
  if (device === 'touch') {
    const t = TOUCH[a] ?? TOUCH[a.toLowerCase()];
    if (t) {
      const [id, words] = t;
      const act = TOUCH_ACTION[id];
      const inner = act ? `<span class="ig-tb ig-tb--${act}">${TOUCH_ICONS[act]()}</span>` : gestureSvg(id.slice(8));
      return { id, words, kind: act ? 'touch' : 'gesture', html: inner };
    }
  }
  if (device === 'pad') {
    const p = PAD[a];
    if (p) {
      const [id, xw, pw] = p;
      const words = ps ? pw : xw;
      let html;
      if (/^pad-[abxy]$/.test(id)) html = faceSvg(a, ps);
      else if (/^pad-[lr][bt]$/.test(id)) html = shoulderSvg(a, ps);
      else if (id === 'pad-ls' || id === 'pad-rs') html = stickSvg(id[4].toUpperCase(), false);
      else if (id === 'pad-l3' || id === 'pad-r3') html = stickSvg(id[4].toUpperCase(), true);
      else if (id.startsWith('pad-dpad-')) html = dpadSvg(id.slice(9));
      else html = smallPadSvg(id === 'pad-view' ? 'view' : 'start');
      return { id, words, kind: 'pad', html };
    }
  }
  const m = MOUSE[a];
  if (m) return { id: m[0], words: m[1], kind: 'mouse', html: mouseSvg(m[0].slice(6)) };
  if (a === 'WASD') return { id: 'key-wasd', words: 'W A S D keys', kind: 'keys', html: wasdSvg() };
  const k = KEY_CAPS[a];
  if (k) return { id: k[0], words: k[2], kind: 'key', cap: k[1] };
  if (/^[A-Z0-9]$/.test(a)) return { id: `key-${a.toLowerCase()}`, words: `${a} key`, kind: 'key', cap: a };
  return { id: `text-${a.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, words: a, kind: 'key', cap: a };
}

/** HTML for one resolved atom (a keycap or an SVG chip), with aria and the abstract id. */
function atomHtml(g, compact = false) {
  const w = esc(g.words);
  if (g.kind === 'key') {
    // compact (the ability-bar corner badge): Shift is its arrow, Space a short space-bar bracket (they spilled out of
    // their 56 px slots as "⇧ Shift" / "Space")
    if (compact && g.id === 'key-shift') return `<kbd class="ui-key ig ig-key" data-glyph="${g.id}" aria-label="${w}" title="${w}">⇧</kbd>`;
    if (compact && g.id === 'key-space') {
      return `<kbd class="ui-key ig ig-key ig-key--bar" data-glyph="${g.id}" aria-label="${w}" title="${w}">`
        + '<svg class="ig-spacebar" viewBox="0 0 20 10" aria-hidden="true"><path d="M2.5 2.5v4.5h15V2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd>';
    }
    const wide = g.cap.length > 3 ? ' ig-key--wide' : '';
    return `<kbd class="ui-key ig ig-key${wide}" data-glyph="${g.id}" aria-label="${w}" title="${w}">${esc(g.cap)}</kbd>`;
  }
  // an explicit width ratio (--igr): an inline SVG with only a height set stretches in a flex cell or shrinks to 0 in a
  // shrink-to-fit badge; CSS sets the height (--igh) and the width follows
  const html = g.html.replace(/<svg class="ig-svg" viewBox="0 0 ([\d.]+) ([\d.]+)"/g, (m, vw, vh) => `${m} style="--igr:${(+vw / +vh).toFixed(3)}"`);
  return `<span class="ig ig--${g.kind}" data-glyph="${g.id}" role="img" aria-label="${w}" title="${w}">${html}<span class="ig-a11y">${w}</span></span>`;
}

/**
 * Split a text label (text.js: "RMB", "RMB / WASD", "LB + X", "RT + ←", "Space ×2", "hold Shift", "L3 (hold)",
 * "Hold :3", "Stick / tap", "Esc / P") into parts: { atom } | { sep: '/' | '+' } | { word }. Pure.
 * @param {string} label
 */
export function labelParts(label) {
  const out = [];
  const alts = String(label ?? '').split(/\s+\/\s+/);
  alts.forEach((alt, ai) => {
    if (ai) out.push({ sep: '/' });
    let s = alt.trim(), tail = null;
    const hold = /^hold\s+/i.exec(s);
    if (hold) { out.push({ word: 'hold' }); s = s.slice(hold[0].length); }
    const x2 = /\s*×\s*(\d)$/.exec(s);
    if (x2) { tail = `×${x2[1]}`; s = s.slice(0, x2.index); }
    const ph = /\s*\(hold\)$/i.exec(s);
    if (ph) { tail = 'hold'; s = s.slice(0, ph.index); }
    // "Stick / tap" splits above; "D-pad ↑" and "Tap foe" stay whole; "RT + ←" is a combo
    s.split(/\s+\+\s+/).forEach((c, ci) => { if (ci) out.push({ sep: '+' }); out.push({ atom: c.trim() }); });
    if (tail) out.push({ word: tail });
  });
  return out;
}

/**
 * The glyph HTML for a text label on a device. `o.action` (optional) adds `data-action`; `o.label` adds the plain
 * word next to the icon ("[mouse] Shield"); `o.ps` draws PlayStation buttons; `o.compact` draws Shift as ⇧ and Space
 * as a short bar (the ability-bar badges). '—' (no binding) stays a dash.
 * @param {string} label @param {'kbm'|'pad'|'touch'} [device]
 * @param {{ action?: string, label?: string|boolean, ps?: boolean, cls?: string, compact?: boolean }} [o]
 */
export function glyphHtml(label, device = 'kbm', o = {}) {
  const L = String(label ?? '');
  if (!L || L === '—') return '<span class="ig-na" aria-label="not used">—</span>';
  // touch labels that are whole phrases ("Stick / tap" is two gestures; "Tap foe" one)
  const parts = labelParts(L);
  let html = '', words = [];
  for (const p of parts) {
    if (p.sep) { html += `<span class="ig-sep" aria-hidden="true">${p.sep}</span>`; words.push(p.sep === '/' ? 'or' : 'plus'); continue; }
    if (p.word) { html += `<span class="ig-x">${esc(p.word)}</span>`; words.push(p.word === '×2' ? 'twice' : p.word); continue; }
    const g = glyphAtom(p.atom, device, !!o.ps);
    if (!g) continue;
    html += atomHtml(g, !!o.compact);
    words.push(g.words);
  }
  const lbl = o.label === true ? ACTION_LABEL[o.action] : (typeof o.label === 'string' ? o.label : null);
  const act = o.action ? ` data-action="${esc(o.action)}"` : '';
  const many = parts.length > 1;
  const inner = many ? `<span class="ig-group">${html}</span>` : html;
  if (!lbl && !many && !o.cls && !act) return html;
  return `<span class="ig-wrap${o.cls ? ` ${o.cls}` : ''}"${act}>${inner}${lbl ? `<span class="ig-lbl">${esc(lbl)}</span>` : ''}</span>`;
}

/**
 * Plain words for a label ("RMB" → "right mouse button", "LB + X" → "left bumper plus X button"): text-only places
 * (aria, the skip ring, rebind messages). Never an abbreviation. Pure.
 * @param {string} label @param {'kbm'|'pad'|'touch'} [device] @param {boolean} [ps]
 */
export function glyphWords(label, device = 'kbm', ps = false) {
  const L = String(label ?? '');
  if (!L || L === '—') return '';
  const out = [];
  for (const p of labelParts(L)) {
    if (p.sep) out.push(p.sep === '/' ? 'or' : 'plus');
    else if (p.word) out.push(p.word === '×2' ? 'twice' : p.word);
    else { const g = glyphAtom(p.atom, device, ps); if (g) out.push(g.kind === 'key' && g.id.startsWith('key-') && g.cap.length === 1 ? g.cap : g.words); }
  }
  return out.join(' ');
}

/** Words for a KeyboardEvent.code / mouse code (the rebind messages): "Right mouse button", "Q", "Space bar". */
export function codeWords(code, label) {
  const g = glyphAtom(label, 'kbm');
  if (!g) return String(code ?? '');
  return g.kind === 'key' && g.cap.length === 1 ? g.cap : g.words;
}

/**
 * The Shield cue icon inline in text ("Tap [Stand] when [ShieldCue] pops!"): the Pink Paw shield the player sees over
 * a foe (fx Telegraphs): gold with a pink "!", unlike Clem's own pink shield.
 */
export function shieldCueHtml() {
  return `<span class="ig ig--cue" data-glyph="shield-cue" role="img" aria-label="gold warning shield" title="gold warning shield">${I.alertShield()}<span class="ig-a11y">gold warning shield</span></span>`;
}

/** Is this a PlayStation pad id (Gamepad.id)? Pure. */
export function isPlayStationPad(id) { return /playstation|dualshock|dualsense|sony|054c/i.test(String(id ?? '')); }
