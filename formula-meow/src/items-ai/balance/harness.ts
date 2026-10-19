/**
 * Headless balance harness (GDD 4.1): runs N AI-only races per track and class and reports the numbers the GDD
 * targets: the field's average place change from the end of lap 1 to the finish (≥ 1.5), how often the winner leads
 * by less than 3 s (≥ 70 %), and each item's uses and hit rate (no attack item under 20 %).
 *
 * Small N runs in `harness.test.ts`; the full 2,000-race run is
 * `FM_BALANCE_N=2000 npx vitest run src/items-ai/balance/harness.test.ts` (prints the report).
 */
import { ITEM_IDS, type ItemId, type RaceClass, type TrackDef } from '../../types';
import { SimWorld } from '../../core/sim/world';
import { buildTrack, type BuiltTrack } from '../../core/track/build';
import { buildField, createSimPlugins } from '..';
import { itemsOf } from '../items/state';

export interface ItemStat {
  uses: number;
  hits: number;
}

export interface BalanceReport {
  races: number;
  /** mean over races of the mean |place after lap 1 − final place| over the field */
  placeChange: number;
  /** share of races where the winner beat 2nd by less than 3 s */
  closeFinish: number;
  /** mean winner margin, s */
  margin: number;
  /** mean race time of the winner, s */
  winTime: number;
  items: Record<ItemId, ItemStat>;
  /** mean hits taken per kart per race */
  hitsPerKart: number;
  /** mean respawns per race */
  respawns: number;
}

export function runBalance(tracks: readonly TrackDef[], classes: readonly RaceClass[], seeds: number): BalanceReport {
  const items = Object.fromEntries(ITEM_IDS.map((id) => [id, { uses: 0, hits: 0 }])) as Record<ItemId, ItemStat>;
  let races = 0;
  let change = 0;
  let close = 0;
  let margin = 0;
  let winTime = 0;
  let hits = 0;
  let respawns = 0;
  const built = new Map<string, BuiltTrack>();
  for (const def of tracks) {
    if (!built.has(def.id)) built.set(def.id, buildTrack(def, 0));
    for (const cls of classes)
      for (let seed = 1; seed <= seeds; seed++) {
        const s = seed * 7919 + cls * 104729;
        const cfg = { track: def, seed: s, cls, modifiers: 0, racers: buildField({ seed: s, cls, playerSlot: -1 }), humans: [], forgiving: false, tailTicks: 60 * 60 };
        const w = new SimWorld(cfg, createSimPlugins(), built.get(def.id));
        const lap1: number[] = new Array(cfg.racers.length).fill(0);
        let seen = 0;
        while (!w.done) {
          const before = w.st.events.length;
          w.step();
          for (let e = before; e < w.st.events.length; e++) {
            const ev = w.st.events[e];
            if (ev.type === 'lap' && ev.a === 2) {
              lap1[ev.kart] = w.st.karts[ev.kart].place;
              seen++;
            } else if (ev.type === 'hit') hits++;
            else if (ev.type === 'respawn') respawns++;
          }
        }
        const r = w.result();
        let c = 0;
        for (const p of r.places) c += Math.abs((lap1[p.kart] || p.place) - p.place);
        change += c / r.places.length;
        const t = r.places.map((p) => p.time ?? Infinity).sort((a, b) => a - b);
        margin += t[1] - t[0];
        winTime += t[0];
        if (t[1] - t[0] < 3) close++;
        const st = itemsOf(w.st);
        ITEM_IDS.forEach((id, i) => {
          items[id].uses += st.uses[i];
          items[id].hits += st.hits[i];
        });
        races++;
        void seen;
      }
  }
  return {
    races,
    placeChange: change / races,
    closeFinish: close / races,
    margin: margin / races,
    winTime: winTime / races,
    items,
    hitsPerKart: hits / races / 8,
    respawns: respawns / races,
  };
}

export function formatReport(r: BalanceReport): string {
  const rows = ITEM_IDS.map((id) => {
    const s = r.items[id];
    return `  ${id.padEnd(9)} uses ${String(s.uses).padStart(6)}  hits ${String(s.hits).padStart(6)}  rate ${s.uses ? ((100 * s.hits) / s.uses).toFixed(0).padStart(4) : '   –'} %`;
  });
  return [
    `races ${r.races}`,
    `place change lap 1 → finish ${r.placeChange.toFixed(2)} (target ≥ 1.5)`,
    `winner leads by < 3 s in ${(100 * r.closeFinish).toFixed(0)} % (target ≥ 70 %), mean margin ${r.margin.toFixed(2)} s, winner ${r.winTime.toFixed(1)} s`,
    `hits taken per kart per race ${r.hitsPerKart.toFixed(2)}, respawns per race ${r.respawns.toFixed(2)}`,
    ...rows,
  ].join('\n');
}
