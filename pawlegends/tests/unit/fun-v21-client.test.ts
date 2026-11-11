/**
 * Sim v21 client side (docs/plans/moba/V21-FUN.md §1.5, §1.6): the snapshot's fun trailer, the FIRE aim, the
 * announcer's cannon moments, the KABOOM dare line and the leap arc.
 */
import { describe, expect, it } from 'vitest';
import { decodeSnap, encodeSnap } from '../../src/host/protocol';
import { BuffFlag, type Snapshot } from '../../src/sim/api';
import { carriesCannon, dragFireAim, quickFireAim } from '../../src/input/fireAim';
import { Announcer } from '../../src/render/announcer';
import { dareText, kaboomDare } from '../../src/share/dare';
import { LEAP, leapLift } from '../../src/render/views/funView';
import type { Unit } from '../../src/input/targeting';
import { CMD_SIZE } from '../../src/net/proto';
import { OP_SIZE } from '../../src/sim/commands';
import { Op } from '../../src/sim/api';

const snap = (fun?: Snapshot['fun']): Snapshot => ({
  team: 0,
  clock: { tick: 100, seconds: 3, phase: 'play', nextPhaseIn: 0 },
  score: { kills: [0, 0], towers: [0, 0] },
  entities: [],
  projectiles: [],
  zones: [],
  events: [],
  ...(fun ? { fun } : {}),
});

describe('sim v21 snapshot fun trailer', () => {
  it('round-trips the cannon and the yarn balls', () => {
    const fun: NonNullable<Snapshot['fun']> = {
      cannon: { state: 'carried', x: 50000, y: 36000, by: 4, fuse: 420, nextIn: -1, windup: 12, ax: 61000, ay: 30250 },
      yarn: [
        { state: 'rest', x: 50000, y: 46000 },
        { state: 'rolling', x: 52345, y: 14000 },
      ],
    };
    expect(decodeSnap(encodeSnap(snap(fun))).fun).toEqual(fun);
  });

  it('a snapshot without the block decodes without it', () => {
    expect(decodeSnap(encodeSnap(snap())).fun).toBeUndefined();
  });

  it('the relay frames Op.Fire with the sim codec size', () => {
    expect(CMD_SIZE[Op.Fire]).toBe(OP_SIZE[Op.Fire]);
  });
});

describe('FIRE aim (sim v21)', () => {
  const me = { x: 30000, y: 30000, team: 0 };
  const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, state: Unit['state'] = 'idle'): Unit => ({ id, kind, team, x, y, hp: 100, maxHp: 100, state });

  it('the Cannon buff bit says who carries it', () => {
    expect(carriesCannon(BuffFlag.Cannon | BuffFlag.Hasted)).toBe(true);
    expect(carriesCannon(BuffFlag.Hasted)).toBe(false);
    expect(carriesCannon(undefined)).toBe(false);
  });

  it('a tap aims at the nearest living enemy hero in range, else straight ahead', () => {
    const units = [u(3, 'hero', 1, 40000, 30000), u(4, 'hero', 1, 36000, 30000, 'dead'), u(5, 'minion', 1, 31000, 30000), u(1, 'hero', 0, 31000, 30000)];
    expect(quickFireAim(units, me, 0, 16000)).toEqual({ x: 40000, y: 30000 });
    const far = [u(3, 'hero', 1, 60000, 30000)];
    const p = quickFireAim(far, me, Math.PI / 2, 16000);
    expect(Math.round(p.x)).toBe(30000);
    expect(Math.round(p.y)).toBe(46000);
  });

  it('a drag aims at full range along the thumb', () => {
    expect(dragFireAim(me, 3, 4, 10000)).toEqual({ x: 36000, y: 38000 });
    expect(dragFireAim(me, 0, 0, 10000)).toBeNull();
  });
});

describe('announcer cannon moments (sim v21)', () => {
  it('a KABOOM by the player is a big banner with slow-mo and the match best moment "KABOOM on <victim>"', () => {
    const a = new Announcer(0, 0, (s) => ['Clem', 'Sage', 'Brutus', 'Rocket', 'Chili', 'Bravo'][s]);
    const out = a.feed({ type: 'kaboom', tick: 2800, src: 0, dst: 3 });
    expect(out[0]).toMatchObject({ key: 'kaboom', title: 'KABOOM!', size: 'banner', crowd: 'roar' });
    expect(out[0].slowmo).toEqual({ ms: 900, scale: 0.3 });
    expect(a.bestMoment?.title).toBe('KABOOM on Rocket');
    expect(a.kabooms).toBe(1);
  });

  it('pick-ups name the team; a fumble and a parry have their callouts', () => {
    const a = new Announcer(0, 0, (s) => `Hero ${s}`);
    expect(a.feed({ type: 'cannonPick', tick: 1, id: 4, team: 1, steal: true })[0]).toMatchObject({ key: 'cannonTheirs', sub: 'Hero 4 stole it' });
    expect(a.feed({ type: 'cannonPick', tick: 2, id: 1, team: 0, steal: false })[0]).toMatchObject({ key: 'cannonOurs' });
    expect(a.feed({ type: 'cannonDrop', tick: 3, id: 1, x: 0, y: 0, why: 'fumble' })[0]).toMatchObject({ key: 'fumble', title: 'Fumble!' });
    expect(a.feed({ type: 'cannonParry', tick: 4, id: 0 })[0]).toMatchObject({ key: 'returnToSender', title: 'Return to sender!' });
    expect(a.feed({ type: 'yarnStrike', tick: 5, id: 0, n: 3 })[0]).toMatchObject({ key: 'strike', title: 'STRIKE!' });
  });
});

describe('announcer Guard block (sim v21)', () => {
  it("Brutus's block is a 'Blocked!' banner every player sees, and his own player's best moment", () => {
    const names = (s: number) => `Hero ${s}`;
    const brutus = new Announcer(2, 0, names);
    const out = brutus.feed({ type: 'cannonBlock', tick: 9, id: 2, src: 3, x: 0, y: 0 });
    expect(out[0]).toMatchObject({ key: 'cannonBlock', title: 'Blocked!', size: 'banner', tone: 'gold', sub: 'You took the kibble on the Guard' });
    expect(brutus.bestMoment?.key).toBe('cannonBlock');
    const enemy = new Announcer(3, 1, names);
    expect(enemy.feed({ type: 'cannonBlock', tick: 9, id: 2, src: 3, x: 0, y: 0 })[0]).toMatchObject({ key: 'cannonBlock', tone: 'bad', sub: 'Hero 2 took the kibble on the Guard' });
    expect(enemy.bestMoment).toBeFalsy();
  });
});

describe('KABOOM dare and leap arc (sim v21)', () => {
  it('the dare leads with the KABOOM', () => {
    const line = dareText({ seed: 0, hero: 'clem', trick: 'pounce', difficulty: 'normal', seconds: 432 });
    expect(kaboomDare('KABOOM on Brutus', line)).toBe(`I KABOOMed Brutus with the Kibble Cannon. ${line}`);
    expect(kaboomDare('Triple Pounce', line)).toBe(line);
    expect(kaboomDare(null, line)).toBe(line);
  });

  it('the leap peaks mid-flight and lands at 0', () => {
    expect(leapLift(0)).toBe(0);
    expect(leapLift(LEAP.secs)).toBe(0);
    expect(leapLift(LEAP.secs / 2)).toBeCloseTo(LEAP.peak, 5);
  });
});
