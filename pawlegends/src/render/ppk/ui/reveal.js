// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/reveal.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/reveal.js  (owner: ui) — WARM_ADVENTURE_SPEC §4.1 calm HUD + §7.5 progressive reveal, the pure part.
//
// During Morning Practice the controls appear lesson by lesson on EVERY device (the touch cluster's veil, the desktop /
// pad ability bar's keycaps, the HUD's Grit shields): a control shows once its lesson has started. Milk, Golden Hour,
// the kitten slot and the Valor sword stay hidden through practice (nothing teaches them there). Outside practice
// everything shows, except the kitten slot, which stays empty until that kitten has actually joined (unlocked, or its
// join flag: Mochi's portrait never shows before D-01 unlocks him / sets `meadow.mochi`). Hidden controls keep their geometry (X22: the
// SafeFrame occluder rects never change on a reveal); this module only decides what is visible.
import { JOIN_FLAGS } from '../companions/steering.js';

/** The ability-bar / HUD parts a practice lesson reveals (touch has its own LESSON_BUTTONS, attack included). */
export const LESSON_SLOTS = Object.freeze(['guard', 'dodge', 'jump', 'meow']);

/** kitten id → the flag its join scene sets (inverse of companions' JOIN_FLAGS). */
const JOIN_OF = Object.freeze(Object.fromEntries(Object.entries(JOIN_FLAGS).map(([f, id]) => [id, f])));

/** The prologue flags that mean Morning Practice is over (done, skipped, or the prologue finished). */
const PRACTICE_OVER = ['prologue.practice', 'prologue.tutorial', 'prologue.done'];

/**
 * Is Morning Practice running? The tutorial is active, or she stands on the practice field before it has ended (the
 * intro beat right after CS-01, before the first lesson's prompt). Reads ctx defensively.
 * @param {any} ctx
 */
export function inPractice(ctx) {
  const st = ctx?.state;
  for (const f of PRACTICE_OVER) if (st?.getFlag?.(f)) return false;
  if (ctx?.story?.tutorial?.active) return true;
  const cur = ctx?.levels?.current;
  return (cur?.id ?? st?.levelId) === 'meadow' && cur?.spawnId === 'practice';
}

/**
 * Has kitten `id` joined the party (so its portrait may fill the kitten slot)? One source of truth with the companion
 * system: a kitten counts as joined once it is unlocked (`state.companions.unlocked`, which `CompanionManager.setActive`
 * / `unlock` maintain and which gates casting) or its join flag is set. Kittens without a join scene count as joined
 * whenever they are active. In the real game Mochi is only unlocked by D-01 (`meadow.mochi`), so his portrait still
 * waits for the join; a debug jump / older save / hub swap that puts him in the party shows him (and his cooldown),
 * since Q casts for him then too.
 * @param {any} ctx @param {string} id
 */
export function companionJoined(ctx, id) {
  const f = JOIN_OF[id];
  if (!f) return true;
  const st = ctx?.state;
  return !!st?.getFlag?.(f) || !!st?.companions?.unlocked?.includes?.(id);
}

/**
 * What the progressive reveal shows. Pure; writes into `out`.
 * @param {{ practice: boolean, taught?: string[]|Set<string>|null }} s
 * @param {Record<string, boolean>} [out]
 * @returns {{ guard: boolean, dodge: boolean, jump: boolean, meow: boolean, attack: boolean, ability: boolean,
 *   golden: boolean, milk: boolean, interact: boolean, valor: boolean, grit: boolean, practice: boolean }}
 */
export function revealShow(s, out = {}) {
  const practice = !!s?.practice;
  const t = s?.taught;
  const has = (a) => !practice || (!!t && (t instanceof Set ? t.has(a) : t.includes(a)));
  out.practice = practice;
  for (const a of LESSON_SLOTS) out[a] = has(a);
  out.attack = has('attack') || has('chargeRelease');
  out.ability = out.golden = out.milk = out.valor = !practice;
  out.interact = true;                 // contextual anyway (lit only next to something to use)
  out.grit = has('guard');             // the armour shields arrive with the Stand lesson
  return /** @type {any} */ (out);
}
