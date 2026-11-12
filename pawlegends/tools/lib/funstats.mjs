/**
 * Fun metrics for headless matches (docs/plans/moba fun plan S2, the `--fun` and `--gate` flags of
 * tools/headless-match.mjs). A tracker follows slot 0 (the player-bot) every tick from the match's own events and
 * entity arrays, so it costs nothing in the sim and never feeds back into it.
 *
 *   const t = createFunTracker(sim, m);  // after createMatch
 *   ...; sim.step(m, cmds); t.observe(); // every tick
 *   const row = t.finish(sim.result(m)); // per-match numbers (JSON-safe)
 *   const agg = aggregateFun(rows);      // medians and rates over a batch
 *   const gates = funGates('fun1', agg, rows, perHero);
 *
 * Definitions (all times in seconds):
 * - takedown: a hero death; the player's takedown: one it got the kill or an assist on.
 * - first fight: the first hit between slot 0 and an enemy hero (either way).
 * - in action: slot 0 dealt or took damage (any unit) in the last 2 s; the share is over its alive time.
 * - 90%-to-dead: per death of slot 0, time since it last stood at 90% HP or more.
 * - worst 1 s HP loss: the largest share of max HP slot 0 lost over any 30 ticks it was alive throughout.
 * - back in the fight: per death, from the death to slot 0's next hit dealt to or taken from an enemy unit.
 * - big moment: a takedown, a tower or core falling, Pudding calmed, slot 0 taking a pickup, a bounty or shutdown, a
 *   comeback wave, slot 0 reaching level 4 or 6. Gaps run from 0:00 to the end.
 * - trailing at 3:30: takedown difference + 3 per tower ≥ 3; the comeback rate is how often the trailing team won.
 * - behind at the end (sim v10, GAPS B0/B3): how often the team 5–9 or 10+ takedowns behind at the end still won.
 * - level gap at 6:00 (GAPS B0): the enemy heroes' average level minus the human's (as at 3:00 and 5:00).
 * - pings obeyed (GAPS B1): the share of slot 0's pings at least one ally bot took as an order (`ping` event `took`);
 *   null in a match without pings, and the aggregate shows "n/a" (and pings a match) when no match pinged.
 * - progression (sim v12, docs/FUN-PROGRESSION-V12.md S6): when the lobby's leader first reached level 4, 7 and 10;
 *   heroes at level 10 at the end; the human's and the lobby's mean level at each whole minute; when the median hero
 *   bought Toy tiers 1 to 3; whether the top-Fish hero bought tier 4; Fish by source over every hero (`fish` events;
 *   the rest of fishTotal is the passive trickle and comeback Fish); the team-average Toy gap at 6:00; the best
 *   enemy's Fish minus the human's at 3:00. A `buy` counts as a big moment (sim v12).
 */

const HERO = 1;
const MINION = 2;
const TOWER = 3;
const CORE = 4;
const ACTION_TICKS = 60;
const FULL_BP = 9000;

