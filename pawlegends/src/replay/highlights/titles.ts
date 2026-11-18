/**
 * Highlight titles (HIGHLIGHTS.md §3): witty, honest, ≤ 28 characters (the clip banner cuts there) with a sub line
 * ≤ 40. The choice is deterministic: `variants[(seed + start) % variants.length]`. Every bot is named "(bot)", a solo
 * match's sub ends "vs bots", and no line implies a human opponent. Pure.
 */
import { SUB_MAX, TITLE_MAX, type HighlightType } from './rules';

/** What a title needs to know about the moment. */
export interface TitleFacts {
  type: HighlightType;
  start: number;
  actors: readonly number[];
  victims: readonly number[];
  /** multikill count, strike hits, ace victims, teamfight heroes. */
  n?: number;
  /** teamfight: kills per side (credited side first when `side` ≥ 0), seconds, the winner (−1 even). */
  kills?: readonly [number, number];
  seconds?: number;
  side?: 0 | 1 | -1;
  /** clutch: lowest HP % and whether the hero took one down on the way out. */
  hpPct?: number;
  outplay?: boolean;
  /** steal: 'objective' | 'buff' | 'cannon'; objective kind ('pudding', 'grizzlechop'). */
  sort?: string;
  /** clipKind: the sim's marker; fumble: drop | fizzle | whiff; boing: chain | doom; finale: won | lost | timeUp. */
  what?: string;
  /** comeback: how far behind the winner was. */
  behind?: number;
}

export interface TitleCtx {
  seed: number;
  /** Display name per hero slot ("Clem", "Biscuit the Sage"). */
  names: readonly string[];
  /** Per slot: the hero is a bot. */
  bots: readonly boolean[];
  /** Solo or co-op against bots: subs end "vs bots". */
  vsBots: boolean;
  /** Team names (Purrhaven, Woof). */
  teams: readonly [string, string];
  /** The player's slot (0). */
  me: number;
}

const V: Readonly<Partial<Record<HighlightType, readonly string[]>>> = Object.freeze({
  ace: ['Ace!', 'Clean sweep', 'Team wiped'],
  shutdown: ['Shut down!', 'Streak over', 'Bounty claimed'],
  firstBlood: ['First Blood', 'First knockout', 'And so it begins'],
  kaboom: ['KABOOM!', 'Cannon knockout', 'One-shot from the Cannon'],
  strike: ['Yarn STRIKE!', 'Bowling for champions', 'Strike!'],
  bossDown: ['Boss down!', 'The big one falls', 'Boss defeated'],
  dive: ['Tower dive', 'Under their tower', 'In and out alive'],
  comeback: ['The comeback', 'Never give up', 'Turned it around'],
  minionDeath: ['Knocked out by a minion', "Minion's revenge", 'Lost to a minion'],
  towerDeath: ['The tower said no', 'Hugged the tower', 'Tower wins'],
  campDeath: ['The jungle bites back', 'Lost to the locals', 'Camp 1, champion 0'],
  diveFail: ['Dive failed', 'The tower remembers', 'Too deep'],
  wallPounce: ['Pounced into a wall', 'The wall won', 'Wall: 1, Pounce: 0'],
  returnToSender: ['Return to sender!', 'Parried it back!'],
  ultOnMinion: ['Ultimate on a minion', 'Worth it?', 'Big ultimate, tiny target'],
  overkill: ['Overkill', 'A bit much', 'That was plenty'],
  napFail: ['Nap interrupted. Forever.', 'Worst nap ever', 'Rude awakening'],
  botBlunder: ['Bot took a wrong turn', 'Bot walked into it', 'Bot vs everyone'],
  pingSpam: ['Ping ping ping', 'Are you seeing this?', 'Look here! Here!'],
  emoteSpam: ['Emote storm', 'Feeling chatty'],
});

