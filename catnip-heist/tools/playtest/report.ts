/** Markdown report for the synthetic-player playtest (playtest/BOT-REPORT.md). Pure. */
import { TICK_HZ } from '../../src/types';
import { LEVEL_IDS, getLevel } from '../../src/levels';
import { PERSONAS, type PersonaId } from './personas';
import { topK, type CellSummary } from './stats';

export interface Validation {
  routes: { levelId: string; steps: number; won: boolean; ticks: number; spotted: number; hashMatches: boolean }[];
  determinism: { levelId: string; persona: PersonaId; seed: number; same: boolean }[];
}

export interface ReportInput {
  meta: { runs: number; seed0: number; levels: string[]; personas: PersonaId[]; seconds: number; episodes: number };
  summaries: CellSummary[];
  validation: Validation | null;
  argv: string[];
  /** Hand-written notes carried over from the previous report (between the notes markers). */
  notes?: string | null;
}

export const NOTES_START = '<!-- notes:start (kept when the report is regenerated) -->';
export const NOTES_END = '<!-- notes:end -->';

/** The notes block of an existing report, or null. */
export function extractNotes(md: string): string | null {
  const a = md.indexOf(NOTES_START);
  const b = md.indexOf(NOTES_END);
  if (a < 0 || b < a) return null;
  return md.slice(a + NOTES_START.length, b).trim();
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ratio = (t: number | null, par: number) => (t === null ? '–' : (t / par).toFixed(2));
const secs = (t: number | null) => (t === null ? '–' : `${Math.round(t / TICK_HZ)} s`);

function bar(x: number, width = 20): string {
  const n = Math.round(Math.max(0, Math.min(1, x)) * width);
  return '█'.repeat(n) + '·'.repeat(width - n);
}

/** ASCII map of a level with spot counts overlaid (1-9, scaled to the hottest tile). */
export function heatmap(levelId: string, heat: Record<string, number>): string {
  const level = getLevel(levelId);
  const rows = level.tiles.map((r) => r.split('').map((ch) => (ch === 'r' ? '.' : ch)));
  const put = (t: { x: number; y: number }, ch: string) => {
    if (rows[t.y] && rows[t.y][t.x] !== undefined) rows[t.y][t.x] = ch;
  };
  for (const d of level.doors) put(d.tile, d.kind === 'VAULT' ? 'V' : 'D');
  for (const p of level.plates) put(p.tile, 'p');
  for (const t of level.exit.tiles) put(t, 'E');
  put(level.crate.tile, 'C');
  if (level.key) put(level.key.tile, 'k');
  put(level.catSpawns[0], '1');
  put(level.catSpawns[1], '2');
  for (const g of level.guards) put(g.waypoints[0], 'g');
  const max = Math.max(0, ...Object.values(heat));
  for (const [k, v] of Object.entries(heat)) {
    const [x, y] = k.split(',').map(Number);
    const d = max <= 9 ? v : Math.max(1, Math.round((v / max) * 9));
    put({ x, y }, String(Math.min(9, d)));
  }
  const w = rows[0].length;
  const head1 = '   ' + Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String((x / 10) % 10) : ' ')).join('');
  const head2 = '   ' + Array.from({ length: w }, (_, x) => String(x % 10)).join('');
  const body = rows.map((r, y) => String(y).padStart(2) + ' ' + r.join(''));
  return [head1, head2, ...body].join('\n') + `\n(scale: 9 = ${max} spots${max <= 9 ? ', digits are raw counts' : ''})`;
}

