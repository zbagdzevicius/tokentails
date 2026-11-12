import { describe, expect, it } from 'vitest';
import { filterChatText } from '../../../shared/chat-filter';
import { BotChatter, CHATTER, humanIntent, isProbe, mergeSeen, pushSeen, typingMs, type BotSeen, type ChatterSetup, type Planned } from '../../src/chat/botChatter';
import { cuesFromEvents, statesFromHeroes, type BotState, type ChatCue, type HeroLike } from '../../src/chat/cues';
import { Rng } from '../../src/chat/rng';
import { BOT_LINES, LINES_BY_CAT } from '../../src/chat/botLines';
import { dress, drawPersona } from '../../src/chat/personas';

/**
 * The bot chatter engine (docs/plans/moba/MATCH-CHAT.md §5, §8): the frequency distribution over scripted 7-minute
 * matches, the spacing and timing rules, every guard, and the cross-match memory.
 */

const filter = (s: string) => filterChatText(s).ok;
const MATCH_MS = 7 * 60_000;
const STEP = 250;

interface Run {
  chatter: BotChatter;
  lines: Planned[];
  cueAt: Map<Planned, number>;
}

/** A scripted 7-minute match: kills, first blood, towers, objectives, pings, a comeback, sunset, the end. */
function scriptedMatch(seed: number, setup: Partial<ChatterSetup> & { map?: 'crossing' | 'hearthwood' }, hooks: { at?: (t: number, c: BotChatter) => void } = {}): Run {
  const map = setup.map ?? 'crossing';
  const teamSize = map === 'hearthwood' ? 5 : 3;
  const slots = teamSize * 2;
  const humans = setup.humans ?? [0];
  const chatter = new BotChatter({ seed, slots, teamSize, map, humans, sides: ['cat', 'dog'], tiers: ['text', 'text'], filter, ...setup });
  const rng = new Rng(seed ^ 0x5bd1e995);
  // the script
  const cues: { at: number; cue: ChatCue }[] = [];
  const kills = 12 + rng.int(16);
  let fb = false;
  for (let i = 0; i < kills; i++) {
    const at = 40_000 + rng.int(MATCH_MS - 60_000);
    const killer = rng.int(slots);
    const victimTeam = killer >= teamSize ? 0 : 1;
    const victim = victimTeam * teamSize + rng.int(teamSize);
    const assists = rng.chance(0.5) ? [(killer >= teamSize ? 1 : 0) * teamSize + rng.int(teamSize)].filter((a) => a !== killer) : [];
    cues.push({ at, cue: { k: 'death', id: victim, killer, assists } });
    if (!fb) {
      fb = true;
      cues.push({ at, cue: { k: 'firstBlood', killer, victim } });
    }
  }
  for (let i = 0; i < 3 + rng.int(4); i++) cues.push({ at: 120_000 + rng.int(280_000), cue: { k: 'tower', by: rng.chance(0.5) ? 0 : 1 } });
  cues.push({ at: 180_000, cue: { k: 'objectiveSpawn', kind: 'pudding' } });
  cues.push({ at: 200_000 + rng.int(40_000), cue: { k: 'objective', team: rng.chance(0.5) ? 0 : 1, kind: 'pudding', slot: -1 } });
  for (let i = 0; i < 4; i++) cues.push({ at: 30_000 + rng.int(360_000), cue: { k: 'ping', team: 0, kind: 'group', took: 1 } });
  if (rng.chance(0.3)) cues.push({ at: 250_000, cue: { k: 'comeback', team: rng.chance(0.5) ? 0 : 1 } });
  cues.push({ at: 360_000, cue: { k: 'sunset' } });
  cues.sort((a, b) => a.at - b.at);
  const end: ChatCue = { k: 'end', winner: rng.chance(0.5) ? 0 : 1 };
  // bot states: dead for 12 s after a death, random HP and fights
  const deadUntil = new Map<number, number>();
  const lines: Planned[] = [];
  const cueAt = new Map<Planned, number>();
  let ci = 0;
  let lastCue = 0;
  for (let t = 0; t <= MATCH_MS + 15_000; t += STEP) {
    while (ci < cues.length && cues[ci].at <= t) {
      const c = cues[ci++].cue;
      if (c.k === 'death') deadUntil.set(c.id, t + 12_000);
      chatter.observe(c, t);
      lastCue = t;
    }
    if (t === MATCH_MS) {
      chatter.observe(end, t);
      lastCue = t;
    }
    if (t % 1000 === 0) {
      const heroes: HeroLike[] = [];
      for (let s = 0; s < slots; s++) {
        const alive = (deadUntil.get(s) ?? 0) <= t;
        heroes.push({ slot: s, alive, hp: alive ? 200 + rng.int(800) : 0, maxHp: 1000, team: s >= teamSize ? 1 : 0, x: rng.int(60_000), y: rng.int(60_000) });
      }
      chatter.sample(statesFromHeroes(heroes, Array.from({ length: slots }, (_, i) => i)), t);
    }
    hooks.at?.(t, chatter);
    for (const l of chatter.due(t)) {
      lines.push(l);
      cueAt.set(l, lastCue);
    }
  }
  return { chatter, lines, cueAt };
}

