/**
 * SimWorld (GDD 3.1): `race = f(trackDef, seed, class, modifiers, SIM_VERSION, humanInputs[])`. One fixed step per
 * call to `step`. AI drivers, item rolls and hazards all live inside, so a race replays exactly from its inputs.
 *
 * Tick order: countdown → inputs (human / AI / autopilot) → item use → kart physics → contacts → slipstream →
 * item boxes → items.step (plugins) → laps → positions → hash.
 */
import { NO_INPUT, SIM_VERSION, type RaceConfig, type RaceEvent, type RaceResult, type RaceState, type TickInput } from '../../types';
import { RACE, classTuning, ticks } from '../../tuning';
import { buildTrack, gridSlot, type BuiltTrack } from '../track/build';
import { queryTrack } from '../track/query';
import { newKart, stepKart } from './kart';
import { stepContacts, stepSlipstream } from './contact';
import { raceOver, stepCountdown, stepLaps, stepPositions } from './race';
import { hashState } from './hash';
import { STREAM, streamSeed } from './rng';
import { followLine } from './autopilot';
import type { SimContext, SimPlugins } from './plugins';

export const GO_TICK = ticks(RACE.countdown);

export class SimWorld {
  readonly track: BuiltTrack;
  readonly st: RaceState;
  readonly ctx: SimContext;
  readonly tailTicks: number;
  readonly maxTicks: number;
  private readonly inp: TickInput[];

  constructor(
    readonly cfg: RaceConfig,
    readonly plugins: SimPlugins,
    track?: BuiltTrack,
  ) {
    this.track = track ?? buildTrack(cfg.track, cfg.modifiers);
    const n = cfg.racers.length;
    this.st = {
      tick: 0,
      phase: 'countdown',
      karts: [],
      boxes: this.track.boxes.map((b) => ({ x: b.x, y: b.y, z: b.z, s: b.s, respawn: 0 })),
      events: [],
      order: [],
      laps: cfg.track.laps,
      lapLength: this.track.length,
      firstFinishTick: -1,
      rngHazards: streamSeed(cfg.seed, STREAM.hazards),
      items: {},
    };
    const st = this.st;
    this.ctx = {
      st,
      track: this.track,
      cfg,
      tun: classTuning(cfg.cls),
      goTick: GO_TICK,
      emit: (e) => {
        st.events.push({ ...e, tick: st.tick } as RaceEvent);
      },
    };
    for (let i = 0; i < n; i++) {
      const k = newKart();
      const g = gridSlot(this.track, i);
      k.x = g.x;
      k.z = g.z;
      k.heading = g.heading;
      const h = queryTrack(this.track, g.x, g.z, g.si, { i: 0, s: 0, d: 0, y: 0, surface: 0 });
      k.y = h.y;
      k.si = h.i;
      k.s = h.s;
      k.d = h.d;
      k.dist = g.dist;
      k.progDist = g.dist;
      k.place = i + 1;
      k.rngItems = streamSeed(cfg.seed, STREAM.items, i);
      k.rngAi = streamSeed(cfg.seed, STREAM.ai, i);
      st.karts.push(k);
      st.order.push(i);
    }
    this.tailTicks = cfg.tailTicks ?? ticks(RACE.tail);
    this.maxTicks = ticks(RACE.maxTime);
    this.inp = st.karts.map(() => ({ ...NO_INPUT }));
    plugins.ai.init?.(this.ctx);
    plugins.items.init?.(this.ctx);
  }

  get tick(): number {
    return this.st.tick;
  }

  get done(): boolean {
    return this.st.phase === 'done';
  }

