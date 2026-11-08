#!/usr/bin/env node
/**
 * Multi-client PvP soak (docs/plans/moba/V16.md §3.3 and "Not done"; README "Multiplayer soak"): MATCHES full matches
 * against a local relay, CONCURRENCY rooms at a time, each room a child process running the game's own net code
 * (tests/e2e/mp/soak/room.ts: PartySocket, NetHost with the inline NetCore, LockstepRunner, Pacer) for 6 casual PvP
 * clients through the casual queue or 3 co-op clients through a friend party, with scripted inputs and random drops
 * (network drop and resume, reload, long absence). Every room is checked by the clients' hash trails, the referee's
 * verified verdict, the `/live` party save of every seat and a local re-sim of the replay record (room.ts).
 *
 * The relay is backend/test/pawlegends-soak.harness.ts (the production PartyRelay and worker referee pool, memory
 * stores, local tickets), started here unless RELAY points at a running one. Never point RELAY at production.
 *
 *   npm run soak                                   # 200 matches, 8 rooms at a time, 75% PvP
 *   MATCHES=20 CONCURRENCY=4 npm run soak          # a short run
 *   MINUTES=120 MATCHES=100000 npm run soak        # as many as fit in two hours
 *
 * Env: MATCHES (200), CONCURRENCY (8), PVP_SHARE (0.75), DROP_RATE (0.5: rooms with drops), SURRENDER_RATE (0.1 of
 * PvP rooms), MINUTES (no new rooms after it), SEED (random), PORT (3121), RELAY (external relay URL), OUT (report
 * directory, default .soak-dist), REFEREE_INLINE=1, SOAK_VERBOSE=1. Exit 1 when any room failed a check.
 */
import { fork, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, '../../..');
const BACKEND = resolve(PKG, '../backend');
const DIST = join(PKG, '.soak-dist');
const env = process.env;
const MATCHES = Number(env.MATCHES ?? 200);
const CONCURRENCY = Number(env.CONCURRENCY ?? 8);
const PVP_SHARE = Number(env.PVP_SHARE ?? 0.75);
const DROP_RATE = Number(env.DROP_RATE ?? 0.5);
const SURRENDER_RATE = Number(env.SURRENDER_RATE ?? 0.1);
const MINUTES = Number(env.MINUTES ?? 0);
const SEED = Number(env.SEED ?? Math.floor(Math.random() * 1e9));
const PORT = Number(env.PORT ?? 3121);
const OUT = resolve(env.OUT ?? DIST);
const ROOM_MAX_MS = 14 * 60_000;
const t0 = Date.now();
const say = (...a) => console.log(`[soak +${Math.round((Date.now() - t0) / 1000)}s]`, ...a);

// 1. the client bundle: the room script with the game's net code, the sim hash computed as the game build does
const stamp = JSON.parse(readFileSync(join(PKG, 'src/net/sim-stamp.json'), 'utf8'));
const { simSourceHash } = await import(join(PKG, 'tools/lib/sim-source-hash.mjs'));
const { build } = await import('rolldown');
mkdirSync(DIST, { recursive: true });
await build({
  input: join(here, 'soak/room.ts'),
  platform: 'node',
  logLevel: 'warn',
  transform: { define: { __SIM_HASH__: JSON.stringify(simSourceHash()), __SIM_GOLDEN__: JSON.stringify(stamp.golden ?? '') } },
  output: { file: join(DIST, 'room.mjs'), format: 'esm' },
});
say(`bundled room client (sim v${stamp.simVersion}, hash ${simSourceHash()})`);

