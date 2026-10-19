import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KITCHEN, ROOFTOPS } from '../../core/track/tracks';
import { SimWorld } from '../../core/sim/world';
import { createSimPlugins } from '../../items-ai';
import { decodeGhost, encodeGhost, trackKey } from '../../share/codec/ghost-codec';
import { SIM_VERSION } from '../../types';
import { registerModesRules } from '../sim-rules';
import { devGhostJob, devRacer, medalFor, medalTimes, replayJob, runSync, trackSig, ttConfig } from './ghosts';
import { TT_CATNIPS, TT_CHECKS_PER_LAP } from './rules';

registerModesRules();

describe('time trial', () => {
  it('starts with three Catnips, no item boxes and the field is the player alone', () => {
    const cfg = ttConfig(KITCHEN, 0, 0, devRacer());
    const w = new SimWorld(cfg, createSimPlugins(cfg));
    const k = w.st.karts[0];
    expect(w.st.karts.length).toBe(1);
    expect(k.item).toBe('catnip');
    expect(k.itemCount).toBe(TT_CATNIPS);
    expect(w.st.boxes.every((b) => b.respawn > 0)).toBe(true);
  });

  it('the dev ghost finishes, emits every checkpoint, and replays to the same time and splits', () => {
    const cfg = ttConfig(KITCHEN, 1, 0, devRacer());
    const dev = runSync(devGhostJob(cfg));
    expect(dev.time).not.toBeNull();
    expect(dev.splits.length).toBe(KITCHEN.laps * TT_CHECKS_PER_LAP);
    for (let i = 1; i < dev.splits.length; i++) expect(dev.splits[i]).toBeGreaterThan(dev.splits[i - 1]);
    // the last checkpoint is the finish line (to the tick)
    expect(Math.abs(dev.splits.at(-1)! - dev.time!)).toBeLessThan(1 / 60 + 1e-9);
    const again = runSync(replayJob(cfg, dev.inputs));
    expect(again.time).toBe(dev.time);
    expect(again.splits).toEqual(dev.splits);
  });

  it('a ghost survives the share ghost codec exactly (personal-best ghosts are stored with it)', async () => {
    const cfg = ttConfig(ROOFTOPS, 0, 0, devRacer());
    const dev = runSync(devGhostJob(cfg));
    const code = await encodeGhost({ trackKey: trackKey(ROOFTOPS.id), seed: cfg.seed, cls: cfg.cls, modifiers: 0, forgiving: false, slot: 0, body: 0, mode: 'tt' }, dev.inputs);
    const g = await decodeGhost(code);
    expect(g?.simVersion).toBe(SIM_VERSION);
    expect(g?.mode).toBe('tt');
    expect(runSync(replayJob(cfg, g!.inputs)).time).toBe(dev.time);
  });

  it('medals sit at dev +2 / +6 / +12 %', () => {
    const [g, s, b] = medalTimes(100);
    expect([g, s, b]).toEqual([102, 106, 112]);
    expect(medalFor(101, 100)).toBe(3);
    expect(medalFor(105, 100)).toBe(2);
    expect(medalFor(111.9, 100)).toBe(1);
    expect(medalFor(113, 100)).toBe(0);
    expect(medalFor(null, 100)).toBe(0);
    expect(medalFor(90, null)).toBe(0);
  });

  it('track signatures change with the track shape', () => {
    expect(trackSig(KITCHEN)).toBe(trackSig({ ...KITCHEN }));
    expect(trackSig(KITCHEN)).not.toBe(trackSig(ROOFTOPS));
  });

  it('time-trial rules follow the sim math rules (lint)', () => {
    const dir = join(__dirname);
    const banned = /Math\.(sin|cos|tan|atan|atan2|asin|acos|pow|exp|log|random|hypot|cbrt)\b|Date\.|performance\.now|new Date/;
    for (const f of readdirSync(dir).filter((x) => x === 'rules.ts')) {
      const bad = readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => banned.test(l.replace(/\/\/.*$/, '')));
      expect(bad).toEqual([]);
    }
  });
});
