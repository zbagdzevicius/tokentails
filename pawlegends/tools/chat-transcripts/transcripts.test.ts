/**
 * Diagnose-only (not in `npm test`): bot chatter transcripts from REAL simulated matches, for the believability read
 * (docs/plans/moba/MATCH-CHAT.md §5). One account plays a session of consecutive matches (slot 0, the `normal` player
 * bot, the cross-match memory carried between matches), with a simple human chat model on top, and every match prints
 * its chat next to the events it reacted to.
 *
 *   npx vitest run --config tools/chat-transcripts/vitest.config.ts
 *   CHAT_TX_N=50 CHAT_TX_TIER=text|quick CHAT_TX_MAP=crossing|hearthwood CHAT_TX_SEED=1 CHAT_TX_OUT=/path/out.txt
 */
import fs from 'node:fs';
import { it } from 'vitest';
import { filterChatText } from '../../../shared/chat-filter';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, step } from '../../src/sim/index';
import { BotChatter, mergeSeen, pushSeen, type BotSeen, type Planned } from '../../src/chat/botChatter';
import { cuesFromEvents, heroesFromWorld, readHandle, statesFromHeroes, type ChatCue } from '../../src/chat/cues';
import { Rng } from '../../src/chat/rng';
import { matchPhraseText } from '../../src/data/chatPhrases';

const TICK_MS = 1000 / 30;
const N = Number(process.env.CHAT_TX_N ?? 50);
const TIER = (process.env.CHAT_TX_TIER ?? 'text') as 'text' | 'quick';
const MAP = (process.env.CHAT_TX_MAP ?? 'crossing') as 'crossing' | 'hearthwood';
const SEED0 = Number(process.env.CHAT_TX_SEED ?? 1);
const OUT = process.env.CHAT_TX_OUT;
const NAMES = ['Mika', 'Jonas', 'Ella', 'Tomas', 'Lina', 'Rokas', 'Ava', 'Noah', 'Ema', 'Leo'];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function cueText(c: ChatCue, teamSize: number): string | null {
  const who = (s: number) => (s < 0 ? 'non-hero' : s === 0 ? 'YOU' : `${s < teamSize ? 'ally' : 'enemy'}#${s}`);
  switch (c.k) {
    case 'firstBlood':
      return `FIRST BLOOD ${who(c.killer)} > ${who(c.victim)}`;
    case 'death':
      return c.id === 0 || c.killer === 0 ? `kill ${who(c.killer)} > ${who(c.id)}` : null;
    case 'tower':
      return `tower falls (by team ${c.by})`;
    case 'objective':
      return `objective ${c.kind} taken by team ${c.team}`;
    case 'objectiveSpawn':
      return `objective ${c.kind} spawns`;
    case 'cannonHit':
      return `cannon hits team ${c.team}`;
    case 'comeback':
      return `comeback team ${c.team}`;
    case 'end':
      return `END winner team ${c.winner}`;
    case 'sunset':
    case 'suddenDeath':
      return c.k;
    default:
      return null;
  }
}

interface MatchOut {
  text: string[];
  botLines: Planned[];
  humanLines: number;
  probe: boolean;
  lengthMs: number;
}

