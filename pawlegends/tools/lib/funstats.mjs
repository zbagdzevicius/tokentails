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
    score330: null,
    pickups: 0,
    bounties: 0,
    shutdowns: 0,
    comebacks: [0, 0],
    nineLives: 0,
    followTicks: 0,
    followN: 0,
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
        case 'buff':
          if (e.id === 0 && e.kind === 'nineLives') st.nineLives++;
          break;
        case 'levelup':
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
      score330: st.score330,
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

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
/** null (never happened) counts as +Infinity for medians of "time to". */
const orInf = (a) => a.map((x) => (x === null ? Infinity : x));

/** Batch numbers from per-match `fun` rows (and `ticks`, `reason`, `winner` on each). `sdTick` is the Sudden Death tick. */
export function aggregateFun(funRows, sdTick) {
  const n = funRows.length;
  const r = funRows;
  const trailing = r.filter((x) => x.score330 !== null && Math.abs(x.score330) >= 3);
  const trailingWon = trailing.filter((x) => (x.score330 < 0 ? x.winner === 0 : x.winner === 1)).length;
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
    pickupsMean: mean(r.map((x) => x.pickups)),
    bountiesMean: mean(r.map((x) => x.bounties)),
    shutdownsMean: mean(r.map((x) => x.shutdowns)),
    comebacksMean: mean(r.map((x) => x.comebacks[0] + x.comebacks[1])),
    nineLivesMean: mean(r.map((x) => x.nineLives)),
    /** Earliest defeat (s), Infinity when the player never lost. */
    earliestLoss: Math.min(Infinity, ...r.filter((x) => !x.won).map((x) => x.ticks / 30)),
    shortestMatch: Math.min(...r.map((x) => x.ticks / 30)),
    followShareMedian: 100 * median(r.map((x) => x.followShare)),
  };
}

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : 'never');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));

/** Gate checks: [name, pass, shown value]. `profileDifficulty` picks the novice / idle thresholds. */
export function funGates(gate, a, perHero, difficulty) {
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
  } else if (gate === 'idle') {
    add('idle win ≤ 50%', a.winRate <= 50, `${f1(a.winRate)}%`);
    if (difficulty === 'rookie') add('idle vs Rookie never loses before 6:00', a.earliestLoss >= 360, mmss(a.earliestLoss));
  } else if (gate === 'parked') {
    add('allies beside the parked human median ≤ 10% of the time', a.followShareMedian <= 10, `${f1(a.followShareMedian)}%`);
    add('no match ends within 2:00 of the park (0:30)', a.shortestMatch >= 150, mmss(a.shortestMatch));
  } else if (gate === 'balance') {
    const side = 100 - a.winRate; // slot 0 is Purrhaven: winRate is the Purrhaven share
    add('median 6:00 to 8:00', between(a.lengthMedian, 360, 480), mmss(a.lengthMedian));
    add('p95 ≤ 8:30', a.lengthP95 <= 510, mmss(a.lengthP95));
    add('no safety end', a.safetyEnds === 0, `${a.safetyEnds} safety ends`);
    add('≥ 70% core kill before Sudden Death', a.coreBeforeSD >= 70, `${f1(a.coreBeforeSD)}%`);
    add('side win rate 45% to 55%', between(a.winRate, 45, 55), `Purrhaven ${f1(a.winRate)}% / Woof ${f1(side)}%`);
    for (const [hero, h] of Object.entries(perHero)) {
      const rate = (100 * h.wins) / h.slots;
      add(`${hero} win rate 42% to 58%`, between(rate, 42, 58), `${f1(rate)}%`);
    }
    add('takedowns a minute 2.5 to 3.5', between(a.tdPerMin, 2.5, 3.5), a.tdPerMin.toFixed(2));
    add('trailing at 3:30 wins 30% to 40%', between(a.trailingWonRate, 30, 40), `${f1(a.trailingWonRate)}% of ${a.trailingAt330}`);
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
      `trailing at 3:30 won ${f1(a.trailingWonRate)}% of ${a.trailingAt330}`,
  ].join('\n');
}
