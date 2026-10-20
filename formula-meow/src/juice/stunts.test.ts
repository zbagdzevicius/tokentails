/**
 * Iteration 3 juice (set pieces): callouts and the stunt combo, the announcer's stunt lines (never over "Final lap"),
 * the stunt SFX table, the tunnel's audio graph, the tunnel light streaks, the loop trail colours and the mini-map
 * icons. A real Kitchen Counter race by the phone bot drives the event-level checks.
 */
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { BoostSource, Surface, type RaceEvent } from '../types';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { GO_TICK } from '../core/sim/world';
import { raceConfig, stuntLab, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { buildTrack } from '../core/track/build';
import { THEMES } from '../core/track/themes';
import { CORE_EN } from '../ui/strings/core.en';
import { STUNT_BONUS, StuntTally, stuntFish } from './stunts';
import { AnnouncerLogic, ANNOUNCE_TEXT, LOW_LINES } from './audio/announcer';
import { cuesFor, cueLength } from './audio/sfx';
import { engineParams } from './audio/engine';
import { TUNNEL_AUDIO, TunnelAudio, type TunnelCtx } from './audio/tunnel';
import { TunnelFx, TUNNEL_FX } from './vfx/tunnel-fx';
import { boostColor } from './vfx/kart-fx';
import { drawPieceIcons } from '../core/hud/stunt-hud';

const ev = (type: RaceEvent['type'], kart: number, a?: number, b?: number, tick = GO_TICK + 600): RaceEvent => ({ tick, type, kart, a, b });

/** The phone bot's Kitchen Counter race (50cc, auto-gas, 3 laps): every set piece, every lap. */
function kitchenRace(): RaceEvent[] {
  const w = world(raceConfig(KITCHEN, { seed: 3, humans: [5], cls: 0 }));
  while (!w.done && w.tick < 60 * 240) {
    const o = playerBot(w.ctx, 5, 0.2);
    if (w.tick >= GO_TICK) o.gas = true;
    w.step([o]);
  }
  return w.st.events;
}

const race = kitchenRace();

describe('stunt tally and callouts', () => {
  it('a real race: every loop, landing and the first tunnel are called; clean stunts count and chain', () => {
    const tally = new StuntTally();
    const calls: string[] = [];
    for (const e of race) {
      const c = tally.onEvent(e, 5);
      if (c) calls.push(c.text);
    }
    for (let i = 0; i < 3; i++) {
      const c = tally.onTunnel();
      if (c) calls.push(c.text);
    }
    const s = tally.summary;
    expect(s.loops).toBe(3);
    expect(s.landings).toBe(3);
    expect(s.jumps).toBe(3);
    expect(s.nets).toBe(0);
    expect(s.tunnels).toBe(3);
    expect(s.clean).toBeGreaterThanOrEqual(6);
    expect(calls.filter((c) => c === 'LOOP-DE-MEOW!')).toHaveLength(3);
    expect(calls.filter((c) => c === 'BIG AIR!')).toHaveLength(3);
    expect(calls.filter((c) => c === 'NICE LANDING!')).toHaveLength(3);
    expect(calls.filter((c) => c === 'TUNNEL RUN!')).toHaveLength(1);
    expect(stuntFish(s)).toBe(Math.min(STUNT_BONUS.fishMax, s.clean));
  });

  it('rewards, never punishes: a net or a messy landing takes nothing away and does not end the combo', () => {
    const tally = new StuntTally();
    const me = 2;
    tally.onEvent(ev('stuntExit', me, 0, 1, 1000), me);
    expect(tally.summary.clean).toBe(1);
    const net = tally.onEvent(ev('netCatch', me, 0, 0, 1100), me);
    expect(net?.text).toBe('SAFETY NET!');
    tally.onEvent(ev('stuntExit', me, 2, 0, 1101), me); // the jump's messy exit
    expect(tally.summary.clean).toBe(1);
    expect(tally.comboAt(1200)).toBe(1);
    const land = tally.onEvent(ev('stuntLand', me, 40, 0, 1300), me);
    expect(land?.sub).toBe('STUNT COMBO ×{n}');
    expect(land?.n).toBe(2);
    expect(tally.summary.bestCombo).toBe(2);
    // the combo runs out with time only
    expect(tally.comboAt(1300 + STUNT_BONUS.comboTicks + 1)).toBe(0);
    // rivals never count
    expect(tally.onEvent(ev('stuntLand', 3, 40, 0, 1400), me)).toBeNull();
    expect(stuntFish({ clean: -3 })).toBe(0);
    expect(stuntFish({ clean: 99 })).toBe(STUNT_BONUS.fishMax);
  });

  it('every callout text and sub is in the string table', () => {
    const tally = new StuntTally();
    const out = [
      tally.onEvent(ev('stuntEnter', 1, 0), 1),
      tally.onEvent(ev('stuntEnter', 1, 1), 1),
      tally.onEvent(ev('stuntEnter', 1, 2), 1),
      tally.onEvent(ev('stuntLand', 1, 30), 1),
      tally.onEvent(ev('stuntExit', 1, 0, 1, GO_TICK + 700), 1),
      tally.onEvent(ev('stuntExit', 1, 1, 1, GO_TICK + 800), 1),
      tally.onEvent(ev('netCatch', 1), 1),
      tally.onTunnel(),
    ];
    for (const c of out) {
      if (!c) continue;
      expect(CORE_EN[c.text], c.text).toBeTruthy();
      if (c.sub) expect(CORE_EN[c.sub], c.sub).toBeTruthy();
    }
    for (const id of LOW_LINES) expect(CORE_EN[ANNOUNCE_TEXT[id]], id).toBeTruthy();
  });
});

describe('announcer: set-piece lines', () => {
  const me = 5;
  it('LOOP-DE-MEOW once a race, the tunnel once, the wall and big air with cooldowns', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('stuntEnter', me, 0, 0, 1000), me, 'race')).toBe('loopDeMeow');
    expect(a.onEvent(ev('stuntEnter', me, 0, 0, 5000), me, 'race')).toBeNull();
    expect(a.onTunnel(6000)).toBe('tunnelRun');
    expect(a.onTunnel(9000)).toBeNull();
    expect(a.onEvent(ev('stuntEnter', me, 1, 1, 10000), me, 'race')).toBe('wallRide');
    expect(a.onEvent(ev('stuntEnter', me, 1, 1, 10400), me, 'race')).toBeNull();
    expect(a.onEvent(ev('stuntEnter', me, 2, 2, 12000), me, 'race')).toBe('bigAir');
    // the landing follows the launch closely and is still called
    expect(a.onEvent(ev('stuntLand', me, 40, 2, 12040), me, 'race')).toBe('niceLanding');
    expect(a.onEvent(ev('stuntEnter', 2, 2, 2, 20000), me, 'race')).toBeNull();
    a.reset();
    expect(a.onEvent(ev('stuntEnter', me, 0, 0, 1000), me, 'race')).toBe('loopDeMeow');
  });

  it('never talks over "Final lap!" and never after the finish', () => {
    const a = new AnnouncerLogic();
    expect(a.onEvent(ev('finalLap', me, 0, 0, 3000), me, 'race')).toBe('finalLap');
    expect(a.onEvent(ev('stuntEnter', me, 0, 0, 3060), me, 'race')).toBeNull();
    expect(a.onEvent(ev('stuntLand', me, 30, 0, 3100), me, 'race')).toBeNull();
    expect(a.onTunnel(3150)).toBeNull();
    expect(a.onEvent(ev('stuntEnter', me, 0, 0, 3300), me, 'race')).toBe('loopDeMeow');
    a.onEvent(ev('finish', me, 2, 0, 4000), me, 'race');
    expect(a.onEvent(ev('stuntEnter', me, 2, 0, 5000), me, 'race')).toBeNull();
  });

  it('a real race: each stunt line at most as often as its rule allows', () => {
    const a = new AnnouncerLogic();
    const said: string[] = [];
    for (const e of race) {
      const id = a.onEvent(e, 5, 'race');
      if (id) said.push(id);
    }
    expect(said.filter((s) => s === 'loopDeMeow')).toHaveLength(1);
    expect(said.filter((s) => s === 'bigAir').length).toBeGreaterThanOrEqual(1);
    expect(said.filter((s) => s === 'niceLanding').length).toBeGreaterThanOrEqual(1);
    // the final-lap call is still made
    expect(said).toContain('finalLap');
  });
});

