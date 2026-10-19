import { describe, expect, it } from 'vitest';
import { packInput, SIM_VERSION, unpackInput } from '../../types';
import { KITCHEN, trackById } from '../../core/track/tracks';
import { buildField, createSimPlugins } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import { SimWorld } from '../../core/sim/world';
import { simulate } from '../../core/sim/replay';
import { decodeGhost, encodeGhost, encodeGhostSync, peekGhost, trackKey } from './ghost-codec';
import { decodeCat, encodeCat } from './cat-codec';
import { DEFAULT_CAT } from '../../types';

const SLOT = 5;

function botRace(seed: number) {
  const cfg = { track: KITCHEN, seed, cls: 0 as const, modifiers: 0, racers: buildField({ seed, cls: 0, playerSlot: SLOT }), humans: [SLOT], forgiving: true };
  const w = new SimWorld(cfg, createSimPlugins());
  const inputs: number[] = [];
  while (!w.done && w.tick < 60 * 200) {
    const i = playerBot(w.ctx, SLOT);
    inputs.push(packInput(i));
    w.step([unpackInput(packInput(i))]);
  }
  return { cfg, inputs, time: w.st.karts[SLOT].finishTime / 60, finished: w.st.karts[SLOT].finished };
}

describe('ghost codec (GDD 8.1)', () => {
  it('round-trips the header and every input, deflated and plain', async () => {
    const inputs = [0x17, 0x17, 0x17, 0x18, 0x5c, 0x5c, 0x9e, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0x117];
    const h = { trackKey: trackKey('kitchen'), seed: -12345, cls: 2 as const, modifiers: 1, forgiving: true, slot: 5 };
    for (const code of [encodeGhostSync(h, inputs), await encodeGhost(h, inputs)]) {
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
      const g = await decodeGhost(code);
      expect(g).not.toBeNull();
      expect(g!.inputs).toEqual(inputs);
      expect(g!.seed).toBe(-12345);
      expect(g!.cls).toBe(2);
      expect(g!.modifiers).toBe(1);
      expect(g!.forgiving).toBe(true);
      expect(g!.slot).toBe(5);
      expect(g!.simVersion).toBe(SIM_VERSION);
      expect(peekGhost(code)?.trackKey).toBe(trackKey('kitchen'));
    }
  });

  it('rejects a flipped character, a wrong version and junk', async () => {
    const code = encodeGhostSync({ trackKey: 1, seed: 2, cls: 0, modifiers: 0, forgiving: false, slot: 5 }, [0x17, 0x17, 0x18]);
    const flip = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
    expect(await decodeGhost(flip)).toBeNull();
    expect(peekGhost('hello')).toBeNull();
    expect(await decodeGhost('')).toBeNull();
    expect(await decodeGhost('!!!!!!!!!!!!')).toBeNull();
  });

  it('a recorded bot race re-simulates from its link to the same finish time, and the link stays small', async () => {
    const run = botRace(7);
    expect(run.finished).toBe(1);
    const fin = run.inputs.length;
    const code = await encodeGhost({ trackKey: trackKey(run.cfg.track.id), seed: run.cfg.seed, cls: run.cfg.cls, modifiers: 0, forgiving: true, slot: SLOT }, run.inputs.slice(0, fin));
    // GDD 8.1: ≤ 1.5 kB after deflate for a ~90 s race (base64url adds a third)
    expect(code.length).toBeLessThan(2600);
    const g = (await decodeGhost(code))!;
    const track = [KITCHEN].find((t) => trackKey(t.id) === g.trackKey) ?? trackById(null);
    const cfg = { track, seed: g.seed, cls: g.cls, modifiers: g.modifiers, racers: buildField({ seed: g.seed, cls: g.cls, playerSlot: g.slot }), humans: [g.slot], forgiving: g.forgiving };
    const re = simulate(cfg, createSimPlugins(), { inputs: g.inputs });
    expect(re.world.st.karts[SLOT].finishTime / 60).toBe(run.time);
  });
});

describe('cat codec (copied)', () => {
  it('round-trips the default cat in 18 characters', () => {
    const c = encodeCat(DEFAULT_CAT);
    expect(c).toHaveLength(18);
    const d = decodeCat(c, 'Tofu')!;
    expect(d.base).toBe(DEFAULT_CAT.base);
    expect(d.pattern).toBe(DEFAULT_CAT.pattern);
  });
});