export function createFunTracker(sim, m) {
  const w = m.world;
  const HZ = sim.TICK_HZ;
  const alive = () => w.alive[0] === 1;
  const st = {
    firstFight: -1,
    firstTakedown: -1,
    firstMatchTakedown: -1,
    level2: -1,
    level4: -1,
    level6: -1,
    towerDeaths: 0,
    deathTicks: [],
    backIn: [],
    ttk: [],
    worst1s: 0,
    moments: [],
    takedowns: [0, 0],
    lastAction: -100000,
    actionTicks: 0,
    aliveTicks: 0,
    lastFull: 0,
    waitBack: -1,
    hpRing: new Float64Array(HZ + 1),
    ringN: 0,
    gap3: null,
    gap5: null,
    gap6: null,
    score330: null,
    score90: null,
    pings: 0,
    pingsObeyed: 0,
    pickups: 0,
    bounties: 0,
    shutdowns: 0,
    comebacks: [0, 0],
    nineLives: 0,
    followTicks: 0,
    followN: 0,
    lead4: -1,
    lead7: -1,
    lead10: -1,
    lvMin: [],
    lobbyMin: [],
    toyAt: [[], [], [], [], [], []],
    fishSrc: {},
    fishEvents: 0,
    toyGap6: null,
    fishGap3: null,
    fishRatio3: null,
  };
  let prevTD = 0;
  const levelGap = () => {
    let sum = 0;
    for (let h = 3; h < 6; h++) sum += w.level[h];
    return sum / 3 - w.level[0];
  };

  function observe() {
    const t = w.globals[0];
    for (const e of m.events) {
      switch (e.type) {
        case 'hit': {
          if (e.src === 0 || e.dst === 0) {
            const other = e.src === 0 ? e.dst : e.src;
            if (other >= 0 && w.team[other] !== w.team[0]) {
              st.lastAction = t;
              if (st.waitBack >= 0 && alive()) {
                st.backIn.push((t - st.waitBack) / HZ);
                st.waitBack = -1;
              }
              if (other < 6 && w.kind[other] === HERO && st.firstFight < 0) st.firstFight = t;
            }
          }
          break;
        }
        case 'death': {
          if (e.id < 6 && w.kind[e.id] === HERO) {
            st.moments.push(t);
            st.takedowns[e.id < 3 ? 1 : 0]++;
            if (st.firstMatchTakedown < 0) st.firstMatchTakedown = t;
            if (e.id === 0) {
              st.deathTicks.push(t);
              st.ttk.push((t - st.lastFull) / HZ);
              const k = e.killer >= 0 ? w.kind[e.killer] : 0;
              if (k === TOWER || k === CORE) st.towerDeaths++;
              st.waitBack = t;
              st.ringN = 0;
            }
          } else if (w.kind[e.id] === CORE) st.moments.push(t);
          break;
        }
        case 'tower':
          st.moments.push(t);
          break;
        case 'pudding':
          if (e.what === 'calmed') st.moments.push(t);
          break;
        case 'pickup':
          if (e.id === 0) {
            st.pickups++;
            st.moments.push(t);
          }
          break;
        case 'bounty':
          st.bounties++;
          st.moments.push(t);
          break;
        case 'shutdown':
          st.shutdowns++;
          st.moments.push(t);
          break;
        case 'comeback':
          st.comebacks[e.team]++;
          st.moments.push(t);
          break;
        case 'ping':
          st.pings++;
          if (e.took > 0) st.pingsObeyed++;
          break;
        case 'buff':
          if (e.id === 0 && e.kind === 'nineLives') st.nineLives++;
          break;
        case 'buy':
          if (e.id < 6) st.toyAt[e.id][e.tier - 1] = t;
          st.moments.push(t);
          break;
        case 'fish':
          st.fishSrc[e.reason] = (st.fishSrc[e.reason] ?? 0) + e.amount;
          st.fishEvents += e.amount;
          break;
        case 'levelup':
          if (e.level >= 4 && st.lead4 < 0) st.lead4 = t;
          if (e.level >= 7 && st.lead7 < 0) st.lead7 = t;
          if (e.level >= 10 && st.lead10 < 0) st.lead10 = t;
          if (e.id === 0) {
            if (e.level >= 2 && st.level2 < 0) st.level2 = t;
            if (e.level >= 4 && st.level4 < 0) {
              st.level4 = t;
              st.moments.push(t);
            }
            if (e.level >= 6 && st.level6 < 0) {
              st.level6 = t;
              st.moments.push(t);
            }
          }
          break;
        default:
          break;
      }
    }
    const s0 = m.stats[0];
    const td = s0.kills + s0.assists;
    if (td > prevTD && st.firstTakedown < 0) st.firstTakedown = t;
    prevTD = td;
    if (alive()) {
      st.aliveTicks++;
      if (t - st.lastAction < ACTION_TICKS) st.actionTicks++;
      const frac = Math.max(0, w.hp[0]) / w.maxHp[0];
      if (w.hp[0] * 10000 >= w.maxHp[0] * FULL_BP) st.lastFull = t;
      // Ring of the last HZ + 1 HP shares (the oldest is 1 s ago).
      st.hpRing[st.ringN % (HZ + 1)] = frac;
      st.ringN++;
      if (st.ringN > HZ) {
        const old = st.hpRing[st.ringN % (HZ + 1)];
        const drop = old - frac;
        if (drop > st.worst1s) st.worst1s = drop;
      }
    } else st.ringN = 0;
    // Carry leash (sim v5): from 0:40 on, how often both allies stand within 7 m of a living slot 0.
    if (t >= 40 * HZ && alive()) {
      st.followN++;
      let near = 0;
      for (let a = 1; a < 3; a++) if (w.alive[a] === 1 && (w.x[a] - w.x[0]) ** 2 + (w.y[a] - w.y[0]) ** 2 <= 7000 * 7000) near++;
      if (near === 2) st.followTicks++;
    }
    if (t === 180 * HZ) st.gap3 = levelGap();
    if (t === 300 * HZ) st.gap5 = levelGap();
    if (t === 360 * HZ) st.gap6 = levelGap();
    if (t > 0 && t % (60 * HZ) === 0) {
      st.lvMin.push(w.level[0]);
      let sum = 0;
      for (let h = 0; h < 6; h++) sum += w.level[h];
      st.lobbyMin.push(sum / 6);
    }
    if (t === 360 * HZ && w.toy) st.toyGap6 = Math.abs(w.toy[0] + w.toy[1] + w.toy[2] - w.toy[3] - w.toy[4] - w.toy[5]) / 3;
    if (t === 180 * HZ && w.fishTotal) {
      st.fishGap3 = Math.max(w.fishTotal[3], w.fishTotal[4], w.fishTotal[5]) - w.fishTotal[0];
      st.fishRatio3 = (w.fishTotal[3] + w.fishTotal[4] + w.fishTotal[5]) / 3 / Math.max(1, w.fishTotal[0]);
    }
    // Sim v22 (Blitz): the comeback check at 1:30 (Sunset), same score
    if (t === 90 * HZ) st.score90 = st.takedowns[0] - st.takedowns[1] + 3 * (w.globals[4] - w.globals[5]);
    if (t === 210 * HZ) st.score330 = st.takedowns[0] - st.takedowns[1] + 3 * (w.globals[4] - w.globals[5]);
  }

  function finish(res) {
    const HZf = HZ;
    const end = res.ticks;
    const ms = [0, ...st.moments.slice().sort((a, b) => a - b), end];
    const gaps = [];
    let gapMaxAt = 0;
    for (let i = 1; i < ms.length; i++) {
      gaps.push((ms[i] - ms[i - 1]) / HZf);
      if (gaps[i - 1] >= gaps[gapMaxAt]) gapMaxAt = i - 1;
    }
    const s0 = res.stats[0];
    const sec = (x) => (x < 0 ? null : x / HZf);
    return {
      won: res.winner === 0,
      winner: res.winner,
      reason: res.reason,
      ticks: end,
      kills: s0.kills,
      assists: s0.assists,
      deaths: s0.deaths,
      takedowns: s0.kills + s0.assists,
      heroDamage: s0.heroDamage,
      towerDeaths: st.towerDeaths,
      firstFight: sec(st.firstFight),
      firstTakedown: sec(st.firstTakedown),
      firstMatchTakedown: sec(st.firstMatchTakedown),
      level2: sec(st.level2),
      level4: sec(st.level4),
      level6: sec(st.level6),
      finalLevel: s0.level,
      teamTakedowns: st.takedowns,
      tdPerMin: (st.takedowns[0] + st.takedowns[1]) / (end / HZf / 60),
      actionShare: st.aliveTicks ? st.actionTicks / st.aliveTicks : 0,
      ttk: st.ttk,
      worst1s: st.worst1s,
      backIn: st.backIn,
      gap3: st.gap3,
      gap5: st.gap5,
      gap6: st.gap6,
      score330: st.score330,
      score90: st.score90,
      /** GAPS B1: pings slot 0 sent, and the share of them an ally took (null without pings). */
      pings: st.pings,
      pingsObeyedShare: st.pings ? st.pingsObeyed / st.pings : null,
      gapMedian: median(gaps),
      gapMax: Math.max(...gaps),
      /** When the longest quiet stretch started (s). */
      gapMaxFrom: ms[gapMaxAt] / HZf,
      pickups: st.pickups,
      bounties: st.bounties,
      shutdowns: st.shutdowns,
      comebacks: st.comebacks,
      nineLives: st.nineLives,
      followShare: st.followN ? st.followTicks / st.followN : 0,
      lead4: sec(st.lead4),
      lead7: sec(st.lead7),
      lead10: sec(st.lead10),
      level10Heroes: res.stats.filter((x) => x.level >= 10).length,
      lvMin: st.lvMin,
      lobbyMin: st.lobbyMin,
      /** Per tier 1..3: the median of the six heroes' purchase times (null = Infinity: never). */
      toyMedian: [0, 1, 2, 3].map((k) => {
        const times = st.toyAt.map((a) => (a[k] === undefined ? Infinity : a[k] / HZf)).sort((a, b) => a - b);
        return (times[2] + times[3]) / 2;
      }),
      topT4: (() => {
        if (!w.fishTotal) return false;
        let top = 0;
        for (let h = 1; h < 6; h++) if (w.fishTotal[h] > w.fishTotal[top]) top = h;
        return w.toy[top] >= 4;
      })(),
      fishSrc: st.fishSrc,
      fishAll: w.fishTotal ? Array.from(w.fishTotal).reduce((a, b) => a + b, 0) : 0,
      fishEvents: st.fishEvents,
      toyGap6: st.toyGap6,
      fishGap3: st.fishGap3,
      fishRatio3: st.fishRatio3,
    };
  }

  return { observe, finish };
}

