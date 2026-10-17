/**
 * Cameos (GDD 6.5), standalone offline fallback. The full client (server bundle per day and shuffle, seen counter)
 * lives in src/money (`money.cameos`), which imports platform, never the reverse. This file stays self-contained:
 * no network, no money import. Offline the spectators are the Pink Paw cats (waiting first, then alumni).
 */
import type { CatSpec } from '../types';
import { PINK_PAW_CATS, pinkPawCatSpec } from './pink-paw';

export interface Cameo {
  id: string;
  name: string;
  cat: CatSpec;
  faceUrl: string | null;
  club: boolean;
  alumni?: boolean;
}

/** Offline: up to `slots` Pink Paw cats, rotated by dayNo so the windowsills change daily. No network. */
export async function loadCameos(dayNo: number, slots: number): Promise<Cameo[]> {
  try {
    const n = Math.max(0, Math.min(15, Math.floor(Number.isFinite(slots) ? slots : 0)));
    const waiting = PINK_PAW_CATS.filter((c) => c.status !== 'ADOPTED');
    const alumni = PINK_PAW_CATS.filter((c) => c.status === 'ADOPTED');
    const pool = [...waiting, ...alumni];
    if (n === 0 || pool.length === 0) return [];
    const d = Math.floor(Number.isFinite(dayNo) ? dayNo : 0);
    const start = ((d % pool.length) + pool.length) % pool.length;
    const out: Cameo[] = [];
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const c = pool[(start + i) % pool.length];
      out.push({ id: `pp-${c.id}`, name: c.name.slice(0, 12), cat: pinkPawCatSpec(c), faceUrl: null, club: false, alumni: c.status === 'ADOPTED' });
    }
    return out;
  } catch {
    return [];
  }
}

/** Server cameos are a src/money feature (VITE_BADCAT_API_URL + VITE_BADCAT_CLUB + server flag); off here. */
export function cameosEnabled(): boolean {
  return false;
}
