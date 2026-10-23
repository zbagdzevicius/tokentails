/**
 * Iteration 2 integration (integrator only): wires the lanes' seams together after they installed (lanes.ts).
 *
 * - Unlocks: the modes lane's menus and pickers ask the progression lane's rules (one truth: classes, Mirror, the
 *   Catnip Cup, Battle, owned bodies and hats, the Pink Paw cats a trophy earned).
 * - The racer look: modes/flow.ts reads and writes the progression loadout (`flow.look` / `flow.setLook`).
 * - Rivals: progression keeps a rival the modes lane's Grand Prix field names (progression/loadout.ts); ghosts carry
 *   the rival slot (share/codec/ghost-codec.ts), so a dare from a Daily Cup re-simulates the same AI.
 */
import type { Shell } from './core/app/shell';
import { setUnlockProvider } from './modes/hooks';
import { bodyPrice, ownsBody, ownsHat, playableCats, unlocked, unlockHint, type UnlockKey } from './progression/api';
import { HAT_PRICES } from './content/cosmetics';
import { HAT_IDS, type HatId } from './content/ids';
import type { BodyId } from './types';
import { t } from './ui/i18n';

const CLASS_KEY: Record<string, UnlockKey> = { '1': 'class:1', '2': 'class:2', '3': 'mirror' };

function gate(key: UnlockKey): string | null {
  return unlocked(key) ? null : t(unlockHint(key));
}

export function installIntegration(_shell: Shell): void {
  setUnlockProvider({
    lock(kind, id) {
      if (kind === 'class') return CLASS_KEY[id] ? gate(CLASS_KEY[id]) : null;
      if (kind === 'cup') return id === 'catnip' ? gate('cup:catnip') : null;
      if (kind === 'mode') return id === 'battle' ? gate('mode:battle') : id === 'tt' ? gate('mode:tt') : null;
      const n = Number(id);
      if (kind === 'body') return ownsBody(n) ? null : t('{n} fish in the Garage', { n: bodyPrice(n as BodyId) });
      if (kind === 'hat') return n === 0 || ownsHat(n) ? null : t('{n} fish in the Garage', { n: HAT_PRICES[(HAT_IDS[n] ?? 'none') as HatId] ?? 0 });
      return null;
    },
    shelterCats: () => playableCats().map((c) => c.id),
  });
}