describe('bot chatter frequency (10,000 Crossing and 5,000 Hearthwood scripted matches)', { timeout: 300_000 }, () => {
  for (const [map, n] of [
    ['crossing', 10_000],
    ['hearthwood', 5_000],
  ] as const) {
    it(`${map}: mean ≤ 1.2 lines per team, P(0) in 0.40–0.58, never over budget ≤ 4, room gap ≥ 40 s, bot gap ≥ 100 s`, () => {
      let total = 0;
      let zero = 0;
      let max = 0;
      for (let seed = 1; seed <= n; seed++) {
        const r = scriptedMatch(seed * 7919, { map, humans: map === 'hearthwood' ? [0, 1] : [0] });
        const mine = r.lines.filter((l) => !l.follow && l.team === 0);
        const count = mine.length;
        total += count;
        if (count === 0) zero++;
        max = Math.max(max, count);
        expect(count).toBeLessThanOrEqual(r.chatter.stats.budget[0]);
        expect(r.chatter.stats.budget[0]).toBeLessThanOrEqual(4);
        // spacing among the budgeted lines that are not end lines or reactions
        const spaced = r.lines.filter((l) => !l.follow && !l.cat.startsWith('gg_') && l.cat !== 'reaction');
        for (let i = 1; i < spaced.length; i++) expect(spaced[i].at - spaced[i - 1].at).toBeGreaterThanOrEqual(CHATTER.roomGapMs);
        const bySlot = new Map<number, number[]>();
        for (const l of spaced) bySlot.set(l.slot, [...(bySlot.get(l.slot) ?? []), l.at]);
        for (const ts of bySlot.values()) for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1]).toBeGreaterThanOrEqual(CHATTER.botGapMs);
        // no line is ever from a human seat
        for (const l of r.lines) expect(map === 'hearthwood' ? [0, 1] : [0]).not.toContain(l.slot);
      }
      const mean = total / n;
      const p0 = zero / n;
      expect(mean).toBeLessThanOrEqual(1.2);
      expect(mean).toBeGreaterThan(0.4);
      expect(p0).toBeGreaterThanOrEqual(0.4);
      expect(p0).toBeLessThanOrEqual(0.58);
      expect(max).toBeLessThanOrEqual(4);
    }, 180_000);
  }

  it('reaction delays: 1.5–6 s plus typing for text, 0.8–2 s for phrases', () => {
    for (const tier of ['text', 'quick'] as const) {
      let seen = 0;
      for (let seed = 1; seed <= 3000 && seen < 200; seed++) {
        const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: [tier, tier], filter, startMs: 10_000_000 });
        const at = 60_000;
        c.observe({ k: 'firstBlood', killer: 0, victim: 3 }, at);
        for (let t = at; t < at + 30_000; t += 50)
          for (const l of c.due(t)) {
            if (l.follow) continue;
            seen++;
            const d = l.at - at;
            if (l.k === 'q') {
              expect(d).toBeGreaterThanOrEqual(800);
              expect(d).toBeLessThanOrEqual(2000 + 50);
            } else {
              expect(d).toBeGreaterThanOrEqual(1500);
              const p = c.personas.get(l.slot)!;
              expect(d).toBeLessThanOrEqual(6000 + typingMs(l.text!.length, p.cps, 1.25, 800) + 50);
            }
          }
      }
      expect(seen).toBeGreaterThan(20);
    }
  });

  it('typing time grows with length', () => {
    let prev = -1;
    for (let n = 1; n <= 40; n++) {
      const t = typingMs(n, 4, 1, 500);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('the same seed gives the same plan', () => {
    const a = scriptedMatch(4242, {}).lines.map((l) => `${l.at}|${l.slot}|${l.text ?? l.id}`);
    const b = scriptedMatch(4242, {}).lines.map((l) => `${l.at}|${l.slot}|${l.text ?? l.id}`);
    expect(a).toEqual(b);
  });
});

describe('bot chatter guards (MATCH-CHAT.md §6)', { timeout: 120_000 }, () => {
  const many = (f: (seed: number) => Run, n = 400) => Array.from({ length: n }, (_, i) => f(i + 1));

  it('only fill bots speak: human seats (and the pilots that fly them) never do', () => {
    for (const r of many((s) => scriptedMatch(s, { humans: [0, 1, 2] }))) for (const l of r.lines) expect(l.slot).toBeGreaterThanOrEqual(3);
    // team 0 is all humans: its seats never speak, and team 1's bots only use all chat (no humans to talk to)
    for (const r of many((s) => scriptedMatch(s, { humans: [0, 1, 2] }))) for (const l of r.lines) expect(l.ch).toBe('all');
  });

  it('silent rooms (ranked, an account first match, a restored room) never chat', () => {
    for (const r of many((s) => scriptedMatch(s, { silent: true }))) {
      expect(r.lines).toEqual([]);
      expect(r.chatter.stats.budget).toEqual([0, 0]);
    }
  });

  it('a probe silences every bot for the rest of the match, with no reaction', () => {
    let hadPending = 0;
    for (const r of many(
      (s) =>
        scriptedMatch(s, {}, {
          at: (t, c) => {
            if (t === 100_000) {
              if (c.pendingCount) hadPending++;
              c.human({ slot: 0, ch: 'team', k: 't', text: 'are u a bot lol' }, t);
            }
          },
        }),
      600,
    )) {
      expect(r.lines.filter((l) => l.at > 100_000)).toEqual([]);
      expect(r.chatter.probed).toBe(true);
    }
    expect(hadPending).toBeGreaterThan(0);
    for (const p of ['are you real?', 'is this a bot', 'r u human?', 'ROBOT', 'n p c', 'ar tu žmogus?', 'botas', 'real player?', 'afk bot']) expect(isProbe(p), p).toBe(true);
    for (const p of ['gg', 'nice', 'ty', 'push mid', 'about time', 'group up']) expect(isProbe(p), p).toBe(false);
  });

  it('questions, requests and unknown text get no reaction; at most one reaction per human message', () => {
    for (const t of ['where are you?', 'add me', 'what is your name', 'help me top', 'mira', 'go 2', 'lol?']) expect(humanIntent(t), t).toBeNull();
    expect(humanIntent('ty')).toBe('thanks');
    expect(humanIntent('Nice!')).toBe('praise');
    expect(humanIntent('ggwp')).toBe('gg');
    expect(humanIntent('hahaha')).toBe('lol');
    let reactions = 0;
    let unearned = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      // the "nice" is for bot 1, which just got a kill (a "nice" nobody earned gets no "ty": below)
      const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      c.observe({ k: 'death', id: 4, killer: 1, assists: [] }, 500);
      c.human({ slot: 0, ch: 'team', k: 't', text: 'where are you?' }, 1000);
      c.human({ slot: 0, ch: 'team', k: 't', text: 'nice' }, 2000);
      const out: Planned[] = [];
      for (let t = 2000; t < 20_000; t += 100) out.push(...c.due(t));
      const re = out.filter((l) => l.cat === 'reaction' && !l.follow);
      expect(re.length).toBeLessThanOrEqual(1);
      reactions += re.length;
      const praiseLids = BOT_LINES.filter((b) => b.cat === 'reaction' && b.tag === 'praise').map((b) => b.lid);
      for (const l of re) expect(praiseLids).toContain(l.lid);
      for (const l of re) expect(l.slot).toBe(1);
      // the same "nice" with no bot deed in the last 15 s, and a "ty" no bot helped with: silence
      const d = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      d.observe({ k: 'death', id: 4, killer: 1, assists: [] }, 500);
      d.human({ slot: 0, ch: 'team', k: 't', text: 'nice' }, 20_000);
      d.human({ slot: 0, ch: 'team', k: 't', text: 'ty' }, 90_000);
      for (let t = 20_000; t < 110_000; t += 100) unearned += d.due(t).filter((l) => l.cat === 'reaction').length;
    }
    expect(unearned).toBe(0);
    // p 0.25 times the share of rooms with budget and a talker: some, never many
    expect(reactions).toBeGreaterThan(50);
    expect(reactions).toBeLessThan(700);
  });

  it('a stale guard drops the line without spending budget', () => {
    let dropped = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      c.observe({ k: 'death', id: 1, killer: 4, assists: [] }, 60_000);
      if (!c.pendingCount) continue;
      // the bot respawns at once: "rip" / "my bad" while alive is stale
      c.sample([{ slot: 1, alive: true, hp: 1, intent: 'lane', enemies: 0, allies: 0 }], 60_500);
      const out: Planned[] = [];
      for (let t = 60_000; t < 90_000; t += 100) out.push(...c.due(t));
      expect(out.filter((l) => l.cat === 'death')).toEqual([]);
      expect(c.stats.sent[0]).toBe(out.filter((l) => !l.follow).length);
      dropped++;
    }
    expect(dropped).toBeGreaterThan(10);
  });

  it('a quick-tier team gets phrase ids only, or nothing', () => {
    let q = 0;
    for (const r of many((s) => scriptedMatch(s, { tiers: ['quick', 'quick'] }), 1500))
      for (const l of r.lines) {
        expect(l.k).toBe('q');
        expect(l.text).toBeUndefined();
        expect(l.id).toBeGreaterThanOrEqual(24);
        expect(l.id).toBeLessThanOrEqual(39);
        q++;
      }
    expect(q).toBeGreaterThan(50);
  });

  it('a tier that drops mid-match turns pending text into a phrase or drops it', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      c.observe({ k: 'firstBlood', killer: 1, victim: 3 }, 60_000);
      c.setTier(0, 'quick');
      for (let t = 60_000; t < 90_000; t += 100) for (const l of c.due(t)) if (l.team === 0) expect(l.k).toBe('q');
    }
  });

  it('a follow-up (a split second part or a *fix) never goes out as text after the tier drops', () => {
    let covered = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      c.observe({ k: 'firstBlood', killer: 1, victim: 3 }, 60_000);
      let dropped = false;
      for (let t = 60_000; t < 90_000; t += 100)
        for (const l of c.due(t)) {
          if (l.team !== 0) continue;
          if (dropped) expect(l.k).toBe('q');
          else if (l.k === 't' && !l.follow && c.pendingCount > 0) {
            // an under-16 took a seat right after the first part was sent
            c.setTier(0, 'quick');
            dropped = true;
            covered++;
          }
        }
    }
    expect(covered).toBeGreaterThan(0);
  });

  it('every sent text passes the filter, stays ≤ 40 characters and has no question mark', () => {
    for (const r of many((s) => scriptedMatch(s, {}), 2000))
      for (const l of r.lines) {
        if (l.k !== 't') continue;
        expect(filter(l.text!), l.text).toBe(true);
        expect(l.text!.length).toBeLessThanOrEqual(40);
        expect(l.text).not.toMatch(/[?@]/);
      }
  });

  it('enemy bots with no human on their team only use all chat phrases', () => {
    for (const r of many((s) => scriptedMatch(s, { humans: [0] }), 1500))
      for (const l of r.lines.filter((x) => x.team === 1)) {
        expect(l.ch).toBe('all');
        expect(l.k).toBe('q');
      }
  });

  it('end lines arrive within 12 s of the end, at most 2 per team, never the same surface', () => {
    for (const r of many((s) => scriptedMatch(s, {}), 2000)) {
      const end = r.lines.filter((l) => l.cat.startsWith('gg_') && !l.follow);
      for (const l of end) expect(l.at - MATCH_MS).toBeLessThanOrEqual(CHATTER.endWindowMs);
      for (const t of [0, 1]) {
        const mine = end.filter((l) => l.team === t);
        expect(mine.length).toBeLessThanOrEqual(2);
        expect(new Set(mine.map((l) => l.surface)).size).toBe(mine.length);
      }
    }
  });
});