describe('sfx: set-piece cues', () => {
  const me = 4;
  it('loop rush and exit sting, wall hum, gap launch and landing, the net boing', () => {
    expect(cuesFor(ev('stuntEnter', me, 0), me)[0].id).toBe('loopRush');
    expect(cuesFor(ev('stuntExit', me, 0, 1), me)[0].id).toBe('loopOut');
    expect(cuesFor(ev('stuntEnter', me, 1), me)[0].id).toBe('wallOn');
    expect(cuesFor(ev('stuntExit', me, 1, 1), me)[0].id).toBe('wallOff');
    expect(cuesFor(ev('stuntExit', me, 1, 0), me)).toEqual([]);
    expect(cuesFor(ev('stuntEnter', me, 2), me)[0].id).toBe('gapLaunch');
    expect(cuesFor(ev('stuntLand', me, 40), me)[0].id).toBe('gapLand');
    expect(cuesFor(ev('netCatch', me), me)[0].id).toBe('net');
    // a rival's loop is heard only near, quietly, at the lowest priority
    const r = cuesFor(ev('stuntEnter', 1, 0), me)[0];
    expect(r).toMatchObject({ id: 'loopRush', prio: 0, near: 1 });
    expect(cuesFor(ev('stuntLand', 1, 40), me)).toEqual([]);
    expect(cueLength('loopRush')).toBeGreaterThan(1.5);
  });
  it('a wall lane mutes the drift squeal for a tyre hum; a loop revs the motor and adds wind', () => {
    const k = { driftDir: 1, driftTier: 2, boostTicks: 0, air: 0, spinTicks: 0 };
    const road = engineParams(0.9, k, true);
    expect(road.squeal).toBeGreaterThan(0);
    expect(road.hum).toBe(0);
    const wall = engineParams(0.9, { ...k, surface: Surface.WallRide }, true);
    expect(wall.squeal).toBe(0);
    expect(wall.whine).toBe(0);
    expect(wall.hum).toBeGreaterThan(0);
    expect(engineParams(0.9, { ...k, surface: Surface.WallRide }, false).hum).toBe(0);
    const loop = engineParams(0.9, { ...k, driftDir: 0, rail: 1 }, true);
    const flat = engineParams(0.9, { ...k, driftDir: 0 }, true);
    expect(loop.hz).toBeGreaterThan(flat.hz);
    expect(loop.wind).toBeGreaterThan(flat.wind);
  });
});

