/**
 * Casual PvP capability (docs/plans/moba/V16.md §1 item 7, §4.7): PvP shows only when the backend's
 * `GET /pawlegends/sim` says it verifies this build's sim and that sim is >= its `pvpSince`. No feature flag: a backend
 * without PvP simply hides the chip. One fetch per page (cached); any failure reads as "no PvP".
 */
import { SIM_VERSION } from '../sim/version';

let cached: Promise<boolean> | null = null;
let known: boolean | null = null;

/** The last answer (null before it arrived): the title draws the chip once it is true. */
export const pvpKnown = (): boolean | null => known;

export function pvpAvailable(api: string): Promise<boolean> {
  cached ??= (async () => {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 5000);
      const r = await fetch(`${api.replace(/\/+$/, '')}/pawlegends/sim`, { signal: ctl?.signal ?? undefined, credentials: 'omit' });
      clearTimeout(timer);
      if (!r.ok) return (known = false);
      const j = (await r.json()) as { simVersions?: unknown; pvpSince?: unknown };
      const versions = Array.isArray(j.simVersions) ? j.simVersions : [];
      const since = typeof j.pvpSince === 'number' ? j.pvpSince : Infinity;
      return (known = versions.includes(SIM_VERSION) && SIM_VERSION >= since);
    } catch {
      return (known = false);
    }
  })();
  return cached;
}
