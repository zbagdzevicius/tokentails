#!/usr/bin/env node
/*
 * Party create/join probe (infra/gcp/RUNBOOK.md, shadow checks and cutover). Two guest sockets: A says hello, creates a
 * party (`party.create`, easy), B says hello and joins A's code (`party.join`); both must see a party of 2 with the same
 * code. Then both leave and close. No account, no match, nothing scored. Prints only codes and timings.
 *
 *   node infra/gcp/tools/party-probe.mjs https://gcp-api.tokentails.com
 *   node infra/gcp/tools/party-probe.mjs http://127.0.0.1:18080          # an IAP tunnel to the relay VM's port 8080
 *   node infra/gcp/tools/party-probe.mjs https://gcp-api.tokentails.com --connect <lb ip> --insecure
 * Options: --origin (default https://tokentails.com), --connect IP, --insecure, --timeout MS (default 15000).
 * Exit: 0 both in one party, 1 otherwise.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { acceptFor, decodeFrames, encodeFrame, target } from './ws-latency.mjs';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--') && !/^\d/.test(a));
const opt = (k, d) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
};
if (!url) {
    console.error('usage: party-probe.mjs <https://host | http://127.0.0.1:port> [--connect IP] [--origin URL] [--insecure]');
    process.exit(2);
}
const ORIGIN = opt('origin', 'https://tokentails.com');
const CONNECT = opt('connect', undefined);
const INSECURE = args.includes('--insecure');
const TIMEOUT = Number(opt('timeout', 15000));
let stamp = {};
try {
    stamp = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../pawlegends/src/net/sim-stamp.json'), 'utf8'));
} catch {
    /* the relay answers update_required without it */
}
const t = target(url);
const now = () => Number(process.hrtime.bigint()) / 1e6;

/** One guest socket: resolves after `welcome`, then `send(obj)` and `next(pred)` wait for frames. */
function guest(name) {
    return new Promise((resolve, reject) => {
        const key = randomBytes(16).toString('base64');
        const sock = t.secure
            ? tls.connect({ host: CONNECT ?? t.host, port: t.port, servername: net.isIP(t.host) ? undefined : t.host, rejectUnauthorized: !INSECURE, ALPNProtocols: ['http/1.1'] })
            : net.connect({ host: CONNECT ?? t.host, port: t.port });
        let buf = Buffer.alloc(0);
        let upgraded = false;
        const msgs = [];
        const waiters = [];
        const api = {
            send: o => sock.write(encodeFrame(0x1, Buffer.from(JSON.stringify(o)))),
            next: (pred, label) =>
                new Promise((res, rej) => {
                    const hit = msgs.find(pred);
                    if (hit) return res(hit);
                    const tm = setTimeout(() => rej(new Error(`${name}: timeout waiting for ${label}`)), TIMEOUT);
                    waiters.push({ pred, res: m => (clearTimeout(tm), res(m)) });
                }),
            close: () => {
                try {
                    sock.write(encodeFrame(0x8, Buffer.from([0x03, 0xe8])));
                } catch {
                    /* closing anyway */
                }
                sock.destroy();
            },
        };
        const timer = setTimeout(() => reject(new Error(`${name}: no welcome within ${TIMEOUT} ms`)), TIMEOUT);
        sock.on(t.secure ? 'secureConnect' : 'connect', () => {
            const h = { host: t.hostHeader, upgrade: 'websocket', connection: 'Upgrade', 'sec-websocket-key': key, 'sec-websocket-version': '13', 'sec-websocket-protocol': 'pl.1', origin: ORIGIN, 'user-agent': 'tokentails-party-probe/1' };
            sock.write(`GET ${t.path} HTTP/1.1\r\n${Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
        });
        sock.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
            if (!upgraded) {
                const end = buf.indexOf('\r\n\r\n');
                if (end < 0) return;
                const head = buf.subarray(0, end).toString('latin1');
                buf = buf.subarray(end + 4);
                const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1]);
                if (status !== 101) return reject(new Error(`${name}: handshake HTTP ${status || '?'}`));
                if (/\r\nsec-websocket-accept:\s*(\S+)/i.exec(head)?.[1] !== acceptFor(key)) return reject(new Error(`${name}: bad accept`));
                upgraded = true;
                api.send({ t: 'hello', proto: 1, sim: stamp.simVersion, simHash: stamp.simHash, build: 'probe.1', guestKey: `probe${randomBytes(6).toString('hex')}` });
            }
            const { frames, rest } = decodeFrames(buf);
            buf = Buffer.from(rest);
            for (const f of frames) {
                if (f.opcode === 0x9) sock.write(encodeFrame(0xa, f.payload));
                if (f.opcode === 0x8) reject(new Error(`${name}: closed by relay`));
                if (f.opcode !== 0x1) continue;
                let m;
                try {
                    m = JSON.parse(f.payload.toString('utf8'));
                } catch {
                    continue;
                }
                if (m.t === 'welcome') {
                    clearTimeout(timer);
                    resolve(api);
                }
                if (m.t === 'error') console.log(`  ${name}: relay error ${m.code}`);
                msgs.push(m);
                for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].pred(m)) waiters.splice(i, 1)[0].res(m);
            }
        });
        sock.on('error', e => reject(new Error(`${name}: ${e.code || e.message}`)));
    });
}

const t0 = now();
let a, b;
try {
    a = await guest('A');
    a.send({ t: 'party.create', difficulty: 'easy' });
    const pa = await a.next(m => m.t === 'party' && m.code, 'party (create)');
    const created = now();
    b = await guest('B');
    b.send({ t: 'party.join', code: pa.code });
    const pb = await b.next(m => m.t === 'party' && m.code === pa.code && (m.members?.length ?? 0) >= 2, 'party of 2 (join)');
    const joined = now();
    const ok = pb.code === pa.code && pb.members.length === 2;
    console.log(`party create ${Math.round(created - t0)} ms, join ${Math.round(joined - created)} ms, members ${pb.members.length}: ${ok ? 'ok' : 'FAIL'}`);
    a.send({ t: 'party.leave' });
    b.send({ t: 'party.leave' });
    setTimeout(() => {
        a.close();
        b.close();
        process.exit(ok ? 0 : 1);
    }, 300);
} catch (e) {
    console.error(`party probe FAIL: ${e.message}`);
    a?.close();
    b?.close();
    process.exit(1);
}
