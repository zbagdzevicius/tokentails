/**
 * The region ping (docs/plans/moba/SOCIAL-RANKED.md §7.11, groundwork): lazy, only the party chunk imports it, so the
 * first load never carries it. One region today; the ranked queue card shows "Europe · 48 ms".
 */
import type { RankedStatus } from './ranked';

/** One region's measured ping (ms), or null when it could not be measured. */
export interface RegionPing {
  id: string;
  name: string;
  ms: number | null;
}

let pings: { atMs: number; api: string; value: RegionPing[] } | null = null;
let pinging: Promise<RegionPing[]> | null = null;

/**
 * Time each region's ping path three times (no-store) and keep the median, cached 60 s. Groundwork for region choice:
 * one region today. Never throws; an unreachable region reads null.
 */
export function measureRegionPings(api: string, regions: RankedStatus['regions'], now = Date.now()): Promise<RegionPing[]> {
  const base = api.replace(/\/+$/, '');
  if (pings && pings.api === base && now - pings.atMs < 60_000) return Promise.resolve(pings.value);
  if (pinging) return pinging;
  pinging = (async () => {
    const out: RegionPing[] = [];
    for (const r of regions) {
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const t0 = performance.now();
          const res = await fetch(`${base}${r.ping}`, { cache: 'no-store', credentials: 'omit' });
          if (!res.ok) break;
          await res.text();
          samples.push(performance.now() - t0);
        } catch {
          break;
        }
      }
      samples.sort((a, b) => a - b);
      out.push({ id: r.id, name: r.name, ms: samples.length ? Math.round(samples[Math.floor(samples.length / 2)]) : null });
    }
    pings = { atMs: Date.now(), api: base, value: out };
    pinging = null;
    return out;
  })();
  return pinging;
}

/** The last measured pings this visit (empty before any). */
export const regionPingsNow = (): RegionPing[] => pings?.value ?? [];

/** "Europe · 48 ms" (one region), "Europe · …" while measuring. Pure. */
export function regionText(r: RegionPing | { name: string; ms?: number | null }): string {
  return `${r.name} · ${typeof r.ms === 'number' ? `${r.ms} ms` : '…'}`;
}

/** Tests only. */
export function resetRegionPings(): void {
  pings = null;
  pinging = null;
}