const MULTI: Readonly<Record<number, string>> = Object.freeze({ 2: 'Double Knockout', 3: 'Triple Knockout', 4: 'Cat-astrophe', 5: 'PAWNTA KNOCKOUT' });
const ACED: readonly string[] = ['Aced', 'Wiped out', 'Everyone knocked out'];
const FIGHT_WON: readonly string[] = ['{a}-{b} for {team}', 'Teamfight won', 'Big brawl, big win'];
const FIGHT_LOST: readonly string[] = ['{a}-{b} for {team}', 'Teamfight lost', 'Rough brawl'];
const FIGHT_EVEN: readonly string[] = ['Even trade, nobody happy', 'Brawl ends even', 'Trade, trade, trade'];
const CLUTCH: readonly string[] = ['Escaped on {hp}% HP', 'Not today', 'Survived on {hp}%'];
const NINE: readonly string[] = ['Nine Lives, used one', 'Saved by Nine Lives', 'Eight lives left'];
const OUTPLAY: readonly string[] = ['Low HP, still won it', 'Took one down on {hp}%', 'Clutch knockout'];
const STEAL: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pudding: ['Stolen Pudding!', 'Mine now', 'Yoink'],
  grizzlechop: ['Stolen Grizzlechop!', 'Mine now', 'Yoink'],
  buff: ['Buff stolen', 'Yoink', 'Thanks for the buff'],
  cannon: ['Cannon snatched', 'Finders keepers', 'Yoink'],
});
const BOING: Readonly<Record<string, readonly string[]>> = Object.freeze({ chain: ['Boing boing boing', 'Boing Bed regular'], doom: ['Boinged to doom', 'Boing… oh no'] });
const FUMBLE: Readonly<Record<string, readonly string[]>> = Object.freeze({ drop: ['Cannon fumble', 'Butterpaws'], fizzle: ['Pfft. Fuse out.', 'Held it too long'], whiff: ['Cannon whiff', 'Missed by a mile'] });
const FINALE: Readonly<Record<string, readonly string[]>> = Object.freeze({ won: ['The final push', 'Game over, we win'], lost: ['The last stand', 'The core falls'], timeUp: ["Time's up!", 'Down to the wire'] });
const CLIP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  flop: ['Played dead', 'The flop'],
  bigdog: ['BIG DOG', 'Big dog energy'],
  scream: ['The scream', 'AAAAAH'],
  frozen: ['Frozen solid', 'SNOW DAY!'],
  zzz: ['Zzz', 'Nap time'],
  footlong: ['Footlong grab', 'Got you'],
  dots: ['Seeing spots', 'Spotted'],
  lullaby: ['Lullaby', 'Sweet dreams'],
  zigzag: ['ZIGZAG STORM', 'Zig, zag, ouch'],
  fetch: ['Fetch!', 'Good catch'],
  ko: ['Wall smash', 'Into the wall'],
});

const pick = <T>(list: readonly T[], seed: number, start: number): T => list[((seed >>> 0) + Math.max(0, start)) % list.length];

/** Cut to `max` characters (a word boundary when there is one). */
export function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const c = s.slice(0, max - 1);
  const sp = c.lastIndexOf(' ');
  return `${(sp > max * 0.5 ? c.slice(0, sp) : c).trimEnd()}…`;
}

/** Join the parts with " · ", dropping the last ones until it fits. */
function fit(parts: string[], max: number): string {
  const p = parts.filter(Boolean);
  while (p.length > 1 && p.join(' · ').length > max) p.pop();
  return cut(p.join(' · '), max);
}

/** A slot's name for a sub line: short, and "(bot)" on a bot. */
export function who(ctx: TitleCtx, slot: number): string {
  const raw = ctx.names[slot] ?? 'A champion';
  if (!ctx.bots[slot]) return cut(raw, 16);
  // a bot's persona name ("Muffin the Nugget") keeps its first name: "Muffin (bot)"
  const short = raw.length > 12 && raw.includes(' the ') ? raw.slice(0, raw.indexOf(' the ')) : raw;
  return `${cut(short, 14)} (bot)`;
}

/** A bot's funny moment (the title says "Bot"). */
const BOT: Readonly<Partial<Record<HighlightType, readonly string[]>>> = Object.freeze({
  minionDeath: ['Bot lost to a minion', 'Bot vs minion: minion wins'],
  towerDeath: ['Bot vs tower: tower wins', 'Bot hugged the tower'],
  campDeath: ['Bot lost to the jungle', 'Bot vs camp: camp wins'],
  diveFail: ['Bot dove, tower won', 'Bot dove too deep'],
  wallPounce: ['Bot pounced into a wall', 'Bot vs wall: wall wins'],
  boing: ['Bot boing boing boing', 'Bot on the Boing Bed'],
  fumble: ['Bot fumbled the Cannon', 'Bot butterpaws'],
  ultOnMinion: ['Bot ultimate on a minion', 'Bot ultimate, tiny minion'],
  overkill: ['Bot overkill', 'Bot went a bit far'],
  napFail: ['Bot nap, interrupted', 'Bot napped at a bad time'],
});