export function median(a) {
  return pct(a, 50);
}

/** p-th percentile (nearest rank on the sorted copy); NaN for an empty list. */
export function pct(a, p) {
  const s = a.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
}

/** Takedown gap at the end that counts as "losing every fight" (playtest round 1 gate: such a team wins < 5%). */
export const DEFICIT = 10;
/** GAPS B0/B3: the smaller "behind at the end" band, 5 to DEFICIT − 1 takedowns. */
export const BEHIND = 5;

/** How often the team `lo`..`hi` takedowns behind at the end won (null hi: no upper bound). */
export function behindWon(funRows, lo, hi = null) {
  const rows = funRows.filter((x) => {
    const gap = Math.abs(x.teamTakedowns[0] - x.teamTakedowns[1]);
    return gap >= lo && (hi === null || gap <= hi);
  });
  const won = rows.filter((x) => (x.teamTakedowns[0] < x.teamTakedowns[1] ? x.winner === 0 : x.winner === 1)).length;
  return { matches: rows.length, wonRate: rows.length ? (100 * won) / rows.length : 0 };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
/** null (never happened) counts as +Infinity for medians of "time to". */
const orInf = (a) => a.map((x) => (x === null ? Infinity : x));

/** Batch numbers from per-match `fun` rows (and `ticks`, `reason`, `winner` on each). `sdTick` is the Sudden Death tick. */
export function aggregateFun(funRows, sdTick) {
  const n = funRows.length;
  const r = funRows;
  const trailing = r.filter((x) => x.score330 !== null && Math.abs(x.score330) >= 3);
  const trailingWon = trailing.filter((x) => (x.score330 < 0 ? x.winner === 0 : x.winner === 1)).length;
  // Sim v22 (Blitz): the same at 1:30
  const trailing90 = r.filter((x) => x.score90 !== null && x.score90 !== undefined && Math.abs(x.score90) >= 3);
  const trailing90Won = trailing90.filter((x) => (x.score90 < 0 ? x.winner === 0 : x.winner === 1)).length;
  // Playtest round 1 ("kills barely decide the match"): a team down DEFICIT or more takedowns at the end.
  const deficit = r.filter((x) => Math.abs(x.teamTakedowns[0] - x.teamTakedowns[1]) >= DEFICIT);
  const deficitWon = deficit.filter((x) => (x.teamTakedowns[0] < x.teamTakedowns[1] ? x.winner === 0 : x.winner === 1)).length;
  return {
    matches: n,
    winRate: (100 * r.filter((x) => x.won).length) / n,
    deathsMedian: median(r.map((x) => x.deaths)),
    deathsP90: pct(r.map((x) => x.deaths), 90),
    deathsMean: mean(r.map((x) => x.deaths)),
    towerDeathsMean: mean(r.map((x) => x.towerDeaths)),
    killsMean: mean(r.map((x) => x.kills)),
    takedownsMedian: median(r.map((x) => x.takedowns)),
    firstTakedownUnder60: (100 * r.filter((x) => x.firstTakedown !== null && x.firstTakedown < 60).length) / n,
    firstTakedownMedian: median(orInf(r.map((x) => x.firstTakedown))),
    firstFightMedian: median(orInf(r.map((x) => x.firstFight))),
    firstMatchTakedownMedian: median(orInf(r.map((x) => x.firstMatchTakedown))),
    level2Median: median(orInf(r.map((x) => x.level2))),
    level4Median: median(orInf(r.map((x) => x.level4))),
    level4P90: pct(orInf(r.map((x) => x.level4)), 90),
    lengthMedian: median(r.map((x) => x.ticks)) / 30,
    lengthP95: pct(r.map((x) => x.ticks), 95) / 30,
    coreBeforeSD: (100 * r.filter((x) => x.reason === 'core' && x.ticks < sdTick).length) / n,
    safetyEnds: r.filter((x) => x.reason === 'safetyEnd').length,
    /** Sim v22 (Blitz): designed ends at 3:15, and draws among them. */
    timeUps: r.filter((x) => x.reason === 'timeUp').length,
    draws: r.filter((x) => x.winner === -1).length,
    coreKills: (100 * r.filter((x) => x.reason === 'core').length) / n,
    lengthP90: pct(r.map((x) => x.ticks), 90) / 30,
    trailingAt90: trailing90.length,
    trailing90WonRate: trailing90.length ? (100 * trailing90Won) / trailing90.length : NaN,
    actionShare: 100 * median(r.map((x) => x.actionShare)),
    gapMedian: median(r.map((x) => x.gapMedian)),
    gapMaxMedian: median(r.map((x) => x.gapMax)),
    gapMaxP90: pct(r.map((x) => x.gapMax), 90),
    backInMedian: median(r.flatMap((x) => x.backIn)),
    worst1sP99: 100 * pct(r.map((x) => x.worst1s), 99),
    worst1sMedian: 100 * median(r.map((x) => x.worst1s)),
    ttkMedian: median(r.flatMap((x) => x.ttk)),
    ttkP10: pct(r.flatMap((x) => x.ttk), 10),
    tdPerMin: mean(r.map((x) => x.tdPerMin)),
    gap3Median: median(r.map((x) => x.gap3)),
    gap5Median: median(r.map((x) => x.gap5)),
    trailingAt330: trailing.length,
    trailingWonRate: trailing.length ? (100 * trailingWon) / trailing.length : NaN,
    deficitMatches: deficit.length,
    deficitWonRate: deficit.length ? (100 * deficitWon) / deficit.length : 0,
    /** Sim v10 (GAPS B0): win rate of the team 5–9 and 10+ takedowns behind at the end. */
    behind5to9: behindWon(r, BEHIND, DEFICIT - 1),
    behind10plus: behindWon(r, DEFICIT),
    gap6Median: median(r.map((x) => x.gap6)),
    /** GAPS B1: pings a match, and the mean share obeyed over matches with pings (null when none pinged). */
    pingsMean: mean(r.map((x) => x.pings ?? 0)),
    pingsObeyed: (() => {
      const shares = r.map((x) => x.pingsObeyedShare).filter((x) => x !== null && x !== undefined);
      return shares.length ? 100 * mean(shares) : null;
    })(),
    pickupsMean: mean(r.map((x) => x.pickups)),
    bountiesMean: mean(r.map((x) => x.bounties)),
    shutdownsMean: mean(r.map((x) => x.shutdowns)),
    comebacksMean: mean(r.map((x) => x.comebacks[0] + x.comebacks[1])),
    nineLivesMean: mean(r.map((x) => x.nineLives)),
    /** Earliest defeat (s), Infinity when the player never lost. */
    earliestLoss: Math.min(Infinity, ...r.filter((x) => !x.won).map((x) => x.ticks / 30)),
    shortestMatch: Math.min(...r.map((x) => x.ticks / 30)),
    followShareMedian: 100 * median(r.map((x) => x.followShare)),
    lead4Median: median(orInf(r.map((x) => x.lead4))),
    lead7Median: median(orInf(r.map((x) => x.lead7))),
    lead10Median: median(orInf(r.map((x) => x.lead10))),
    level10Share: (100 * r.reduce((a, x) => a + (x.level10Heroes ?? 0), 0)) / (6 * n),
    /** Median human level and mean lobby level at minute 1, 2, ... (only matches still running that minute). */
    lvByMin: Array.from({ length: 11 }, (_, k) => median(r.map((x) => x.lvMin?.[k]).filter((v) => v !== undefined))),
    lobbyByMin: Array.from({ length: 11 }, (_, k) => mean(r.map((x) => x.lobbyMin?.[k]).filter((v) => v !== undefined))),
    toyMedians: [0, 1, 2, 3].map((k) => median(r.map((x) => (x.toyMedian ? x.toyMedian[k] : Infinity)))),
    topT4Rate: (100 * r.filter((x) => x.topT4).length) / n,
    fishBySource: (() => {
      const all = r.reduce((a, x) => a + (x.fishAll ?? 0), 0) || 1;
      const by = {};
      for (const x of r) for (const [k, v] of Object.entries(x.fishSrc ?? {})) by[k] = (by[k] ?? 0) + v;
      const ev = r.reduce((a, x) => a + (x.fishEvents ?? 0), 0);
      const pctOf = (v) => (100 * v) / all;
      return {
        killsAssists: pctOf((by.kill ?? 0) + (by.assist ?? 0) + (by.firstBlood ?? 0) + (by.shutdown ?? 0)),
        minions: pctOf((by.minion ?? 0) + (by.lastHit ?? 0)),
        camp: pctOf(by.camp ?? 0),
        objectives: pctOf((by.tower ?? 0) + (by.pudding ?? 0) + (by.pickup ?? 0)),
        passive: pctOf(all - ev),
      };
    })(),
    toyGap6Median: median(r.map((x) => x.toyGap6)),
    toyGap6P95: pct(r.map((x) => x.toyGap6), 95),
    fishGap3Median: median(r.map((x) => x.fishGap3)),
    fishRatio3Median: median(r.map((x) => x.fishRatio3)),
  };
}

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : 'never');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));

