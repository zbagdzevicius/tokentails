/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §8): the 5v5 Classic client. The snapshot's map trailer (Hearthwood only, a
 * Crossing snapshot keeps its v18 bytes), the mode toggle, the main-thread map binding and camera yaw, the announcer
 * copy, the 8-slice wheel, the scoreboard's 5 rows and the Hearthwood scenery helpers.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMatch, fillPicks, snapshot, step } from '../../src/sim/index';
import { decodeSnap, encodeSnap, HEADER_BYTES, ENTITY_BYTES, PROJECTILE_BYTES, ZONE_BYTES, FUN_HEAD, FUN_YARN } from '../../src/host/protocol';
import { HostCore } from '../../src/host/host-core';
import { MODE_MAP, matchModeHtml, modeOfMap } from '../../src/ui/lobby/matchMode';
import { playLine } from '../../src/ui/lobby/lobbyScreen';
import { currentMap, useMap } from '../../src/app/mapBinding';
import { cameraYaw, CAMERA_YAW, setViewTeam } from '../../src/render/coords';
import { MAP } from '../../src/data/map';
import { SLOTS_PER_TEAM, SLOT_COUNT } from '../../src/sim/api';
import { laneLabel, objectiveLine } from '../../src/render/effects';
import { CLASSIC_WHEEL_KINDS, WHEEL_KINDS, chipPing, wheelKinds, wheelSlice } from '../../src/ui/pingText';
import { PING_KIND } from '../../src/data/pings';
import { teamLabel } from '../../src/ui/scoreboard';
import { mapInfo } from '../../src/sim/map/info';
import { hwLanes, hwLanterns, hwOuterTrees, hwWalkable, wallPit } from '../../src/render/views/hearthwoodView';
import { gateLines } from '../../src/render/fx/lifecycleGate';
import { lanePoints, bushList } from '../../src/ui/minimap';
import { bushCount } from '../../src/render/bushClear';

afterEach(() => {
  useMap('crossing');
  setViewTeam(0);
});

describe('snapshot map trailer', () => {
  it('round-trips Hearthwood objectives and camps', () => {
    const { picks, tricks } = fillPicks(7, 'sage', 'hiss', 'hearthwood');
    const m = createMatch({ seed: 7, picks, tricks, difficulty: 'normal', map: 'hearthwood' });
    for (let i = 0; i < 40; i++) step(m);
    const s = snapshot(m, 0);
    expect(s.map).toBe('hearthwood');
    const d = decodeSnap(encodeSnap(s));
    expect(d.map).toBe('hearthwood');
    expect(d.objectives).toEqual(s.objectives);
    expect(d.camps).toEqual(s.camps);
    useMap('crossing');
  });

  it('a Crossing snapshot has no map trailer (sim v21: only the fun trailer, 28 B + 12 B a yarn ball)', () => {
    const { picks, tricks } = fillPicks(3, 'clem', 'pounce');
    const m = createMatch({ seed: 3, picks, tricks, difficulty: 'normal' });
    for (let i = 0; i < 40; i++) step(m);
    const s = snapshot(m, 0);
    const buf = encodeSnap(s);
    expect(buf.byteLength).toBe(HEADER_BYTES + s.entities.length * ENTITY_BYTES + s.projectiles.length * PROJECTILE_BYTES + s.zones.length * ZONE_BYTES + FUN_HEAD + s.fun!.yarn.length * FUN_YARN);
    expect(decodeSnap(buf).map).toBeUndefined();
  });

  it('the local host starts a 10-slot match on Hearthwood and says so in welcome', () => {
    const h = new HostCore();
    const w = h.join({ t: 'join', slot: 0, hero: 'sage', trick: 'hiss', difficulty: 'normal', seed: 11, map: 'hearthwood' });
    expect(w.map).toBe('hearthwood');
    expect(w.picks).toHaveLength(10);
    const c = new HostCore().join({ t: 'join', slot: 0, hero: 'sage', trick: 'hiss', difficulty: 'normal', seed: 11 });
    expect(c.map).toBeUndefined();
    expect(c.picks).toHaveLength(6);
    useMap('crossing');
  });
});

describe('mode toggle', () => {
  it('maps modes to maps and renders a radio group', () => {
    expect(MODE_MAP.classic).toBe('hearthwood');
    expect(modeOfMap('hearthwood')).toBe('classic');
    expect(modeOfMap(undefined)).toBe('quick');
    const html = matchModeHtml('classic');
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/data-v="classic"[^>]*>|aria-checked="true"[^>]*data-v="classic"/);
  });

  it('the line under Play names the mode', () => {
    expect(playLine({ firstTime: false, dare: null, last: { hero: 'clem', trick: 'pounce', difficulty: 'normal', map: 'hearthwood' } })).toMatch(/^5v5 Classic vs/);
    expect(playLine({ firstTime: false, dare: null, last: { hero: 'clem', trick: 'pounce', difficulty: 'normal' } })).toMatch(/^3v3 vs/);
  });
});

