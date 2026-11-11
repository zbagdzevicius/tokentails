import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Command } from '../../src/sim/api';
import { createMatch, fillPicks, hash, hashTrail, result, snapshot, step } from '../../src/sim/index';
import { Rng } from '../../src/sim/rng';
import { cuesFromEvents, heroesFromSnapshot, heroesFromWorld, readHandle, statesFromHeroes } from '../../src/chat/cues';
import { BotChatter } from '../../src/chat/botChatter';
import { randomCommand } from './helpers';

/**
 * MATCH-CHAT.md §5.1, §6.7: the bot chatter never changes the sim. Reading its cues every tick (the raw events and the
 * world arrays, as the relay's referee does, and a snapshot's, as a solo match does) and running the engine on them
 * leaves the hash trail and the final hash exactly as a run without them. No sim file imports the chatter, and the
 * chatter imports nothing from the sim.
 */

function play(seed: number, ticks: number, chat: boolean) {
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce');
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
  const r = new Rng(seed ^ 0x5eed);
  const engine = chat ? new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'] }) : null;
  let cues = 0;
  for (let t = 0; t < ticks && !result(m); t++) {
    const c = randomCommand(r);
    step(m, c ? ([c] as Command[]) : []);
    if (engine) {
      const h = readHandle(m);
      const list = cuesFromEvents(h.events, 6, 3);
      cues += list.length;
      for (const cue of list) engine.observe(cue, t * 33);
      if (t % 30 === 0) {
        const heroes = heroesFromWorld(h.world, 6, 3);
        if (heroes) engine.sample(statesFromHeroes(heroes, [1, 2, 3, 4, 5]), t * 33);
        // a solo match reads the snapshot instead
        const snap = snapshot(m, 0);
        engine.sample(statesFromHeroes(heroesFromSnapshot(snap.entities, 3), [1, 2]), t * 33);
        for (const ev of snap.events) for (const cue of cuesFromEvents([ev], 6, 3)) engine.observe(cue, t * 33);
      }
      engine.due(t * 33);
    }
  }
  return { m, cues };
}

describe('the bot chatter never changes the sim', { timeout: 180_000 }, () => {
  it('hash trails and final hashes are identical with the cues read every tick (12 seeded matches)', () => {
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const a = play(seed, 3600, false);
      const b = play(seed, 3600, true);
      expect(hashTrail(b.m)).toEqual(hashTrail(a.m));
      expect(hash(b.m)).toBe(hash(a.m));
      total += b.cues;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('no sim file imports the chatter, and the chatter imports nothing but its own files', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(root, 'src/sim')).filter((x) => x.endsWith('.ts'))) expect(fs.readFileSync(f, 'utf8').includes('/chat/'), f).toBe(false);
    for (const f of walk(path.join(root, 'src/chat')).filter((x) => x.endsWith('.ts'))) {
      // code only (the doc comments say what the code never does)
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) expect(m[1], f).toMatch(/^\.\/[a-zA-Z]+$/);
      expect(src.includes('Math.random'), f).toBe(false);
      expect(/\bDate\.now\b|performance\.now|document\.|window\./.test(src), f).toBe(false);
    }
  });
});