/** Gate checks: [name, pass, shown value]. `profileDifficulty` picks the novice / idle thresholds. */
export function funGates(gate, a, perHero, difficulty, catHeroes = []) {
  const g = [];
  const add = (name, ok, value) => g.push([name, Boolean(ok), value]);
  const between = (x, lo, hi) => x >= lo && x <= hi;
  if (gate === 'fun1') {
    add('win ≥ 85%', a.winRate >= 85, `${f1(a.winRate)}%`);
    add('player deaths median ≤ 3', a.deathsMedian <= 3, a.deathsMedian);
    add('player deaths p90 ≤ 4', a.deathsP90 <= 4, a.deathsP90);
    add('tower deaths mean ≤ 1', a.towerDeathsMean <= 1, a.towerDeathsMean.toFixed(2));
    add('player takedowns median ≥ 5', a.takedownsMedian >= 5, a.takedownsMedian);
    add('first player takedown < 60 s in ≥ 80%', a.firstTakedownUnder60 >= 80, `${f1(a.firstTakedownUnder60)}%`);
    add('first fight with a hero median ≤ 25 s', a.firstFightMedian <= 25, `${f1(a.firstFightMedian)} s`);
    add("match's first takedown median ≤ 40 s", a.firstMatchTakedownMedian <= 40, `${f1(a.firstMatchTakedownMedian)} s`);
    add('Level 2 median ≤ 0:30', a.level2Median <= 30, mmss(a.level2Median));
    add('Level 4 median ≤ 2:00', a.level4Median <= 120, mmss(a.level4Median));
    add('Level 4 p90 ≤ 2:30', a.level4P90 <= 150, mmss(a.level4P90));
    add('length median 5:00 to 6:00', between(a.lengthMedian, 300, 360), mmss(a.lengthMedian));
    add('length p95 ≤ 7:00', a.lengthP95 <= 420, mmss(a.lengthP95));
    add('≥ 85% end by core kill before Sudden Death', a.coreBeforeSD >= 85, `${f1(a.coreBeforeSD)}%`);
    add('time in action ≥ 60%', a.actionShare >= 60, `${f1(a.actionShare)}%`);
    add('big-moment gap median ≤ 30 s', a.gapMedian <= 30, `${f1(a.gapMedian)} s`);
    add('longest gap per match median ≤ 45 s', a.gapMaxMedian <= 45, `${f1(a.gapMaxMedian)} s`);
    add('longest gap per match p90 ≤ 60 s', a.gapMaxP90 <= 60, `${f1(a.gapMaxP90)} s`);
    add('back in the fight median ≤ 12 s', a.backInMedian <= 12, `${f1(a.backInMedian)} s`);
    add('worst 1 s HP loss p99 ≤ 35%', a.worst1sP99 <= 35, `${f1(a.worst1sP99)}%`);
    add('90%-to-dead median 5 to 6 s', between(a.ttkMedian, 5, 6), `${f1(a.ttkMedian)} s`);
    add('90%-to-dead p10 ≥ 3 s', a.ttkP10 >= 3, `${f1(a.ttkP10)} s`);
  } else if (gate === 'fun2') {
    add('win 70% to 80%', between(a.winRate, 70, 80), `${f1(a.winRate)}%`);
    add('deaths median ≤ 4', a.deathsMedian <= 4, a.deathsMedian);
    add('takedowns median ≥ 4', a.takedownsMedian >= 4, a.takedownsMedian);
    add('Level 4 median ≤ 2:15', a.level4Median <= 135, mmss(a.level4Median));
    add('length median 6:00 to 7:30', between(a.lengthMedian, 360, 450), mmss(a.lengthMedian));
    add('takedowns a minute 2.5 to 3.5', between(a.tdPerMin, 2.5, 3.5), a.tdPerMin.toFixed(2));
    add('level gap at 5:00 median ≤ 1', a.gap5Median <= 1, f1(a.gap5Median));
  } else if (gate === 'novice') {
    const floor = difficulty === 'normal' ? 40 : 85;
    add(`novice vs ${difficulty} win ≥ ${floor}%`, a.winRate >= floor, `${f1(a.winRate)}%`);
    // Sim v8 (playtest round 2: "we won down 11 on Normal"): the deficit rule holds with a human player-bot too.
    if (difficulty === 'normal' || difficulty === 'hard') add(`down ${DEFICIT}+ takedowns at the end wins < 5%`, a.deficitWonRate < 5, `${f1(a.deficitWonRate)}% of ${a.deficitMatches}`);
  } else if (gate === 'idle') {
    add('idle win ≤ 50%', a.winRate <= 50, `${f1(a.winRate)}%`);
    if (difficulty === 'rookie') add('idle vs Rookie never loses before 6:00', a.earliestLoss >= 360, mmss(a.earliestLoss));
  } else if (gate === 'hard') {
    // Sim v6 Hard: a Normal-level player wins clearly less than half, but can win. Sim v8 (playtest round 2: "Hard
    // tests how much you can carry"): Hard is a mirror, the allies play at Hard too, so the Normal-level player is the
    // weakest of six and its own play is the gap: 30% to 48% (it was 20% to 40% with two Normal allies).
    add('Normal player vs Hard win 30% to 48%', between(a.winRate, 30, 48), `${f1(a.winRate)}%`);
    add('no safety end', a.safetyEnds === 0, `${a.safetyEnds} safety ends`);
    // Sim v12: 5:30 to 9:00 (Sunset 6:45, Sudden Death 8:30; 8:30 before).
    add('length median 5:30 to 9:00', between(a.lengthMedian, 330, 540), mmss(a.lengthMedian));
    add(`down ${DEFICIT}+ takedowns at the end wins < 5%`, a.deficitWonRate < 5, `${f1(a.deficitWonRate)}% of ${a.deficitMatches}`);
  } else if (gate === 'feeder') {
    add('feeder vs Rookie win ≥ 80%', a.winRate >= 80, `${f1(a.winRate)}%`);
  } else if (gate === 'feedNormal') {
    add(`feeder vs ${difficulty}: down ${DEFICIT}+ takedowns at the end wins < 5%`, a.deficitWonRate < 5, `${f1(a.deficitWonRate)}% of ${a.deficitMatches}`);
  } else if (gate === 'parked') {
    add('allies beside the parked human median ≤ 10% of the time', a.followShareMedian <= 10, `${f1(a.followShareMedian)}%`);
    add('no match ends within 2:00 of the park (0:30)', a.shortestMatch >= 150, mmss(a.shortestMatch));
  } else if (gate === 'balance') {
    const side = 100 - a.winRate; // slot 0 is Purrhaven: winRate is the Purrhaven share
    // Sim v12 (docs/FUN-PROGRESSION-V12.md S3, S6): Normal's Sunset and Sudden Death moved 45 s later (6:45, 8:30), so the
    // length band is 6:30 to 9:00 and p95 ≤ 10:30 (6:00 to 8:00 and 8:30 before).
    add('median 6:30 to 9:00', between(a.lengthMedian, 390, 540), mmss(a.lengthMedian));
    add('p95 ≤ 10:30', a.lengthP95 <= 630, mmss(a.lengthP95));
    add('no safety end', a.safetyEnds === 0, `${a.safetyEnds} safety ends`);
    add('≥ 70% core kill before Sudden Death', a.coreBeforeSD >= 70, `${f1(a.coreBeforeSD)}%`);
    add('side win rate 45% to 55%', between(a.winRate, 45, 55), `Purrhaven ${f1(a.winRate)}% / Woof ${f1(side)}%`);
    for (const [hero, h] of Object.entries(perHero)) {
      const rate = (100 * h.wins) / h.slots;
      add(`${hero} win rate 46% to 54%`, between(rate, 46, 54), `${f1(rate)}%`);
    }
    // Sim v9: every match is cats vs dogs (teams are one species), so the map-side check misses a species edge: the
    // cat heroes' slot-weighted win rate must sit in 47% to 53%.
    if (catHeroes.length) {
      let wins = 0;
      let slots = 0;
      for (const [hero, h] of Object.entries(perHero)) {
        if (!catHeroes.includes(hero)) continue;
        wins += h.wins;
        slots += h.slots;
      }
      const cats = slots ? (100 * wins) / slots : 0;
      add('cat species win rate 47% to 53%', between(cats, 47, 53), `cats ${f1(cats)}% / dogs ${f1(100 - cats)}%`);
    }
    add('takedowns a minute 2.5 to 3.5', between(a.tdPerMin, 2.5, 3.5), a.tdPerMin.toFixed(2));
    // Sim v7 (playtest round 1: "kills barely decide the match"): a lead in fights is worth more, so the 3:30
    // comeback band moved from 30%..40% to 20%..40%, and a team down DEFICIT+ takedowns at the end wins < 5%.
    add('trailing at 3:30 wins 20% to 40%', between(a.trailingWonRate, 20, 40), `${f1(a.trailingWonRate)}% of ${a.trailingAt330}`);
    add(`down ${DEFICIT}+ takedowns at the end wins < 5%`, a.deficitWonRate < 5, `${f1(a.deficitWonRate)}% of ${a.deficitMatches}`);
  } else if (gate === 'blitz') {
    // Sim v22 (WR-BS-PLAN.md §4.3): the ~3-minute Crossing match. Takedowns 4 to 6 a minute is a written Blitz-only
    // exception to the 3v3 band (2.5 to 3.5).
    add('median 2:30 to 3:15', between(a.lengthMedian, 150, 195), mmss(a.lengthMedian));
    add('p90 ≤ 3:10', a.lengthP90 <= 190, mmss(a.lengthP90));
    add('≥ 85% decided by a core kill', a.coreKills >= 85, `${f1(a.coreKills)}% (time up ${a.timeUps})`);
    add('draws ≤ 1%', (100 * a.draws) / a.matches <= 1, `${a.draws} of ${a.matches}`);
    add('no safety end', a.safetyEnds === 0, `${a.safetyEnds} safety ends`);
    add('side win rate 47% to 53%', between(a.winRate, 47, 53), `Purrhaven ${f1(a.winRate)}% / Woof ${f1(100 - a.winRate - (100 * a.draws) / a.matches)}%`);
    for (const [hero, h] of Object.entries(perHero)) {
      const rate = (100 * h.wins) / h.slots;
      add(`${hero} win rate 46% to 54%`, between(rate, 46, 54), `${f1(rate)}%`);
    }
    if (catHeroes.length) {
      let wins = 0;
      let slots = 0;
      for (const [hero, h] of Object.entries(perHero)) {
        if (!catHeroes.includes(hero)) continue;
        wins += h.wins;
        slots += h.slots;
      }
      const cats = slots ? (100 * wins) / slots : 0;
      add('cat species win rate 47% to 53%', between(cats, 47, 53), `cats ${f1(cats)}%`);
    }
    add('takedowns a minute 4.0 to 6.0 (Blitz exception)', between(a.tdPerMin, 4, 6), a.tdPerMin.toFixed(2));
    add('trailing at 1:30 wins 20% to 40%', between(a.trailing90WonRate, 20, 40), `${f1(a.trailing90WonRate)}% of ${a.trailingAt90}`);
    add(`down ${DEFICIT}+ takedowns at the end wins < 5%`, a.deficitWonRate < 5, `${f1(a.deficitWonRate)}% of ${a.deficitMatches}`);
  } else if (gate === 'blitzNovice') {
    add(`novice vs ${difficulty} in Blitz win ≥ 60%`, a.winRate >= 60, `${f1(a.winRate)}%`);
  } else throw new Error(`unknown gate ${gate}`);
  return g;
}