describe('main-thread map binding', () => {
  it('binds Hearthwood (slots, size, yaw 0) and goes back to Crossing', () => {
    useMap('hearthwood');
    expect(currentMap()).toBe('hearthwood');
    expect(MAP.width).toBe(128000);
    expect(SLOTS_PER_TEAM).toBe(5);
    expect(SLOT_COUNT).toBe(10);
    expect(bushCount()).toBe(mapInfo('hearthwood').bushes.length);
    setViewTeam(0);
    expect(cameraYaw()).toBeCloseTo(0, 6);
    setViewTeam(1);
    expect(cameraYaw()).toBeCloseTo(Math.PI, 6);
    useMap('crossing');
    setViewTeam(0);
    expect(cameraYaw()).toBeCloseTo(CAMERA_YAW, 6);
    expect(SLOTS_PER_TEAM).toBe(3);
  });
});

describe('announcer copy', () => {
  it('calls Grizzlechop up, taken by us or them, and a stolen buff', () => {
    expect(objectiveLine({ type: 'objectiveSpawn', tick: 1, kind: 'grizzlechop' }, 0, 0)?.title).toMatch(/Grizzlechop/);
    expect(objectiveLine({ type: 'objectiveSpawn', tick: 1, kind: 'pudding' }, 0, 0)).toBeNull();
    expect(objectiveLine({ type: 'objective', tick: 1, kind: 'grizzlechop', team: 0, slot: 0 }, 0, 0)).toMatchObject({ tone: 'good', title: 'You sank Grizzlechop!' });
    expect(objectiveLine({ type: 'objective', tick: 1, kind: 'grizzlechop', team: 1, slot: 7 }, 0, 0)?.tone).toBe('bad');
    useMap('hearthwood');
    expect(objectiveLine({ type: 'buffSteal', tick: 1, id: 2, from: 7, kind: 'prickle' }, 0, 0)?.title).toBe('Prickle Coat stolen!');
    expect(objectiveLine({ type: 'buffSteal', tick: 1, id: 6, from: 0, kind: 'feather' }, 0, 0)?.title).toBe('They stole our Crow Feather');
  });

  it('names the Hearthwood lanes for a fallen tower', () => {
    useMap('hearthwood');
    expect(laneLabel(8000, 80000)).toBe('Fenceline');
    expect(laneLabel(80000, 8000)).toBe('Gutterway');
    expect(laneLabel(46000, 46000)).toBe('Yarn Road');
    expect(laneLabel(21500, 12500)).toBe('Base');
    useMap('crossing');
    expect(laneLabel(34000, 51000)).toBe('Sunny Lane');
  });
});

describe('ping wheel', () => {
  it('5v5 Classic swaps Sunny / Puddle for the three lanes and Grizzlechop', () => {
    expect(wheelKinds(false)).toBe(WHEEL_KINDS);
    expect(CLASSIC_WHEEL_KINDS).toHaveLength(8);
    expect(CLASSIC_WHEEL_KINDS).not.toContain(PING_KIND.PushSunny);
    expect(CLASSIC_WHEEL_KINDS).toEqual(expect.arrayContaining([PING_KIND.PushFence, PING_KIND.PushYarn, PING_KIND.PushGutter, PING_KIND.Grizzlechop]));
    expect(wheelSlice(0, -60, 26, 8)).toBe(0);
    expect(wheelSlice(60, 0, 26, 8)).toBe(2);
    expect(chipPing('sinkGrizzlechop')).toBe(PING_KIND.Grizzlechop);
  });
});

describe('scoreboard and team names', () => {
  it('reads each team by its own first slot on 10 picks', () => {
    const cats = ['clem', 'sage', 'brutus', 'lambo', 'aviete'] as const;
    const dogs = ['bravo', 'chili', 'howler', 'rocket', 'nugget'] as const;
    expect(teamLabel([...cats, ...dogs], 1)).toBe('Woof pack');
    expect(teamLabel([...cats, ...dogs], 0)).toBe('Purrhaven cats');
  });
});

describe('Hearthwood scenery', () => {
  const info = mapInfo('hearthwood');
  it('has three lanes, lanterns on walkable ground and both pits recognised', () => {
    expect(hwLanes(info).map((l) => l.id)).toEqual(['fence', 'yarn', 'gutter']);
    const lamps = hwLanterns(info);
    expect(lamps.length).toBeGreaterThan(6);
    for (const p of lamps) expect(hwWalkable(info, p.x, p.y)).toBe(true);
    const kinds = new Set(info.walls.map((r) => wallPit(info, r)));
    expect(kinds).toEqual(new Set(['grizzlechop', 'pudding', null]));
  });

  it('the far forest stays off the map', () => {
    const W = info.width / 1000;
    for (const t of hwOuterTrees(info)) expect(t.x < 0 || t.y < 0 || t.x > W || t.y > W).toBe(true);
  });

  it('draws one diagonal start-gate fence per base, point-reflected', () => {
    useMap('hearthwood');
    const g = gateLines();
    expect(g).toHaveLength(2);
    expect(g[0].cx + g[0].cy).toBeCloseTo(26, 3);
    expect(g[1].cx).toBeCloseTo(128 - g[0].cx, 3);
    expect(g[1].cy).toBeCloseTo(128 - g[0].cy, 3);
    useMap('crossing');
    expect(gateLines().every((l) => l.angle === 0)).toBe(true);
  });

  it('the minimap reads lanes and bushes from the bound map', () => {
    useMap('hearthwood');
    expect(lanePoints('yarn')[0]).toEqual([16000, 16000]);
    expect(lanePoints('yarn').at(-1)).toEqual([112000, 112000]);
    expect(bushList()).toHaveLength(info.bushes.length);
    useMap('crossing');
    expect(lanePoints('sunny').at(-1)).toEqual([90000, 30000]);
  });
});