/** A minimal AudioContext stand-in: records each param's last scheduled target and the connections. */
function fakeCtx(): TunnelCtx & { edges: Array<[string, string]> } {
  const edges: Array<[string, string]> = [];
  const param = (v: number) => {
    const p = {
      value: v,
      target: v,
      cancelScheduledValues: () => p,
      setTargetAtTime: (x: number) => {
        p.target = x;
        return p;
      },
      setValueAtTime: (x: number) => {
        p.value = x;
        p.target = x;
        return p;
      },
    };
    return p;
  };
  const node = (name: string, extra: Record<string, unknown>) => {
    const n = { name, ...extra, connect: (o: { name: string }) => (edges.push([name, o.name]), o) };
    return n;
  };
  let id = 0;
  return {
    edges,
    currentTime: 1,
    sampleRate: 48000,
    createBiquadFilter: () => node(`lp${id++}`, { type: 'lowpass', frequency: param(350), Q: param(1) }) as unknown as BiquadFilterNode,
    createDelay: () => node(`delay${id++}`, { delayTime: param(0) }) as unknown as DelayNode,
    createGain: () => node(`gain${id++}`, { gain: param(1) }) as unknown as GainNode,
  };
}

describe('tunnel audio', () => {
  it('builds the low-pass and the echo, closes them in a tunnel and restores them outside', () => {
    const ctx = fakeCtx();
    const out = { name: 'master' } as unknown as AudioNode;
    const tn = new TunnelAudio(ctx, out);
    const f = tn.lp.frequency as unknown as { value: number; target: number };
    const wet = tn.wet.gain as unknown as { value: number; target: number };
    expect(f.value).toBe(20000);
    expect(wet.value).toBe(0);
    expect((tn.delay.delayTime as unknown as { value: number }).value).toBeCloseTo(TUNNEL_AUDIO.delay);
    expect((tn.fb.gain as unknown as { value: number }).value).toBeCloseTo(TUNNEL_AUDIO.feedback);
    // send → delay ⇄ feedback, delay → wet → master
    const names = (a: { name?: string }) => (a as { name: string }).name;
    expect(ctx.edges).toContainEqual([names(tn.send as never), names(tn.delay as never)]);
    expect(ctx.edges).toContainEqual([names(tn.delay as never), names(tn.fb as never)]);
    expect(ctx.edges).toContainEqual([names(tn.fb as never), names(tn.delay as never)]);
    expect(ctx.edges).toContainEqual([names(tn.wet as never), 'master']);
    expect(tn.engineTrim).toBe(1);
    expect(tn.set(true)).toBe(true);
    expect(tn.set(true)).toBe(false);
    expect(f.target).toBe(TUNNEL_AUDIO.lpHz);
    expect(wet.target).toBeCloseTo(TUNNEL_AUDIO.wet);
    expect(20 * Math.log10(tn.engineTrim)).toBeCloseTo(3, 1);
    tn.set(false);
    expect(f.target).toBe(20000);
    expect(wet.target).toBe(0);
    tn.set(true);
    tn.reset();
    expect(tn.inside).toBe(false);
    expect(f.value).toBe(20000);
    expect(wet.value).toBe(0);
  });
});