function playOne(seed: number, idx: number, seen: BotSeen | null, rng: Rng): { out: MatchOut; seen: BotSeen | null } {
  const teamSize = MAP === 'hearthwood' ? 5 : 3;
  const slots = teamSize * 2;
  const { picks, tricks } = fillPicks(seed, 'clem', 'pounce', MAP);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', map: MAP });
  const bot = createPlayerBot(m as never, 'normal');
  const merged = seen ? mergeSeen([seen]) : null;
  const sides: ['cat', 'dog'] = ['cat', 'dog'];
  const engine = new BotChatter({
    seed: seed * 7919 + 13,
    slots,
    teamSize,
    map: MAP,
    humans: [0],
    sides,
    tiers: [TIER, TIER],
    names: Array.from({ length: slots }, (_, s) => (s === 0 ? NAMES[seed % NAMES.length] : null)),
    seen: [merged, merged],
    filter: (t) => filterChatText(t).ok,
  });
  const text: string[] = [];
  const botLines: Planned[] = [];
  let humanLines = 0;
  // the human: a light chat model (most players say little)
  const humanSays = (msg: string, ch: 'team' | 'all', t: number) => {
    humanLines++;
    text.push(`  ${mmss(t)}  [${ch}] YOU: ${msg}`);
    engine.human({ slot: 0, ch, k: 't', text: msg }, t);
  };
  const glAt = rng.chance(0.25) ? 3000 + rng.int(15000) : -1;
  const probeAt = rng.chance(0.06) ? 60_000 + rng.int(240_000) : -1;
  let tick = 0;
  let endAt = -1;
  for (;;) {
    const t = tick * TICK_MS;
    if (!result(m)) {
      step(m, playerBotCommands(m as never, bot));
      const h = readHandle(m);
      for (const c of cuesFromEvents(h.events, slots, teamSize)) {
        engine.observe(c, t);
        const ct = cueText(c, teamSize);
        if (ct) text.push(`  ${mmss(t)}  · ${ct}`);
        if (c.k === 'death' && c.killer === 0 && c.assists.length && rng.chance(0.12)) humanSays(rng.pick(['ty', 'thx', 'ty!']), 'team', t + 2500);
        if (c.k === 'death' && c.killer !== 0 && c.assists.indexOf(0) !== -1 && c.killer < teamSize && rng.chance(0.08)) humanSays(rng.pick(['nice', 'gj', 'nice one']), 'team', t + 2000);
      }
      if (tick % 30 === 0) {
        const heroes = heroesFromWorld(h.world, slots, teamSize);
        if (heroes) engine.sample(statesFromHeroes(heroes, Array.from({ length: slots - 1 }, (_, i) => i + 1)), t);
      }
      if (glAt >= 0 && t >= glAt && t - TICK_MS < glAt) humanSays(rng.pick(['gl hf', 'glhf', 'hi', 'gl']), 'team', t);
      if (probeAt >= 0 && t >= probeAt && t - TICK_MS < probeAt) humanSays(rng.pick(['are you bots?', 'r u a bot', 'is this ai lol']), 'team', t);
      const r = result(m);
      if (r) {
        endAt = t;
        const winner = (r as unknown as { winner: 0 | 1 }).winner;
        engine.observe({ k: 'end', winner }, t);
        text.push(`  ${mmss(t)}  · END ${winner === 0 ? 'WIN' : 'LOSS'}`);
        if (rng.chance(0.4)) humanSays(rng.pick(['gg', 'gg wp', 'ggs']), 'team', t + 3000);
      }
    }
    for (const l of engine.due(t)) {
      botLines.push(l);
      const body = l.k === 'q' ? `${matchPhraseText(l.id!, sides[l.team])}  (phrase)` : l.text;
      text.push(`  ${mmss(t)}  [${l.ch}] ${l.team === 0 ? 'ally' : 'enemy'}#${l.slot} (${engine.personas.get(l.slot)!.kind}): ${body}    <${l.cat}${l.follow ? ' follow' : ''}>`);
    }
    tick++;
    if (endAt >= 0 && t > endAt + 15_000) break;
    if (tick > 30 * 60 * 25) break;
  }
  const lines = engine.seenBy(0);
  const next = lines.length ? pushSeen(seen, lines) : seen;
  const s = engine.stats;
  text.unshift(
    `=== match ${idx + 1} seed ${seed} ${MAP} tier ${TIER} length ${mmss(endAt)} budget ${s.budget.join('/')} sent ${s.sent.join('/')} personas ${s.personas.join(',')} drops ${JSON.stringify(s.drops)}${s.probe ? ' PROBED' : ''}`,
  );
  return { out: { text, botLines, humanLines, probe: s.probe, lengthMs: endAt }, seen: next };
}

it('bot chatter transcripts over a session of real matches', { timeout: 3_600_000 }, () => {
  const rng = new Rng(SEED0 * 31 + 7);
  let seen: BotSeen | null = null;
  const all: string[] = [];
  const surfaces = new Map<string, number>();
  let total = 0;
  let zero = 0;
  let allyLines = 0;
  for (let i = 0; i < N; i++) {
    const { out, seen: s } = playOne(SEED0 * 1000 + i, i, seen, rng);
    seen = s;
    all.push(...out.text, '');
    // only what the human sees (own team + all chat)
    const visible = out.botLines.filter((l) => l.ch === 'all' || l.team === 0);
    total += visible.length;
    allyLines += visible.filter((l) => l.ch === 'team').length;
    if (!visible.length) zero++;
    for (const l of visible) surfaces.set(l.surface, (surfaces.get(l.surface) ?? 0) + 1);
  }
  const top = [...surfaces.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  all.push(`=== summary: ${N} matches, ${total} visible bot lines (${(total / N).toFixed(2)}/match, ${allyLines} team), ${zero} matches with none`);
  all.push(`=== most repeated surfaces: ${top.map(([k, v]) => `${k}×${v}`).join(', ')}`);
  const txt = all.join('\n');
  if (OUT) fs.writeFileSync(OUT, txt);
  else console.log(txt);
});
