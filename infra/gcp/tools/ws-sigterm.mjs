#!/usr/bin/env node
/*
 * Relay SIGTERM check (infra/gcp/scripts/preflight.sh --docker). Opens N sockets to `<url>/pawlegends/ws`, says
 * hello, half of them create a party, writes READY_FILE, then waits until READY_FILE.sent exists (the caller sends
 * SIGTERM to the relay and touches it) and records how each socket was closed. A graceful relay closes every socket
 * with 1012 within a second (party-relay.ts shutdown()); "still open" means the handoff never ran.
 *
 *   node infra/gcp/tools/ws-sigterm.mjs http://127.0.0.1:18180 20 /tmp/ready
 * Prints one JSON line. Exit 0 when every socket closed with 1012, 1 otherwise. Uses `ws` from backend/node_modules.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(fileURLToPath(new URL('../../../backend/package.json', import.meta.url)));
const WebSocket = require('ws');
const [url, n = '10', readyFile] = process.argv.slice(2);
const N = Number(n);
const stamp = JSON.parse(readFileSync(new URL('../../../pawlegends/src/net/sim-stamp.json', import.meta.url), 'utf8'));
const results = [];
let sigtermAt = null;
const open = i =>
    new Promise(resolve => {
        const r = { i, welcome: false, party: false, msgs: [], close: null, closeMs: null };
        results.push(r);
        const ws = new WebSocket(url + '/pawlegends/ws', 'pl.1', { headers: { origin: 'http://localhost:3000' } });
        ws.on('open', () =>
            ws.send(
                JSON.stringify({
                    t: 'hello',
                    proto: 1,
                    sim: stamp.simVersion,
                    simHash: stamp.simHash,
                    build: 'sigterm.1',
                    guestKey: 'sig' + randomBytes(6).toString('hex'),
                })
            )
        );
        ws.on('message', d => {
            let m;
            try {
                m = JSON.parse(String(d));
            } catch {
                return;
            }
            if (m.t === 'welcome') {
                r.welcome = true;
                if (i % 2 === 0) ws.send(JSON.stringify({ t: 'party.create', difficulty: 'normal' }));
                else resolve();
            } else if (m.t === 'party') {
                r.party = !!m.code;
                resolve();
            } else r.msgs.push(m.t === 'error' ? `error:${m.code}` : m.t);
        });
        ws.on('close', (code, reason) => {
            r.close = `${code} ${reason}`;
            r.closeMs = sigtermAt ? Date.now() - sigtermAt : null;
            resolve();
        });
        ws.on('error', e => {
            r.msgs.push('err:' + e.message);
            resolve();
        });
        setTimeout(resolve, 5000);
    });
await Promise.all(Array.from({ length: N }, (_, i) => open(i)));
writeFileSync(readyFile, 'ready');
// caller sends SIGTERM after it sees readyFile and writes readyFile + '.sent'
while (!existsSync(readyFile + '.sent')) await new Promise(r => setTimeout(r, 10));
sigtermAt = Date.now();
const deadline = Date.now() + 70_000;
while (results.some(r => r.close === null) && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
const closes = {};
for (const r of results) closes[r.close ?? 'still open'] = (closes[r.close ?? 'still open'] || 0) + 1;
const msgs = {};
for (const r of results) for (const m of r.msgs) msgs[m] = (msgs[m] || 0) + 1;
const ms = results
    .map(r => r.closeMs)
    .filter(x => x !== null)
    .sort((a, b) => a - b);
const welcomed = results.filter(r => r.welcome).length;
console.log(
    JSON.stringify({
        sockets: N,
        welcomed,
        inParty: results.filter(r => r.party).length,
        closes,
        msgsBeforeClose: msgs,
        closeMsMin: ms[0],
        closeMsMax: ms.at(-1),
    })
);
process.exit(welcomed === N && closes['1012 restart'] === N ? 0 : 1);
