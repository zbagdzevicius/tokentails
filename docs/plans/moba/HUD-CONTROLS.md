# HUD controls (gaps round 3, package hud-controls)

Closes three "behind" rows of the round 2 gap report (touch controls) against Wild Rift, Mobile Legends and Brawl Stars:
no HUD layout editor, no per-ability cast mode, no 90/120 fps. No sim change; the default HUD is unchanged (the
`hud-area` spec footprint holds).

## 1. HUD layout editor

Settings → HUD layout → **Edit** (touch devices). A full-screen stand-in for the match HUD
(`pawlegends/src/ui/hudEditor.ts`, rules in `pawlegends/src/input/touch/hudLayout.ts`).

| What moves | Resize |
|---|---|
| Attack, Q, W, E, R, Paw Trick, Nap, Last hit, Tower | 80% to 140% in 10% steps (never under 44 px) |
| Minimap group (the map, the ping paw, the Fish chip; the party emote and chat buttons ride with it) | S / M / L (the existing Minimap size setting) |
| Joystick home (the floating stick's zone moves with it) | 80% to 140% (ring, knob and thumb travel) |

Rules, enforced on every drop, every resize and every load:

- every control stays inside the safe area (4 px in from the insets);
- no two controls overlap (4 px gap at least);
- nothing covers the score bar band (top centre, where the editor's toolbar sits).

A drop that breaks a rule slides back and says why ("Can't go there: it would overlap W"). Snap guides line a
control up with another control's centre or the safe edge (8 px). Keyboard: Tab picks, arrows move (Shift: 10 px),
+ / − resize, Esc cancels. Reset puts everything (and the minimap size) back to the default.

Storage: `pawlegends.hudLayout.v1`, one layout per device class (`phone-l`, `phone-p`, `tablet-l`, `tablet-p`), each
control `[x, y, k]` as viewport fractions in the right-handed frame. Only controls that differ from the default are
stored. A stored layout that does not fit the current screen (a smaller phone of the same class) falls back to the
default as a whole. It follows the account in `prefs.data.hud` of the progress blob (no backend change: the existing
settings sanitizer keeps it), sent only once a device has saved or reset a layout, so nobody's settings hash changes
on update.

Left-handed mirror: the arc and the joystick mirror as before. **Fixed with this package:** the right-edge column
(Nap, last hit, tower) used to mirror too and sat on the minimap (Nap covered its top-left corner); it now stays on
the right edge in the mirror.

## 2. Per-ability cast mode and aim sensitivity

Settings → Ability casting and aim (touch). One row per slot (Q, W, E, R, Trick):

| Mode | Behaviour |
|---|---|
| Quick (default, as before) | a tap casts at the smart target; a drag aims; a 180 ms hold shows the aim |
| Indicator | the range and aim show the moment the button goes down; lift to cast (tap = smart aim) |
| Normal | a tap arms the skill (the button glows, the aim stays up for 6 s); the next tap on the field casts there; tap the button again to put it away; a drag still aims and casts |

Dashes and other heading casts still fire on the press in every mode (founder: no friction). Self casts in Normal go
at once (nothing to aim). Aim sensitivity 50% to 200% scales the thumb travel for full range (`DRAG_FULL_PX / sens`).
Stored as `pawlegends.tcast.<slot>` = mode letter + percent (`n150`), synced with the account (`SYNCED_KEYS`).

## 3. Frame rate

Settings → Frame rate (matches): 30 / 60 / 90 / 120. 60 by default (unchanged). 90 and 120 are offered only where the
display refreshes that fast: the game measures requestAnimationFrame for its first 120 callbacks and remembers the
highest rate seen (`pawlegends.displayHz`). Battery saver and the governor's 30 fps step still hold matches at 30
whatever the choice. A 90/120 choice never costs graphics quality: the governor judges frames against 60 fps. Per
device (not synced). Menus stay at 30, a paused match at 15.

Platform note: iOS WKWebView paces requestAnimationFrame at 60 Hz, so iPhones offer 30/60 only; Android WebViews
that run at 90/120 Hz offer the higher rates.

## Tests

- `pawlegends/tests/unit/hud-controls.test.ts`: rules on 6 screen sizes × mirror, Large and notch insets; storage,
  fallback, snap, editor drag/refuse/resize/reset/keyboard, cast prefs, frame-rate probe and pacer, account sync
  through the backend sanitizer.
- `pawlegends/tests/e2e/hud-controls.spec.ts` (landscape): edit → save → the match lays out the saved Q, R and
  minimap; default untouched; Indicator and Normal cast end to end; the Settings rows.