function mergeCounts(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** Automatic observations: things a designer should look at. */
export function flags(summaries: CellSummary[]): string[] {
  const out: string[] = [];
  const by = (lv: string, p: PersonaId) => summaries.find((s) => s.levelId === lv && s.persona === p);
  const levels = [...new Set(summaries.map((s) => s.levelId))].sort((a, b) => LEVEL_IDS.indexOf(a) - LEVEL_IDS.indexOf(b));
  const human = summaries.filter((s) => s.persona !== 'oracle');
  const meanCompletion = (lv: string) => {
    const xs = human.filter((s) => s.levelId === lv);
    return xs.reduce((a, s) => a + s.completion, 0) / Math.max(1, xs.length);
  };
  for (let i = 1; i < levels.length; i++) {
    const a = meanCompletion(levels[i - 1]);
    const b = meanCompletion(levels[i]);
    if (b - a > 0.15) out.push(`Difficulty dip: ${levels[i]} is easier than ${levels[i - 1]} (mean completion ${pct(b)} vs ${pct(a)}).`);
    if (a - b > 0.4) out.push(`Difficulty spike: ${levels[i]} drops mean completion from ${pct(a)} to ${pct(b)}.`);
  }
  for (const lv of levels) {
    const xs = human.filter((s) => s.levelId === lv);
    const runs = xs.reduce((a, s) => a + s.runs, 0);
    const sl = xs.reduce((a, s) => a + s.softLockedRuns, 0);
    if (runs && sl / runs >= 0.05) out.push(`${lv}: ${pct(sl / runs)} of runs hit a soft-lock (a cat respawned at a checkpoint behind plate doors its partner cannot open from where it stands).`);
    const nov = by(lv, 'novice');
    if (nov && nov.completion < 0.4) out.push(`${lv}: novices finish only ${pct(nov.completion)} (main quit: ${topK(nov.quitWhy, 1)[0]?.[0] ?? '–'}).`);
    for (const s of human.filter((x) => x.levelId === lv)) {
      if (s.medianTicks !== null && s.medianTicks > s.parTicks) out.push(`${lv}: ${s.persona} median win time ${ratio(s.medianTicks, s.parTicks)}x par, so the clean-and-quick star is out of reach for most.`);
      const g = topK(s.byGuard, 1)[0];
      const total = Object.values(s.byGuard).reduce((a, b) => a + b, 0);
      if (g && total >= 50 && g[1] / total > 0.6) out.push(`${lv}: ${s.persona} spots are dominated by ${g[0]} (${pct(g[1] / total)} of ${total}).`);
    }
  }
  return out;
}

export function renderReport(input: ReportInput): string {
  const { meta, summaries, validation } = input;
  const L: string[] = [];
  const levels = meta.levels;
  const personas = meta.personas;
  L.push('# Catnip Heist: synthetic-player report');
  L.push('');
  L.push(
    `Generated by \`npm run playtest:bots${input.argv.length ? ' -- ' + input.argv.join(' ') : ''}\` (tools/playtest/). ${meta.episodes} episodes: ${levels.length} levels x ${personas.length} personas x ${meta.runs} seeds (seeds ${meta.seed0}..${meta.seed0 + meta.runs - 1}), ${meta.seconds} s wall time. Every number below is reproducible from the same command: the bots and the sim are deterministic per seed.`,
  );
  L.push('');
  L.push('## Findings');
  L.push('');
  L.push(NOTES_START);
  L.push(input.notes ?? '_No notes yet: write the analysis between these markers; regenerating the report keeps it._');
  L.push(NOTES_END);
  L.push('');
  L.push('## How to re-run');
  L.push('');
  L.push('```bash');
  L.push('npm run playtest:bots                                    # full run, rewrites this file');
  L.push('npm run playtest:bots -- --levels heist-03,heist-05 --personas novice,rusher --runs 50 --json /tmp/bots.json --no-md');
  L.push('npm run playtest:bots -- --personas oracle --runs 20 --no-md   # planner upper bound (no delay, map known)');
  L.push('```');
  L.push('');
  L.push('Flags: `--levels`, `--personas` (novice, cautious, rusher, explorer, oracle), `--runs`, `--seed0`, `--workers`, `--json <file>` (every episode plus summaries), `--md <file>` / `--no-md`, `--no-validate`.');
  L.push('');
  L.push('## What the bots are');
  L.push('');
  L.push(
    'The bots drive the real sim (`src/sim`, headless, 30 Hz) through the same `Input` a keyboard produces. They never read the solver scripts or solutions. Each tick a bot perceives the sim state from `reaction` ticks ago, limited to the desktop camera footprint around the active cat (about 20 x 20 tiles, rotated 45 degrees; scaled per persona), and remembers what it has seen. Plates, doors, key, crate, exit and coins are unknown until on screen; a plate is linked to its door once both have been seen (the game colour-codes them). Dogs off screen are remembered for 2 s.',
  );
  L.push('');
  L.push(
    'Planning: a breadth-first search over (region of cat 1, region of cat 2), where regions are the known floor split by plate doors, decides who holds which plate and who walks through. Movement is a Dijkstra over known tiles that refuses tiles a visible dog is predicted to see near the arrival time (dogs are extrapolated in a straight line over the persona\'s look-ahead, the cones are the sim\'s own cone test). When no safe path exists the bot flees a sweeping cone, waits, meows to lure a dog that has stood still in the way, or, after its patience runs out, dashes using only the current cones.',
  );
  L.push('');
  L.push(
    'Human slop: per-run reaction delay, sloppy keys (one of the two screen keys dropped, so a grid move turns 45 degrees for a few ticks), overshoot when stopping, occasional unintended swaps, stopping to read new hint and objective lines (novices learn the lure and the plate trick from that text, or by experimenting after being stuck for 40 s). Frustration: a bot quits after K spots within T seconds, or after N seconds without progress (a coin, key, door opened for the first time, checkpoint, rescue, a cat on the exit, or 15 newly seen tiles). Runs are capped at 4x par (12 min max) and count as a timeout.',
  );
  L.push('');
  L.push('| Persona | Reaction | View | Look-ahead | Patience | Cone margin | Coin detour | Knows lure/plates | Quits after |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const id of personas) {
    const p = PERSONAS[id];
    const ms = (t: number) => Math.round((t * 1000) / TICK_HZ);
    L.push(
      `| ${p.label} | ${ms(p.reaction[0])}-${ms(p.reaction[1])} ms | ${pct(Math.min(1, p.viewScale))}${p.fullKnowledge ? ' (map known)' : ''} | ${ms(p.horizon)} ms | ${(p.patience / TICK_HZ).toFixed(0)} s | ${p.coneMargin} tile | ${p.coinDetour >= 99 ? 'all coins' : `${p.coinDetour} tiles`} | ${p.knowsLure ? 'yes' : 'from hints'} / ${p.knowsPlates ? 'yes' : 'from hints'} | ${p.quit.spots} spots in ${p.quit.windowSec} s, or ${p.quit.noProgressSec} s stuck |`,
    );
  }
  L.push('');
  for (const id of personas) L.push(`- **${PERSONAS[id].label}**: ${PERSONAS[id].description}`);
  L.push('');
  L.push('Stars follow `runStars` in `src/ui/levels/progress.ts`: 1 win, 2 all coins (on a win), 3 unspotted and at or under par (on a win).');
  L.push('');

  if (validation) {
    L.push('## Harness validation');
    L.push('');
    L.push('Route-follow: the solver\'s route for each level (tile targets with departure ticks and button presses, extracted from `src/levels/<id>.solution.json` by `routeFromLog`) is driven by the bots\' steering rule (`steerDir`). It must win unspotted with the solution\'s recorded final hash.');
    L.push('');
    L.push('| Level | Route steps | Won | Ticks | Spotted | Final hash = solution |');
    L.push('|---|---|---|---|---|---|');
    for (const r of validation.routes) L.push(`| ${r.levelId} | ${r.steps} | ${r.won ? 'yes' : '**no**'} | ${r.ticks} | ${r.spotted} | ${r.hashMatches ? 'yes' : '**no**'} |`);
    const same = validation.determinism.filter((d) => d.same).length;
    L.push('');
    L.push(`Determinism: ${same}/${validation.determinism.length} reruns of (level, persona, seed) produced byte-identical episode results (${[...new Set(validation.determinism.map((d) => d.levelId))].join(', ')}, every persona, seeds 1-2). The vitest suite \`tools/playtest/__tests__/harness.test.ts\` checks the same plus the core helpers.`);
    L.push('');
  }

  L.push('## Summary');
  L.push('');
  L.push('Completion = won runs / runs. Times are over won runs (final attempt, what the game times), as a multiple of par. Spots are per run over the whole session, retries included. Stars are the mean per run (0-3). The last column is the share of runs that hit a soft-lock at least once (a state no play can finish; the bot then uses Pause > Retry if it has retries left).');
  L.push('');
  L.push('| Level | Par | ' + personas.map((p) => `${PERSONAS[p].label} win / med / p90 / spots / stars`).join(' | ') + ' | Soft-locked runs |');
  L.push('|---|---|' + personas.map(() => '---').join('|') + '|---|');
  for (const lv of levels) {
    const par = getLevel(lv).meta.parTicks;
    const cells = personas.map((p) => {
      const s = summaries.find((x) => x.levelId === lv && x.persona === p);
      if (!s) return '–';
      return `${pct(s.completion)} / ${ratio(s.medianTicks, par)} / ${ratio(s.p90Ticks, par)} / ${s.spotsMean.toFixed(1)} / ${s.starsMean.toFixed(2)}`;
    });
    const cs = summaries.filter((x) => x.levelId === lv && x.persona !== 'oracle');
    const sl = cs.reduce((a, x) => a + x.softLockedRuns, 0) / Math.max(1, cs.reduce((a, x) => a + x.runs, 0));
    L.push(`| ${lv} ${getLevel(lv).meta.name ?? ''} | ${secs(par)} | ${cells.join(' | ')} | ${pct(sl)} |`);
  }
  L.push('');

  L.push('## Difficulty curve');
  L.push('');
  L.push('Completion rate per level (one bar per persona, 20 cells = 100%), then the mean over personas and the median win time / par.');
  L.push('');
  L.push('```');
  for (const lv of levels) {
    const xs = summaries.filter((s) => s.levelId === lv && s.persona !== 'oracle');
    for (const s of summaries.filter((x) => x.levelId === lv)) L.push(`${lv} ${s.persona.padEnd(9)} ${bar(s.completion)} ${pct(s.completion).padStart(4)}  ${ratio(s.medianTicks, s.parTicks).padStart(4)}x par  ${s.spotsMean.toFixed(1).padStart(4)} spots`);
    if (xs.length > 1) {
      const m = xs.reduce((a, s) => a + s.completion, 0) / xs.length;
      L.push(`${lv} ${'mean'.padEnd(9)} ${bar(m)} ${pct(m).padStart(4)}`);
    }
    L.push('');
  }
  L.push('```');
  L.push('');
  const fl = flags(summaries);
  if (fl.length) {
    L.push('### Automatic flags');
    L.push('');
    for (const f of fl) L.push(`- ${f}`);
    L.push('');
  }

  L.push('## Per level');
  L.push('');
  for (const lv of levels) {
    const level = getLevel(lv);
    const cells = summaries.filter((s) => s.levelId === lv);
    if (!cells.length) continue;
    L.push(`### ${lv}: ${level.meta.name ?? level.meta.title}`);
    L.push('');
    L.push(`Par ${secs(level.meta.parTicks)}, ${level.coins.length} coins, ${level.guards.length} guards. ${level.meta.idea ?? ''}`);
    L.push('');
    L.push('| Persona | Win | Median | p90 | Spots/run (median) | Spot-free | Stars ★/★★/★★★ (mean) | Coins | Quit: spots / stuck / timeout | Soft-locked runs | Retries/run | Meows | Swaps |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const s of cells) {
      L.push(
        `| ${PERSONAS[s.persona].label} | ${pct(s.completion)} | ${secs(s.medianTicks)} (${ratio(s.medianTicks, s.parTicks)}x) | ${secs(s.p90Ticks)} (${ratio(s.p90Ticks, s.parTicks)}x) | ${s.spotsMean.toFixed(2)} (${s.spotsMedian}) | ${pct(s.spotFree)} | ${pct(s.starWin)} / ${pct(s.starCoins)} / ${pct(s.starClean)} (${s.starsMean.toFixed(2)}) | ${pct(s.coinShare)} | ${s.outcomes['quit-spots']} / ${s.outcomes['quit-stuck']} / ${s.outcomes.timeout} | ${pct(s.softLockedRuns / s.runs)} | ${s.retries.toFixed(2)} | ${s.meows.toFixed(1)} | ${s.swaps.toFixed(1)} |`,
      );
    }
    L.push('');
    const heat = mergeCounts(cells.filter((s) => s.persona !== 'oracle').map((s) => s.heat));
    const guards = mergeCounts(cells.filter((s) => s.persona !== 'oracle').map((s) => s.byGuard));
    const total = Object.values(heat).reduce((a, b) => a + b, 0);
    L.push(`Spot heatmap (all human personas, ${total} spots). Legend: \`1\` \`2\` cat spawns, \`g\` guard posts (first waypoint), \`p\` plates, \`D\` plate doors, \`V\` vault, \`k\` key, \`C\` crate, \`E\` exit; digits are spot counts.`);
    L.push('');
    L.push('```');
    L.push(heatmap(lv, heat));
    L.push('```');
    L.push('');
    if (total) {
      L.push(`Spots by guard: ${topK(guards, 8).map(([g, n]) => `${g} ${n} (${pct(n / total)})`).join(', ')}. Hottest tiles: ${topK(heat, 6).map(([t, n]) => `(${t}) ${n}`).join(', ')}.`);
      L.push('');
    }
    L.push('Quit points (where the active cat stood, the stage, and the last thing the bot was trying):');
    L.push('');
    L.push('| Persona | Quits | Top tiles | Stages | Last intent |');
    L.push('|---|---|---|---|---|');
    for (const s of cells) {
      const q = s.runs - s.wins;
      if (!q) {
        L.push(`| ${PERSONAS[s.persona].label} | 0 | – | – | – |`);
        continue;
      }
      L.push(
        `| ${PERSONAS[s.persona].label} | ${q} | ${topK(s.quitTiles, 3).map(([t, n]) => `(${t}) ${n}`).join(', ')} | ${topK(s.quitStages, 4).map(([t, n]) => `${t} ${n}`).join(', ')} | ${topK(s.quitWhy, 3).map(([t, n]) => `${t} ${n}`).join('; ')} |`,
      );
    }
    L.push('');
  }
  L.push('## Limits of the model');
  L.push('');
  L.push(
    '- The bots predict dogs by straight-line extrapolation and never learn patrol loops or sentry schedules beyond remembering which way a still dog has faced. Real players learn rhythms over retries; these bots play every run as a first attempt (no carry-over between seeds).',
  );
  L.push('- They know their own cats exactly and read the HUD instantly; the reaction delay applies to the world (dogs, cones, doors, coins).');
  L.push('- Steering is in grid directions with screen-key slop; it does not model touch controls or a gamepad stick.');
  L.push('- Quit thresholds are guesses at human patience; compare levels and personas against each other rather than reading the absolute completion rates as forecasts.');
  L.push('');
  return L.join('\n');
}