// 2. the relay
let relayProc = null;
const RELAY = env.RELAY ?? `http://127.0.0.1:${PORT}`;
if (!env.RELAY) {
  // type-checked ts-node (not --transpile-only): the `/live` path loads Mongoose schemas whose decorators need the
  // emitted type metadata. The compiler stays in the relay's heap, so memory is reported as growth over the start.
  relayProc = spawn(join(BACKEND, 'node_modules/.bin/ts-node'), ['-r', 'tsconfig-paths/register', 'test/pawlegends-soak.harness.ts'], {
    cwd: BACKEND,
    env: { ...env, PORT: String(PORT), SOAK_QUIET: env.SOAK_VERBOSE === '1' ? '0' : '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  relayProc.on('exit', (code) => {
    if (!stopping) {
      console.error(`[soak] relay exited (${code})`);
      process.exit(2);
    }
  });
}
let stopping = false;
const health = async () => (await fetch(`${RELAY}/health`)).json();
for (let i = 0; ; i++) {
  try {
    await health();
    break;
  } catch {
    if (i > 240) throw new Error(`relay not up at ${RELAY}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}
const sim = await (await fetch(`${RELAY}/pawlegends/sim`)).json();
say(`relay up at ${RELAY} (backend live sim ${JSON.stringify(sim).slice(0, 120)})`);

// 3. rooms: CONCURRENCY child processes; the casual queue is entered by one room at a time (the matchmaker would mix
// two rooms' clients that queue together: correct, but the room checks need their own six)
const results = [];
const running = new Set();
let started = 0;
let lockHeld = null;
const lockQueue = [];
const grant = () => {
  if (lockHeld || !lockQueue.length) return;
  lockHeld = lockQueue.shift();
  lockHeld.send({ t: 'lock-ok' });
};
const R = (() => {
  let a = SEED >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

function startRoom() {
  const index = started++;
  const mode = R() < PVP_SHARE ? 'pvp' : 'coop';
  const seed = Math.floor(R() * 2 ** 31);
  const cfg = { relay: RELAY, mode, index, seed, dropRate: DROP_RATE, surrenderRate: SURRENDER_RATE, maxMs: ROOM_MAX_MS };
  const child = fork(join(DIST, 'room.mjs'), [], { env: { ...env, SOAK_ROOM: JSON.stringify(cfg) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  running.add(child);
  let result = null;
  const kill = setTimeout(() => child.kill('SIGKILL'), ROOM_MAX_MS + 3 * 60_000);
  child.on('message', (m) => {
    if (m?.t === 'lock') {
      lockQueue.push(child);
      grant();
    } else if (m?.t === 'unlock' && lockHeld === child) {
      lockHeld = null;
      grant();
    } else if (m?.t === 'result') result = m.result;
  });
  return new Promise((done) => {
    child.on('exit', (code) => {
      clearTimeout(kill);
      running.delete(child);
      if (lockHeld === child) {
        lockHeld = null;
        grant();
      }
      const i = lockQueue.indexOf(child);
      if (i >= 0) lockQueue.splice(i, 1);
      const r = result ?? { index, mode, seed, ok: false, problems: [`room process exited (${code}) without a result`] };
      results.push(r);
      const tag = r.ok ? 'ok' : `FAIL ${r.problems.join('; ')}`;
      say(`room ${index} ${mode} ${r.room ?? '-'} ${r.ticks ?? 0} ticks ${r.outcome ?? ''} in ${Math.round((r.wallMs ?? 0) / 1000)} s: ${tag} (${results.length}/${MATCHES})`);
      done();
    });
  });
}

// relay samples every 10 s: CPU (whole process: event loop and referee workers), memory, live rooms, loop delay
const samples = [];
let prevCpu = null;
const sampler = setInterval(async () => {
  try {
    const h = await health();
    const cpu = h.cpuUserUs + h.cpuSystemUs;
    const at = Date.now();
    if (prevCpu) samples.push({ at, cpuPct: ((cpu - prevCpu.cpu) / 1000 / (at - prevCpu.at)) * 100, rssMb: h.rss / 1e6, heapMb: h.heapUsed / 1e6, rooms: h.rooms_live, sockets: h.sockets, loopP99: h.loop_delay_p99, overrunP99: h.turn_overrun_ms_p99, refLag: h.referee_lag_turns });
    prevCpu = { cpu, at };
  } catch {
    /* the relay is busy: next sample */
  }
}, 10_000);

const h0 = await health();
const deadline = MINUTES > 0 ? t0 + MINUTES * 60_000 : Infinity;
const pending = [];
while (started < MATCHES && Date.now() < deadline) {
  while (running.size >= CONCURRENCY) await new Promise((r) => setTimeout(r, 250));
  pending.push(startRoom());
  // stagger the starts (the relay's upgrade rate, and the rooms' phases spread out)
  await new Promise((r) => setTimeout(r, 1500));
}
await Promise.all(pending);
clearInterval(sampler);
const h1 = await health();
const ev = await (await fetch(`${RELAY}/soak/events`)).json();

// 4. the report
const pct = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]);
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const by = (mode) => results.filter((r) => mode === 'all' || r.mode === mode);
const row = (mode) => {
  const rs = by(mode);
  const done = rs.filter((r) => r.verdict);
  return {
    mode,
    rooms: rs.length,
    ok: rs.filter((r) => r.ok).length,
    failed: rs.filter((r) => !r.ok).length,
    trailMarks: sum(rs.map((r) => r.trail?.marks ?? 0)),
    trailDiffer: sum(rs.map((r) => r.trail?.differ ?? 0)),
    resyncs: sum(rs.map((r) => r.resyncs ?? 0)),
    verified: done.filter((r) => r.verdict.verified).length,
    surrenders: rs.filter((r) => r.verdict?.reason === 'surrender' || r.verdict?.reason === 'forfeit').length,
    stalls: sum(rs.map((r) => r.stalls ?? 0)),
    longestStallMs: Math.max(0, ...rs.map((r) => r.longestStallMs ?? 0)),
    holds: sum(rs.map((r) => r.holds ?? 0)),
    drops: sum(rs.map((r) => r.drops?.length ?? 0)),
    reconnects: sum(rs.map((r) => r.reconnects ?? 0)),
    reloads: sum(rs.map((r) => r.reloads ?? 0)),
    rejoinP50: pct(rs.flatMap((r) => r.rejoinMs ?? []), 0.5),
    rejoinP95: pct(rs.flatMap((r) => r.rejoinMs ?? []), 0.95),
    // per-room p50/p95 medians (the rooms' own percentiles, then the median and worst over rooms)
    inputP50: pct(rs.filter((r) => r.inputN).map((r) => r.inputP50), 0.5),
    inputP95: pct(rs.filter((r) => r.inputN).map((r) => r.inputP95), 0.5),
    inputP95Worst: Math.max(0, ...rs.map((r) => r.inputP95 ?? 0)),
    turnGapP50: pct(rs.filter((r) => r.turnGapP50).map((r) => r.turnGapP50), 0.5),
    turnGapP95: pct(rs.filter((r) => r.turnGapP95).map((r) => r.turnGapP95), 0.5),
    turnGapP95Worst: Math.max(0, ...rs.map((r) => r.turnGapP95 ?? 0)),
    saves: rs.reduce((o, r) => {
      for (const [k, v] of Object.entries(r.saves ?? {})) o[k] = (o[k] ?? 0) + v;
      return o;
    }, {}),
    matchSecP50: Math.round(pct(rs.filter((r) => r.ticks).map((r) => r.ticks), 0.5) / 30),
    clientCpuSecPerRoom: Math.round(pct(rs.map((r) => r.clientCpuMs ?? 0), 0.5) / 1000),
    clientRssMb: pct(rs.map((r) => r.clientRssMb ?? 0), 0.5),
    logKbP50: Math.round(pct(rs.map((r) => r.logBytes ?? 0), 0.5) / 1024),
  };
};
// relay CPU per live room-minute from the 10 s samples, after a 2-minute warm-up (the referee workers compile the
// TypeScript sim bundle under ts-node when the first rooms arrive)
const busy = samples.filter((s) => s.rooms > 0 && s.at - t0 > 120_000);
const relay = {
  cpuMsPerRoomMinute: Math.round((sum(busy.map((s) => s.cpuPct * 100)) / Math.max(1, sum(busy.map((s) => (s.rooms * 10) / 60)))) || 0),
  cpuPctAvg: Math.round(sum(busy.map((s) => s.cpuPct)) / Math.max(1, busy.length)),
  cpuPctMax: Math.round(Math.max(0, ...samples.map((s) => s.cpuPct))),
  roomsAvg: Math.round((sum(busy.map((s) => s.rooms)) / Math.max(1, busy.length)) * 10) / 10,
  roomsMax: Math.max(0, ...samples.map((s) => s.rooms)),
  rssMbStart: Math.round(h0.rss / 1e6),
  rssMbMax: Math.round(Math.max(h0.rss / 1e6, ...samples.map((s) => s.rssMb))),
  rssMbEnd: Math.round(h1.rss / 1e6),
  rssMbGrowth: Math.round((h1.rss - h0.rss) / 1e6),
  heapMbGrowth: Math.round((h1.heapUsed - h0.heapUsed) / 1e6),
  heapMbEnd: Math.round(h1.heapUsed / 1e6),
  loopP99Max: Math.max(0, ...samples.map((s) => s.loopP99)),
  overrunP99Max: Math.max(0, ...samples.map((s) => s.overrunP99)),
  refereeLagMax: Math.max(0, ...samples.map((s) => s.refLag)),
  desyncs: h1.desyncs - h0.desyncs,
  divergences: h1.divergences - h0.divergences,
  restores: h1.restores - h0.restores,
  refusedBusy: h1.refused_busy - h0.refused_busy,
  roomsStored: h1.roomsStored,
};
const report = { seed: SEED, startedAt: new Date(t0).toISOString(), minutes: Math.round((Date.now() - t0) / 60_000), sim: stamp.simVersion, concurrency: CONCURRENCY, rows: [row('pvp'), row('coop'), row('all')], relay, events: ev.events, problems: ev.problems.slice(-50), failures: results.filter((r) => !r.ok).map((r) => ({ index: r.index, mode: r.mode, seed: r.seed, room: r.room, problems: r.problems, drops: r.drops, errors: r.errors })), results, samples };
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `soak-${new Date(t0).toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(report, null, 1));

const cols = ['mode', 'rooms', 'ok', 'failed', 'trailMarks', 'trailDiffer', 'resyncs', 'verified', 'stalls', 'holds', 'drops', 'reconnects', 'reloads', 'rejoinP50', 'rejoinP95', 'inputP50', 'inputP95', 'turnGapP50', 'turnGapP95', 'turnGapP95Worst', 'matchSecP50', 'clientCpuSecPerRoom'];
console.log(`\n| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|`);
for (const r of report.rows) console.log(`| ${cols.map((c) => r[c]).join(' | ')} |`);
console.log(`\n/live saves: ${JSON.stringify(report.rows[2].saves)}`);
console.log(`relay: ${JSON.stringify(relay)}`);
for (const f of report.failures) console.log(`FAIL room ${f.index} ${f.mode} seed ${f.seed} ${f.room ?? ''}: ${f.problems.join('; ')}`);
console.log(`\nreport: ${file}`);
stopping = true;
relayProc?.kill('SIGTERM');
process.exit(report.failures.length ? 1 : 0);
