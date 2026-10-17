/**
 * Desktop bindings (POC.md §9): PPK's `moba` preset (INPUT.presets.moba, lifted as data) remapped to MOBA defaults.
 * PPK gives right-click move, A attack-move and S stop; Pawlegends adds Q/W/E/R casts, D Paw Trick, B Nap, 1/2
 * talents, Space centre, Tab scoreboard and Esc menu. No binding uses Ctrl, Alt, Meta or an F-key.
 */
import { PPK_INPUT_PRESETS } from './ppkInput.data.js';

export type Action = 'move' | 'attackMove' | 'stop' | 'q' | 'w' | 'e' | 'r' | 'trick' | 'nap' | 'talent1' | 'talent2' | 'centre' | 'scoreboard' | 'menu';

type Keys = Record<string, readonly string[]>;
const ppk = ((PPK_INPUT_PRESETS as Record<string, { keys?: Keys }>).moba?.keys ?? {}) as Keys;

const only = (codes: readonly string[] | undefined, fallback: readonly string[]): string[] => {
  const ok = (codes ?? []).filter((c) => !/^(Control|Alt|Meta|F\d+)/.test(c));
  return ok.length > 0 ? ok : [...fallback];
};

/** action → event codes ('Mouse0' left, 'Mouse2' right). */
export const MOBA_BINDINGS: Readonly<Record<Action, readonly string[]>> = Object.freeze({
  move: only(ppk.move, ['Mouse2']),
  attackMove: only(ppk.attackMove, ['KeyA']),
  // PPK binds stop to S and H; H stays free in Pawlegends.
  stop: only(ppk.stop?.filter((c) => c === 'KeyS'), ['KeyS']),
  q: ['KeyQ'],
  w: ['KeyW'],
  e: ['KeyE'],
  r: ['KeyR'],
  trick: ['KeyD'],
  nap: ['KeyB'],
  talent1: ['Digit1'],
  talent2: ['Digit2'],
  centre: ['Space'],
  scoreboard: ['Tab'],
  menu: ['Escape'],
});

const BY_CODE = new Map<string, Action>();
for (const [a, codes] of Object.entries(MOBA_BINDINGS) as [Action, readonly string[]][]) for (const c of codes) if (!BY_CODE.has(c)) BY_CODE.set(c, a);

export const actionFor = (code: string): Action | null => BY_CODE.get(code) ?? null;

/** Display label of the first key bound to `a` ("Q", "Space", "RMB"). */
export function keyLabel(a: Action): string {
  const c = MOBA_BINDINGS[a][0] ?? '';
  if (c === 'Mouse2') return 'RMB';
  if (c === 'Mouse0') return 'LMB';
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c === 'Escape') return 'Esc';
  return c;
}