/** Human-readable --fun block. */
export function formatFun(a) {
  return [
    `  player: win ${f1(a.winRate)}%, deaths median ${a.deathsMedian} (p90 ${a.deathsP90}, mean ${f1(a.deathsMean)}), by tower ${a.towerDeathsMean.toFixed(2)} a match, ` +
      `kills ${a.killsMean.toFixed(2)} a match, takedowns median ${a.takedownsMedian}`,
    `  first: fight ${f1(a.firstFightMedian)} s, player takedown ${f1(a.firstTakedownMedian)} s (< 60 s in ${f1(a.firstTakedownUnder60)}%), match takedown ${f1(a.firstMatchTakedownMedian)} s`,
    `  levels: L2 ${mmss(a.level2Median)}, L4 ${mmss(a.level4Median)} (p90 ${mmss(a.level4P90)}); gap to enemy average at 3:00 ${f1(a.gap3Median)}, at 5:00 ${f1(a.gap5Median)}`,
    `  length: median ${mmss(a.lengthMedian)}, p95 ${mmss(a.lengthP95)}, core kill before Sudden Death ${f1(a.coreBeforeSD)}%, safety ends ${a.safetyEnds}`,
    `  pace: takedowns ${a.tdPerMin.toFixed(2)} a minute, in action ${f1(a.actionShare)}%, big-moment gap median ${f1(a.gapMedian)} s, longest median ${f1(a.gapMaxMedian)} s (p90 ${f1(a.gapMaxP90)} s)`,
    `  burst: 90%-to-dead median ${f1(a.ttkMedian)} s (p10 ${f1(a.ttkP10)} s), worst 1 s loss median ${f1(a.worst1sMedian)}% (p99 ${f1(a.worst1sP99)}%), back in the fight ${f1(a.backInMedian)} s`,
    `  moments: pickups ${f1(a.pickupsMean)}, bounties ${f1(a.bountiesMean)}, shutdowns ${f1(a.shutdownsMean)}, comebacks ${f1(a.comebacksMean)}, Nine Lives ${f1(a.nineLivesMean)} a match; ` +
      `trailing at 3:30 won ${f1(a.trailingWonRate)}% of ${a.trailingAt330}; down ${DEFICIT}+ takedowns at the end won ${f1(a.deficitWonRate)}% of ${a.deficitMatches}`,
    `  behind at the end: ${BEHIND}–${DEFICIT - 1} takedowns won ${f1(a.behind5to9.wonRate)}% of ${a.behind5to9.matches}, ` +
      `${DEFICIT}+ won ${f1(a.behind10plus.wonRate)}% of ${a.behind10plus.matches}; human level gap at 6:00 ${f1(a.gap6Median)}; ` +
      `pings ${f1(a.pingsMean)} a match, obeyed ${a.pingsObeyed === null ? 'n/a (no pings)' : `${f1(a.pingsObeyed)}%`}`,
    `  progression: leader L4 ${mmss(a.lead4Median)}, L7 ${mmss(a.lead7Median)}, L10 ${mmss(a.lead10Median)}; heroes at L10 ${f1(a.level10Share)}%; ` +
      `human level by minute ${a.lvByMin.map((v) => (Number.isFinite(v) ? v : '-')).join(' ')}; lobby ${a.lobbyByMin.map((v) => (Number.isFinite(v) ? v.toFixed(1) : '-')).join(' ')}`,
    `  toys: median hero T1 ${mmss(a.toyMedians[0])}, T2 ${mmss(a.toyMedians[1])}, T3 ${mmss(a.toyMedians[2])}, T4 ${mmss(a.toyMedians[3])}; top-Fish hero T4 ${f1(a.topT4Rate)}%; ` +
      `tier gap at 6:00 median ${f1(a.toyGap6Median)} (p95 ${f1(a.toyGap6P95)}); Fish gap best enemy − human at 3:00 median ${f1(a.fishGap3Median)}, enemy mean ÷ human ${Number.isFinite(a.fishRatio3Median) ? a.fishRatio3Median.toFixed(2) : 'n/a'}`,
    `  fish by source: kills+assists ${f1(a.fishBySource.killsAssists)}%, minions ${f1(a.fishBySource.minions)}%, camp ${f1(a.fishBySource.camp)}%, ` +
      `objectives ${f1(a.fishBySource.objectives)}%, passive+comeback ${f1(a.fishBySource.passive)}%`,
  ].join('\n');
}