describe('tunnel light streaks', () => {
  it('draw only inside a tunnel (one mesh), stretch with speed, and hide under reduced motion', () => {
    const def = stuntLab();
    const t = buildTrack(def);
    const scene = new Scene();
    const fx = new TunnelFx(scene, t, THEMES[0]);
    const w = world(raceConfig(def, { humans: [0], solo: true }));
    const k = w.st.karts[0];
    const pc = t.pieces.find((p) => p.kind === 'tunnel')!;
    // outside: nothing
    k.si = (pc.i0 - 60 + t.n) % t.n;
    fx.update(w.st, 0, 0, 30, 1 / 60, false);
    expect(fx.drawn).toBe(0);
    // inside, fully blended in
    k.si = pc.i0 + 3;
    for (let n = 0; n < 30; n++) fx.update(w.st, 0, 1, 30, 1 / 60, false);
    expect(fx.drawn).toBeGreaterThan(4);
    expect(fx.drawn).toBeLessThanOrEqual(TUNNEL_FX.streaks);
    expect(scene.children.filter((c) => c.name === 'fm-tunnel-streaks')).toHaveLength(1);
    // every drawn streak sits inside the tunnel's footprint (between its portals)
    const m = fx.mesh;
    const p = { x: 0, z: 0 };
    for (let i = 0; i < m.count; i++) {
      const e = new Float32Array(16);
      m.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v, j) => (e[j] = v));
      p.x = e[12];
      p.z = e[14];
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < t.n; j++) {
        const d = (t.px[j] - p.x) ** 2 + (t.pz[j] - p.z) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      expect(t.tunnelMask[best]).toBe(1);
    }
    // reduced motion fades them out
    for (let n = 0; n < 60; n++) fx.update(w.st, 0, 1, 30, 1 / 60, true);
    expect(fx.drawn).toBe(0);
    fx.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('vfx and hud bits', () => {
  it('stunt boosts burn their own colour; the mini-map gets one icon per piece', () => {
    expect(boostColor(BoostSource.Stunt, 1, THEMES[0])).toBe(0x2cf6f3);
    const t = buildTrack(stuntLab());
    const ops: string[] = [];
    const g = new Proxy(
      {},
      {
        get: (_o, k) => (typeof k === 'string' && !['strokeStyle', 'fillStyle', 'lineWidth', 'lineCap', 'lineJoin'].includes(k) ? (...args: number[]) => ops.push(`${k}:${args.every((a) => Number.isFinite(a))}`) : undefined),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    expect(drawPieceIcons(g, t, (x, z) => [x, z])).toBe(4);
    expect(ops.some((o) => o.startsWith('arc'))).toBe(true);
    expect(ops.every((o) => o.endsWith('true'))).toBe(true);
  });
});
