#!/usr/bin/env node
/**
 * Party relay load check (docs/plans/moba/MULTIPLAYER.md §3.3, §12.4 `mp/load.mjs`, nightly / @perf): ROOMS rooms of 3
 * headless Node clients (Node's built-in WebSocket) against a running relay harness. Each client creates or joins a
 * party, locks a hero, reports `loaded`, then BEATs every 500 ms and counts TURN frames. After SECONDS the script
 * reads the relay's counters (`GET /health`): turn overrun p99, event-loop delay p99, referee lag, rooms, sockets.
 *
 *   RELAY=http://127.0.0.1:3105 ROOMS=16 SECONDS=60 node tests/e2e/mp/load.mjs
 *
 * One machine is one IP: the relay's per-IP cap (50 sockets) bounds a single-host run at 16 rooms. Measure the
 * production droplet from several hosts before raising MAX_LIVE_ROOMS (party-limits.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELAY = process.env.RELAY ?? 'http://127.0.0.1:3105';
const ROOMS = Number(process.env.ROOMS ?? 16);
const SECONDS = Number(process.env.SECONDS ?? 60);
const here = dirname(fileURLToPath(import.meta.url));
const stamp = JSON.parse(readFileSync(join(here, '../../../src/net/sim-stamp.json'), 'utf8'));
const WS = `${RELAY.replace(/^http/, 'ws')}/pawlegends/ws`;

const beat = (lastTurn) => {
  const out = [0x02];
  let x = lastTurn;
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x = Math.floor(x / 0x80);
  }
  out.push(x);
  const ms = Date.now() >>> 0;
  out.push(ms & 0xff, (ms >>> 8) & 0xff, (ms >>> 16) & 0xff, (ms >>> 24) & 0xff);
  return new Uint8Array(out);
};

function client(id) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS, 'pl.1');
    ws.binaryType = 'arraybuffer';
    const c = { ws, json: [], turns: 0, lastTurn: 0, waiters: [] };
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', proto: 1, sim: stamp.simVersion, simHash: stamp.simHash, build: 'load.1', guestKey: `loadclient${id}x` }));
      resolve(c);
    };
    ws.onerror = (e) => reject(e);
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') c.json.push(JSON.parse(e.data));
      else {
        const b = new Uint8Array(e.data);
        if (b[0] === 0x81) {
          c.turns++;
          let v = 0;
          let mul = 1;
          for (let i = 1; i < 5; i++) {
            v += (b[i] & 0x7f) * mul;
            if ((b[i] & 0x80) === 0) break;
            mul *= 0x80;
          }
          c.lastTurn = v;
        }
      }
      c.waiters.splice(0).forEach((w) => w());
    };
  });
}

const until = async (c, pred, ms = 20000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = pred();
    if (v) return v;
    if (Date.now() > end) throw new Error('load: timeout');
    await new Promise((r) => {
      const t = setTimeout(r, 50);
      c.waiters.push(() => {
        clearTimeout(t);
        r();
      });
    });
  }
};
const last = (c, t) => [...c.json].reverse().find((j) => j.t === t);

async function room(i) {
  const [a, b, d] = await Promise.all([client(i * 3), client(i * 3 + 1), client(i * 3 + 2)]);
  await Promise.all([a, b, d].map((c) => until(c, () => last(c, 'welcome'))));
  a.ws.send(JSON.stringify({ t: 'party.create', difficulty: 'normal' }));
  const p = await until(a, () => last(a, 'party'));
  for (const c of [b, d]) c.ws.send(JSON.stringify({ t: 'party.join', code: p.code }));
  await until(a, () => last(a, 'party')?.members.length === 3);
  a.ws.send(JSON.stringify({ t: 'party.start' }));
  await until(a, () => last(a, 'party')?.phase === 'pick');
  const heroes = ['clem', 'sage', 'gabe'];
  [a, b, d].forEach((c, k) => c.ws.send(JSON.stringify({ t: 'pick.lock', hero: heroes[k], trick: 'pounce' })));
  await until(a, () => last(a, 'party')?.phase === 'loading');
  for (const c of [a, b, d]) c.ws.send(JSON.stringify({ t: 'loaded' }));
  await Promise.all([a, b, d].map((c) => until(c, () => last(c, 'match'))));
  return [a, b, d];
}

const t0 = Date.now();
const rooms = [];
for (let i = 0; i < ROOMS; i++) {
  rooms.push(await room(i));
  await new Promise((r) => setTimeout(r, 100)); // stay under the relay's 50 upgrades a second
}
const clients = rooms.flat();
console.log(`load: ${ROOMS} rooms, ${clients.length} clients up in ${Date.now() - t0} ms`);
const beats = setInterval(() => {
  for (const c of clients) if (c.ws.readyState === 1) c.ws.send(beat(c.lastTurn));
}, 500);
await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(beats);
const health = await (await fetch(`${RELAY}/health`)).json();
const turns = clients.map((c) => c.turns);
const expected = (SECONDS * 1000) / (200 / 3);
console.log(`load: turns per client min ${Math.min(...turns)} max ${Math.max(...turns)} (about ${Math.round(expected)} expected)`);
console.log(`load: relay ${JSON.stringify(health)}`);
const mem = process.memoryUsage();
console.log(`load: driver rss ${(mem.rss / 1e6).toFixed(0)} MB`);
for (const c of clients) c.ws.close();
const ok = health.turn_overrun_ms_p99 < 5 && health.referee_lag_turns < 5;
console.log(ok ? 'load: OK (overrun p99 < 5 ms, referee lag < 5 turns)' : 'load: OVER BUDGET');
process.exit(ok ? 0 : 1);