  /** Advance one tick. `humanInputs[j]` drives kart `cfg.humans[j]`. */
  step(humanInputs: readonly TickInput[] = []): void {
    const { st, ctx, cfg, plugins } = this;
    if (st.phase === 'done') return;
    stepCountdown(ctx);

    // inputs
    for (let i = 0; i < st.karts.length; i++) {
      const out = this.inp[i];
      const k = st.karts[i];
      const h = cfg.humans.indexOf(i);
      if (k.autoTicks > 0 && st.phase === 'race') {
        followLine(ctx, i, out, 0);
        out.drift = false;
      } else if (h >= 0 && !k.finished) {
        const src = humanInputs[h] ?? NO_INPUT;
        out.steer = src.steer;
        out.gas = src.gas;
        out.brake = src.brake;
        out.drift = src.drift;
        out.item = src.item;
        out.itemBack = src.itemBack;
      } else if (cfg.racers[i]?.ai || k.finished) {
        plugins.ai.drive(ctx, i, out);
        if (cfg.racers[i]?.ai == null) k.topScale = 1;
      } else {
        Object.assign(out, NO_INPUT);
      }
      if (k.topScale > 1) k.topScale = 1;
    }

    // item use (press edge, roulette over)
    if (st.phase === 'race') {
      for (let i = 0; i < st.karts.length; i++) {
        const k = st.karts[i];
        const out = this.inp[i];
        const edge = out.item && !k.pItem;
        k.pItem = out.item ? 1 : 0;
        if (k.rouletteTicks > 0 && --k.rouletteTicks === 0 && k.item) ctx.emit({ type: 'itemReady', kart: i, item: k.item });
        if (edge && k.item && k.rouletteTicks === 0 && k.respawnTicks === 0 && k.spinTicks === 0) {
          const id = k.item;
          plugins.items.use(ctx, i, out.itemBack);
          ctx.emit({ type: 'itemUse', kart: i, item: id, a: out.itemBack ? 1 : 0 });
        }
      }
    }

    for (let i = 0; i < st.karts.length; i++) stepKart(ctx, i, this.inp[i]);
    if (st.phase === 'race') {
      stepContacts(ctx);
      stepSlipstream(ctx);
      this.stepBoxes();
      plugins.items.step?.(ctx);
      stepLaps(ctx);
    }
    stepPositions(ctx);
    st.tick++;
    if (st.phase === 'race' && raceOver(ctx, this.tailTicks, this.maxTicks)) st.phase = 'done';
  }

  private stepBoxes(): void {
    const { st, ctx, plugins } = this;
    const r2 = RACE.boxRadius * RACE.boxRadius;
    for (const b of st.boxes) {
      if (b.respawn > 0) {
        b.respawn--;
        continue;
      }
      for (let i = 0; i < st.karts.length; i++) {
        const k = st.karts[i];
        if (k.respawnTicks > 0) continue;
        const dx = k.x - b.x;
        const dz = k.z - b.z;
        const dy = k.y + 0.6 - b.y;
        if (dx * dx + dz * dz + dy * dy > r2) continue;
        // a kart that already holds an item passes through without breaking the box
        if (k.item || k.rouletteTicks > 0) continue;
        b.respawn = ticks(RACE.boxRespawn);
        if (!k.item && k.rouletteTicks === 0) {
          const id = plugins.items.roll(ctx, i);
          k.item = id;
          k.itemCount = plugins.items.charges?.(id) ?? 1;
          k.rouletteTicks = ticks(RACE.roulette);
          ctx.emit({ type: 'itemPickup', kart: i, item: id });
        }
        break;
      }
    }
  }

  /** State hash (GDD 3.1), including the items lane's slot. */
  hash(): number {
    const items = this.plugins.items;
    return hashState(this.st, items.hash ? (h) => items.hash!(this.st, h) : undefined);
  }

  /** Remove events up to and including index `n` (the shell drains the log each frame). */
  takeEvents(from: number): RaceEvent[] {
    return this.st.events.slice(from);
  }

  /**
   * Result for the results screen. Karts that did not finish get a projected place by distance and no time.
   */
  result(): RaceResult {
    const { st, cfg } = this;
    const places = st.order.map((kart, p) => {
      const k = st.karts[kart];
      return {
        kart,
        name: cfg.racers[kart]?.name ?? `Cat ${kart + 1}`,
        place: p + 1,
        time: k.finished ? k.finishTime / 60 : null,
        bestLap: k.bestLapTicks > 0 ? k.bestLapTicks / 60 : null,
      };
    });
    const me = cfg.humans[0] ?? 0;
    const mine = places.find((p) => p.kart === me)!;
    return {
      places,
      player: { kart: me, place: mine.place, time: mine.time, bestLap: mine.bestLap },
      trackId: cfg.track.id,
      cls: cfg.cls,
      seed: cfg.seed,
      simVersion: SIM_VERSION,
    };
  }
}