/** The title and sub of a highlight. */
export function titleFor(f: TitleFacts, ctx: TitleCtx, bot: boolean): { title: string; sub: string } {
  const s = ctx.seed;
  const a = f.actors[0] ?? -1;
  const v = f.victims[0] ?? -1;
  const aName = a >= 0 ? who(ctx, a) : '';
  const vName = v >= 0 ? who(ctx, v) : '';
  let title = '';
  let parts: string[] = [];
  switch (f.type) {
    case 'multikill':
      title = MULTI[Math.min(5, Math.max(2, f.n ?? 2))];
      parts = [aName, `${f.n ?? 2} down in ${Math.max(1, f.seconds ?? 1)} s`];
      break;
    case 'ace': {
      const ours = f.side === teamOfMe(ctx);
      title = pick(ours ? (V.ace ?? []) : ACED, s, f.start);
      parts = [`${f.n ?? f.victims.length} knocked out`, aName];
      break;
    }
    case 'teamfight': {
      const k = f.kills ?? [0, 0];
      const won = f.side === 0 || f.side === 1;
      const list = !won ? FIGHT_EVEN : f.side === teamOfMe(ctx) ? FIGHT_WON : FIGHT_LOST;
      const hi = won ? k[f.side as 0 | 1] : Math.max(k[0], k[1]);
      const lo = won ? k[1 - (f.side as 0 | 1)] : Math.min(k[0], k[1]);
      title = pick(list, s, f.start)
        .replace('{a}', String(hi))
        .replace('{b}', String(lo))
        .replace('{team}', won ? ctx.teams[f.side as 0 | 1] : '');
      if (title.length > TITLE_MAX || (won && hi === lo)) title = won ? (f.side === teamOfMe(ctx) ? 'Teamfight won' : 'Teamfight lost') : 'Even trade';
      parts = [`${f.n ?? f.actors.length + f.victims.length} champions`, `${f.seconds ?? 0} s`, won ? `${ctx.teams[f.side as 0 | 1]} win` : 'even trade'];
      break;
    }
    case 'clutch':
      title = pick(f.outplay ? OUTPLAY : f.what === 'nine' ? NINE : CLUTCH, s, f.start).replace('{hp}', String(Math.max(1, f.hpPct ?? 1)));
      parts = [aName, `${Math.max(1, f.hpPct ?? 1)}% HP`];
      break;
    case 'steal': {
      const list = STEAL[f.sort === 'objective' ? (f.what ?? 'pudding') : (f.sort ?? 'buff')] ?? STEAL.buff;
      title = pick(list, s, f.start);
      parts = [`Last hit by ${aName}`];
      break;
    }
    case 'strike':
      title = pick(V.strike ?? [], s, f.start);
      parts = [aName, `${f.n ?? 3} champions hit`];
      break;
    case 'comeback':
      title = (f.behind ?? 0) >= 3 && pick([0, 1], s, f.start) === 1 ? `Down ${f.behind}, still won` : pick(V.comeback ?? [], s, f.start);
      parts = [`${ctx.teams[(f.side === 1 ? 1 : 0) as 0 | 1]} were behind`];
      break;
    case 'boing':
      title = pick(BOING[f.what ?? 'chain'] ?? BOING.chain, s, f.start);
      parts = [aName];
      break;
    case 'fumble':
      title = pick(FUMBLE[f.what ?? 'drop'] ?? FUMBLE.drop, s, f.start);
      parts = [aName];
      break;
    case 'finale':
      title = pick(FINALE[f.what ?? 'won'] ?? FINALE.won, s, f.start);
      parts = [`${ctx.teams[(f.side === 1 ? 1 : 0) as 0 | 1]} win`];
      break;
    case 'clipKind':
      title = pick(CLIP[f.what ?? ''] ?? ['What a moment'], s, f.start);
      parts = [aName];
      break;
    case 'shutdown':
    case 'firstBlood':
    case 'kaboom':
      title = pick(V[f.type] ?? [], s, f.start);
      parts = [aName, vName ? `on ${vName}` : ''];
      break;
    case 'dive':
      title = pick(V.dive ?? [], s, f.start);
      parts = [`${aName} dove`, 'survived'];
      break;
    case 'minionDeath':
      title = pick(V.minionDeath ?? [], s, f.start);
      parts = [aName, 'it was a small one'];
      break;
    default:
      title = pick(V[f.type] ?? ['Highlight'], s, f.start);
      parts = [aName, vName && f.type !== 'pingSpam' ? `vs ${vName}` : ''];
  }
  // a bot's blunder says so ("Bot vs tower: tower wins"); a walk-in is already a Bot title
  if (bot && BOT[f.type]) title = pick(BOT[f.type] ?? [], s, f.start);
  title = cut(title, TITLE_MAX);
  const tail = ctx.vsBots ? ' · vs bots' : '';
  const sub = `${fit(parts, SUB_MAX - tail.length)}${tail}`.replace(/^ · /, '');
  return { title, sub: cut(sub, SUB_MAX) };
}

const teamOfMe = (ctx: TitleCtx): 0 | 1 => (ctx.me < ctx.names.length / 2 ? 0 : 1);

/** Every title template (the length test reads them). */
export const ALL_TITLE_TEMPLATES: readonly string[] = Object.freeze([
  ...Object.values(V).flat(),
  ...Object.values(MULTI),
  ...ACED,
  ...FIGHT_WON,
  ...FIGHT_LOST,
  ...FIGHT_EVEN,
  ...CLUTCH,
  ...OUTPLAY,
  ...Object.values(STEAL).flat(),
  ...Object.values(BOING).flat(),
  ...Object.values(FUMBLE).flat(),
  ...Object.values(FINALE).flat(),
  ...Object.values(CLIP).flat(),
  ...NINE,
  ...Object.values(BOT).flat(),
]);