describe('bot chatter memory across matches (§5.8)', { timeout: 120_000 }, () => {
  it('200 matches for one account: no lid repeats within 80 lines, no common-token surface within 3', () => {
    let ring: BotSeen = { l: [], s: [] };
    const history: { lid: string; tok?: string; surface: string }[] = [];
    for (let m = 0; m < 200; m++) {
      const seen = mergeSeen([ring]);
      const r = scriptedMatch(1000 + m, { seen: [seen, seen] });
      const mine = r.chatter.seenBy(0);
      for (const x of mine) {
        if (x.lid.endsWith('*')) continue;
        // wheel phrases (q:) repeat like anyone's; the lid memory is for typed lines
        if (!x.tok) {
          const lastLids = history.filter((h) => !h.tok && !h.surface.startsWith('q:')).slice(-80).map((h) => h.lid);
          if (!x.surface.startsWith('q:')) expect(lastLids, `match ${m} ${x.lid}`).not.toContain(x.lid);
        } else {
          const last3 = history.filter((h) => h.tok === x.tok).slice(-3).map((h) => h.surface);
          expect(last3, `match ${m} ${x.tok}`).not.toContain(x.surface);
        }
        history.push(x);
      }
      ring = pushSeen(ring, mine);
      expect(ring.l.length).toBeLessThanOrEqual(80);
      expect(ring.s.length).toBeLessThanOrEqual(30);
    }
    expect(history.length).toBeGreaterThan(100);
  });

  it('a phrases-only account (solo, unknown age) does not run the bots dry: matches 201–300 chat as much as 1–100', () => {
    let ring: BotSeen = { l: [], s: [] };
    const counts: number[] = [];
    for (let m = 0; m < 300; m++) {
      const seen = mergeSeen([ring]);
      const r = scriptedMatch(5000 + m, { seen: [seen, seen], tiers: ['quick', 'quick'] });
      const mine = r.chatter.seenBy(0);
      counts.push(mine.length);
      ring = pushSeen(ring, mine);
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const early = sum(counts.slice(0, 100));
    expect(early).toBeGreaterThan(30);
    expect(sum(counts.slice(200))).toBeGreaterThan(early * 0.7);
  });

  it('every lid the engine sends is a bank line (no free generation)', () => {
    const lids = new Set(BOT_LINES.map((l) => l.lid));
    for (let s = 1; s <= 500; s++) for (const l of scriptedMatch(s, {}).lines) expect(lids.has(l.lid.replace(/\*$/, '')), l.lid).toBe(true);
  });
});

describe('chat cues from sim events (read only)', () => {
  it('maps deaths, first blood, towers, objectives and pings; ignores the rest; never mutates', () => {
    const events = Object.freeze([
      Object.freeze({ type: 'hit', tick: 5, src: 0, dst: 3, amount: 10, shielded: 0, kind: 'basic' }),
      Object.freeze({ type: 'xp', tick: 5, id: 1, amount: 20, reason: 'assist' }),
      Object.freeze({ type: 'death', tick: 5, id: 3, killer: 0 }),
      Object.freeze({ type: 'death', tick: 5, id: 40, killer: 0 }),
      Object.freeze({ type: 'firstBlood', tick: 5, killer: 0, victim: 3 }),
      Object.freeze({ type: 'tower', tick: 5, id: 60, destroyedBy: 1 }),
      Object.freeze({ type: 'objective', tick: 5, kind: 'grizzlechop', team: 0, slot: 2 }),
      Object.freeze({ type: 'ping', tick: 5, kind: 'group', x: 0, y: 0, target: -1, took: 2 }),
      Object.freeze({ type: 'pudding', tick: 5, what: 'calmed', team: 1 }),
      Object.freeze({ type: 'cannon', tick: 5, what: 'hit', team: 1, by: 0 }),
    ]);
    const cues = cuesFromEvents(events, 6, 3);
    expect(cues).toEqual([
      { k: 'death', id: 3, killer: 0, assists: [1] },
      { k: 'firstBlood', killer: 0, victim: 3 },
      { k: 'tower', by: 1 },
      { k: 'objective', team: 0, kind: 'grizzlechop', slot: 2 },
      { k: 'ping', team: 0, kind: 'group', took: 2 },
      { k: 'objective', team: 1, kind: 'pudding', slot: -1 },
      { k: 'cannonHit', team: 1, by: 0 },
    ]);
    expect(cuesFromEvents(null, 6, 3)).toEqual([]);
  });

  it('states: dead is base, near enemies is a fight, low HP is a retreat', () => {
    const heroes: HeroLike[] = [
      { slot: 1, alive: true, hp: 900, maxHp: 1000, team: 0, x: 0, y: 0 },
      { slot: 4, alive: true, hp: 900, maxHp: 1000, team: 1, x: 5000, y: 0 },
      { slot: 2, alive: true, hp: 200, maxHp: 1000, team: 0, x: 40_000, y: 0 },
      { slot: 5, alive: false, hp: 0, maxHp: 1000, team: 1, x: 0, y: 0 },
    ];
    const st = statesFromHeroes(heroes, [1, 2, 5]);
    const by = (s: number) => st.find((x) => x.slot === s) as BotState;
    expect(by(1).intent).toBe('fight');
    expect(by(2).intent).toBe('retreat');
    expect(by(5).intent).toBe('base');
  });
});

/**
 * The believability read (tools/chat-transcripts, 50+ real simulated matches per tier): surfaces and context fits a
 * regular player would notice as a script.
 */
describe('bot chatter believability', { timeout: 120_000 }, () => {
  it('surfaces: no stretched shorthand, no capitalised "o/", no "…" on an up line, no "." on a proper up line', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 2000; i++) {
      const p = drawPersona(rng);
      for (const l of BOT_LINES) {
        if (l.text.includes('{')) continue;
        for (const mood of ['up', 'down', 'neutral'] as const) {
          const s = dress(l.text, p, rng, { mood, max: 40 });
          expect(s, `${p.kind} ${l.text}`).not.toMatch(/^(wpp|ggg|gjj|ww)|\d seee|^O\//);
          if (mood === 'up') expect(s, `${p.kind} ${l.text}`).not.toMatch(/…$/);
          if (mood === 'up' && p.kind === 'proper') expect(s, l.text).not.toMatch(/[a-z]\.$/i);
          if (p.kind === 'silent' && l.tok === 'gg') expect(s).toBe(s.toLowerCase());
        }
      }
    }
  });

  it('"nice shutdown" only after a shutdown the human really got; "they were two" only with 2+ enemies close', () => {
    const shutdownLids = LINES_BY_CAT.praise.filter((l) => l.tag === 'shutdown').map((l) => l.lid);
    const twoLids = LINES_BY_CAT.death.filter((l) => l.tag === 'two').map((l) => l.lid);
    let shutdownPraise = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      // a tower finished the victim, the sim still credited the shutdown to slot 0: no praise at all
      const a = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      a.observe({ k: 'death', id: 4, killer: -1, assists: [] }, 1000);
      a.observe({ k: 'shutdown', killer: 0, victim: 4 }, 1000);
      for (let t = 1000; t < 20_000; t += 250) expect(a.due(t).filter((l) => l.cat === 'praise')).toEqual([]);
      // a plain kill never says "nice shutdown"; a real shutdown may
      const b = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      b.observe({ k: 'death', id: 4, killer: 0, assists: [] }, 1000);
      b.observe({ k: 'death', id: 5, killer: 0, assists: [] }, 3000);
      for (let t = 1000; t < 30_000; t += 250) for (const l of b.due(t)) expect(shutdownLids).not.toContain(l.lid);
      const c = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      c.observe({ k: 'death', id: 4, killer: 0, assists: [] }, 1000);
      c.observe({ k: 'shutdown', killer: 0, victim: 4 }, 1000);
      for (let t = 1000; t < 20_000; t += 250) shutdownPraise += c.due(t).filter((l) => l.cat === 'praise').length;
      // a bot dying alone never says "they were two"
      const d = new BotChatter({ seed, slots: 6, teamSize: 3, humans: [0], tiers: ['text', 'text'], filter, startMs: 10_000_000 });
      d.sample([{ slot: 1, alive: true, hp: 0.2, intent: 'fight', enemies: 1, allies: 0 }], 500);
      d.observe({ k: 'death', id: 1, killer: 4, assists: [] }, 1000);
      for (let t = 1000; t < 20_000; t += 250) for (const l of d.due(t)) expect(twoLids).not.toContain(l.lid);
    }
    expect(shutdownPraise).toBeGreaterThan(100);
  });

  it('"my fault" only follows a bot\'s own death', () => {
    let follows = 0;
    for (let s = 1; s <= 3000; s++) {
      const lines = scriptedMatch(s, {}).lines;
      lines.forEach((l, i) => {
        if (!l.follow || l.lid.endsWith('*')) return;
        follows++;
        const parent = lines.slice(0, i).reverse().find((x) => x.slot === l.slot && !x.follow);
        if (l.text?.toLowerCase().startsWith('my fault')) expect(parent?.cat).toBe('death');
      });
    }
    expect(follows).toBeGreaterThan(0);
  });
});
