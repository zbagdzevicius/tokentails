#!/usr/bin/env node
/*
 * Party relay latency check (infra/gcp/RUNBOOK.md, smoke tests and cutover). No dependencies: a small RFC 6455
 * client over node:net / node:tls, so it can send the Origin header the relay requires, pin the TCP connection to
 * one IP while keeping the real Host and SNI (forged-header test against the load balancer), and time WebSocket
 * ping/pong frames.
 *
 * Opens N sockets to `<url>/pawlegends/ws` with subprotocol `pl.1`, then per socket:
 *   1. hello -> welcome: one JSON round trip through the relay's message path (party protocol, PROTO 1)
 *   2. PINGS WebSocket pings, PING_GAP_MS apart: the `ws` server answers each with a pong (transport RTT)
 * and prints p50 / p95 / p99 / max for both, plus the handshake time and any refusals (HTTP status, error codes).
 *
 *   node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com
 *   N=20 PINGS=30 node infra/gcp/tools/ws-latency.mjs wss://api.tokentails.com
 *   node infra/gcp/tools/ws-latency.mjs http://127.0.0.1:18080 --origin http://localhost:3000
 *   # forged client IP straight at the LB address: Cloud Armor must answer 403 (only Cloudflare may connect)
 *   node infra/gcp/tools/ws-latency.mjs https://gcp-api.tokentails.com --connect 34.0.0.1 \
 *     --header cf-connecting-ip:203.0.113.7 --expect-status 403
 *
 * Options (flags win over env):
 *   --n / N                  sockets (default 10; the relay allows 50 per IP and 50 upgrades a second)
 *   --pings / PINGS          pings per socket after welcome (default 20)
 *   --gap / PING_GAP_MS      gap between pings on one socket (default 250)
 *   --origin / ORIGIN        Origin header (default https://tokentails.com; must be on the relay's list)
 *   --connect / CONNECT_IP   connect to this IP instead of resolving the host (Host and SNI stay the URL host)
 *   --header k:v             extra request header (repeatable)
 *   --sim / SIM, --sim-hash / SIM_HASH   party sim stamp (default pawlegends/src/net/sim-stamp.json)
 *   --expect-status CODE     exit 0 only if every handshake got this HTTP status (e.g. 403)
 *   --max-p95 MS             exit 1 if the ping p95 is above MS
 *   --json                   print the summary as JSON
 *   --insecure               do not verify TLS (local only)
 * Exit: 0 ok, 1 threshold or expectation failed, 2 no socket completed.
 */
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const WS_PATH = '/pawlegends/ws';
const SUBPROTOCOL = 'pl.1';
const PROTO = 1;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---------------------------------------------------------------------------------------------------------------
// arguments

export function parseArgs(argv, env = process.env) {
    const o = {
        url: null,
        n: Number(env.N ?? 10),
        pings: Number(env.PINGS ?? 20),
        gap: Number(env.PING_GAP_MS ?? 250),
        origin: env.ORIGIN ?? 'https://tokentails.com',
        connect: env.CONNECT_IP ?? null,
        headers: {},
        sim: env.SIM ? Number(env.SIM) : null,
        simHash: env.SIM_HASH ?? null,
        expectStatus: null,
        maxP95: null,
        json: false,
        insecure: false,
        timeoutMs: Number(env.TIMEOUT_MS ?? 15000),
    };
    const rest = [...argv];
    const take = flag => {
        if (!rest.length) throw new Error(`${flag} needs a value`);
        return rest.shift();
    };
    while (rest.length) {
        const a = rest.shift();
        if (a === '--n') o.n = Number(take(a));
        else if (a === '--pings') o.pings = Number(take(a));
        else if (a === '--gap') o.gap = Number(take(a));
        else if (a === '--origin') o.origin = take(a);
        else if (a === '--connect') o.connect = take(a);
        else if (a === '--header') {
            const h = take(a);
            const i = h.indexOf(':');
            if (i < 1) throw new Error(`--header wants name:value, got "${h}"`);
            o.headers[h.slice(0, i).trim().toLowerCase()] = h.slice(i + 1).trim();
        } else if (a === '--sim') o.sim = Number(take(a));
        else if (a === '--sim-hash') o.simHash = take(a);
        else if (a === '--expect-status') o.expectStatus = Number(take(a));
        else if (a === '--max-p95') o.maxP95 = Number(take(a));
        else if (a === '--timeout') o.timeoutMs = Number(take(a));
        else if (a === '--json') o.json = true;
        else if (a === '--insecure') o.insecure = true;
        else if (a === '-h' || a === '--help') o.help = true;
        else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
        else o.url = a;
    }
    if (!o.help && !o.url) throw new Error('give the relay base URL, e.g. https://gcp-api.tokentails.com');
    if (!(o.n >= 1 && o.n <= 200)) throw new Error('--n must be 1..200');
    if (!(o.pings >= 0 && o.pings <= 10000)) throw new Error('--pings must be 0..10000');
    return o;
}

/** https://host[:port][/anything] or wss://... -> connection target and the request path. */
export function target(url) {
    const u = new URL(url);
    const secure = u.protocol === 'https:' || u.protocol === 'wss:';
    if (!secure && u.protocol !== 'http:' && u.protocol !== 'ws:') throw new Error(`unsupported scheme ${u.protocol}`);
    const port = u.port ? Number(u.port) : secure ? 443 : 80;
    const base = u.pathname.replace(/\/+$/, '');
    const path = base.endsWith(WS_PATH) ? base : `${base}${WS_PATH}`;
    const hostHeader = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return { secure, host: u.hostname, port, path, hostHeader };
}

function loadStamp() {
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        return JSON.parse(readFileSync(join(here, '../../../pawlegends/src/net/sim-stamp.json'), 'utf8'));
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// RFC 6455 frames (client side: always masked)

export function encodeFrame(opcode, payload = Buffer.alloc(0)) {
    const len = payload.length;
    const head = len < 126 ? 2 : len < 65536 ? 4 : 10;
    const out = Buffer.alloc(head + 4 + len);
    out[0] = 0x80 | opcode;
    if (len < 126) out[1] = 0x80 | len;
    else if (len < 65536) {
        out[1] = 0x80 | 126;
        out.writeUInt16BE(len, 2);
    } else {
        out[1] = 0x80 | 127;
        out.writeBigUInt64BE(BigInt(len), 2);
    }
    const mask = randomBytes(4);
    mask.copy(out, head);
    for (let i = 0; i < len; i++) out[head + 4 + i] = payload[i] ^ mask[i & 3];
    return out;
}

/** Splits complete server frames off `buf`. Returns { frames, rest }. Server frames are not masked. */
export function decodeFrames(buf) {
    const frames = [];
    let off = 0;
    while (buf.length - off >= 2) {
        const b0 = buf[off];
        const b1 = buf[off + 1];
        let len = b1 & 0x7f;
        let p = off + 2;
        if (len === 126) {
            if (buf.length - p < 2) break;
            len = buf.readUInt16BE(p);
            p += 2;
        } else if (len === 127) {
            if (buf.length - p < 8) break;
            len = Number(buf.readBigUInt64BE(p));
            p += 8;
        }
        let mask = null;
        if (b1 & 0x80) {
            if (buf.length - p < 4) break;
            mask = buf.subarray(p, p + 4);
            p += 4;
        }
        if (buf.length - p < len) break;
        let payload = Buffer.from(buf.subarray(p, p + len));
        if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
        frames.push({ fin: !!(b0 & 0x80), opcode: b0 & 0x0f, payload });
        off = p + len;
    }
    return { frames, rest: buf.subarray(off) };
}

export function acceptFor(key) {
    return createHash('sha1').update(key + GUID).digest('base64');
}

// ---------------------------------------------------------------------------------------------------------------
// one socket

const now = () => Number(process.hrtime.bigint()) / 1e6;
const wait = ms => new Promise(r => setTimeout(r, ms));

function openSocket(t, o, index, stamp) {
    return new Promise(resolve => {
        const res = { index, status: null, handshakeMs: null, helloMs: null, pings: [], error: null, codes: [] };
        const key = randomBytes(16).toString('base64');
        const started = now();
        const connectHost = o.connect ?? t.host;
        const sock = t.secure
            ? tls.connect({
                  host: connectHost,
                  port: t.port,
                  servername: net.isIP(t.host) ? undefined : t.host,
                  rejectUnauthorized: !o.insecure,
                  ALPNProtocols: ['http/1.1'],
              })
            : net.connect({ host: connectHost, port: t.port });
        sock.setNoDelay(true);
        let buf = Buffer.alloc(0);
        let upgraded = false;
        let finished = false;
        let helloSent = 0;
        const pending = new Map();
        let pingSeq = 0;

        const finish = err => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (err && !res.error) res.error = err;
            try {
                if (upgraded) sock.write(encodeFrame(0x8, Buffer.from([0x03, 0xe8])));
            } catch {
                /* closing anyway */
            }
            sock.destroy();
            resolve(res);
        };
        const timer = setTimeout(() => finish('timeout'), o.timeoutMs + o.pings * (o.gap + 50));

        const runPings = async () => {
            for (let i = 0; i < o.pings && !finished; i++) {
                const seq = Buffer.alloc(8);
                seq.writeUInt32BE(index, 0);
                seq.writeUInt32BE(++pingSeq, 4);
                pending.set(seq.toString('hex'), now());
                sock.write(encodeFrame(0x9, seq));
                await wait(o.gap);
            }
            const deadline = now() + 3000;
            while (pending.size && now() < deadline && !finished) await wait(20);
            finish(pending.size ? `${pending.size} pong(s) missing` : null);
        };

        const onFrame = f => {
            if (f.opcode === 0xa) {
                const k = f.payload.toString('hex');
                const t0 = pending.get(k);
                if (t0 !== undefined) {
                    res.pings.push(now() - t0);
                    pending.delete(k);
                }
            } else if (f.opcode === 0x9) {
                sock.write(encodeFrame(0xa, f.payload));
            } else if (f.opcode === 0x1) {
                let msg;
                try {
                    msg = JSON.parse(f.payload.toString('utf8'));
                } catch {
                    return;
                }
                if (msg.t === 'welcome' && res.helloMs === null) {
                    res.helloMs = now() - helloSent;
                    runPings();
                } else if (msg.t === 'error') {
                    res.codes.push(msg.code);
                    if (msg.code === 'update_required') finish('update_required (pass --sim/--sim-hash)');
                }
            } else if (f.opcode === 0x8) {
                const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
                finish(`closed by relay (${code}${f.payload.length > 2 ? ` ${f.payload.subarray(2)}` : ''})`);
            }
        };

        sock.on(t.secure ? 'secureConnect' : 'connect', () => {
            const headers = {
                host: t.hostHeader,
                upgrade: 'websocket',
                connection: 'Upgrade',
                'sec-websocket-key': key,
                'sec-websocket-version': '13',
                'sec-websocket-protocol': SUBPROTOCOL,
                origin: o.origin,
                'user-agent': 'tokentails-ws-latency/1',
                ...o.headers,
            };
            const lines = [`GET ${t.path} HTTP/1.1`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
            sock.write(`${lines.join('\r\n')}\r\n\r\n`);
        });
        sock.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
            if (!upgraded) {
                const end = buf.indexOf('\r\n\r\n');
                if (end < 0) return;
                const head = buf.subarray(0, end).toString('latin1');
                buf = buf.subarray(end + 4);
                const m = /^HTTP\/1\.[01] (\d{3})/.exec(head);
                res.status = m ? Number(m[1]) : null;
                res.handshakeMs = now() - started;
                if (res.status !== 101) return finish(`handshake HTTP ${res.status ?? '?'}`);
                const accept = /\r\nsec-websocket-accept:\s*(\S+)/i.exec(head)?.[1];
                if (accept !== acceptFor(key)) return finish('bad Sec-WebSocket-Accept');
                upgraded = true;
                const hello = {
                    t: 'hello',
                    proto: PROTO,
                    sim: o.sim ?? stamp?.simVersion,
                    simHash: o.simHash ?? stamp?.simHash,
                    build: 'wslat.1',
                    guestKey: `wslat${randomBytes(6).toString('hex')}`,
                };
                helloSent = now();
                sock.write(encodeFrame(0x1, Buffer.from(JSON.stringify(hello))));
            }
            const { frames, rest } = decodeFrames(buf);
            buf = Buffer.from(rest);
            for (const f of frames) onFrame(f);
        });
        sock.on('error', e => finish(e.code || e.message));
        sock.on('close', () => finish(upgraded ? null : 'connection closed before upgrade'));
    });
}

// ---------------------------------------------------------------------------------------------------------------
// stats

export function percentile(sorted, p) {
    if (!sorted.length) return null;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[i];
}

export function summarize(values) {
    const s = [...values].sort((a, b) => a - b);
    const r = v => (v === null ? null : Math.round(v * 10) / 10);
    return {
        n: s.length,
        p50: r(percentile(s, 50)),
        p95: r(percentile(s, 95)),
        p99: r(percentile(s, 99)),
        max: r(s.length ? s[s.length - 1] : null),
    };
}

// ---------------------------------------------------------------------------------------------------------------
// main

async function main() {
    const o = parseArgs(process.argv.slice(2));
    if (o.help) {
        process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
        return 0;
    }
    const t = target(o.url);
    const stamp = loadStamp();
    if ((o.sim ?? stamp?.simVersion) == null || !(o.simHash ?? stamp?.simHash)) {
        throw new Error('no sim stamp: pass --sim and --sim-hash (pawlegends/src/net/sim-stamp.json not found)');
    }
    const results = [];
    const runs = [];
    for (let i = 0; i < o.n; i++) {
        runs.push(openSocket(t, o, i, stamp).then(r => results.push(r)));
        await wait(40); // stay well under the relay's 50 upgrades a second
    }
    await Promise.all(runs);

    const statuses = {};
    for (const r of results) statuses[r.status ?? 'none'] = (statuses[r.status ?? 'none'] ?? 0) + 1;
    const errors = {};
    for (const r of results) if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
    const codes = {};
    for (const r of results) for (const c of r.codes) codes[c] = (codes[c] ?? 0) + 1;
    const summary = {
        url: `${t.secure ? 'wss' : 'ws'}://${t.hostHeader}${t.path}`,
        connect: o.connect ?? t.host,
        sockets: o.n,
        statuses,
        handshake_ms: summarize(results.filter(r => r.handshakeMs !== null).map(r => r.handshakeMs)),
        hello_rtt_ms: summarize(results.filter(r => r.helloMs !== null).map(r => r.helloMs)),
        ping_rtt_ms: summarize(results.flatMap(r => r.pings)),
        welcomed: results.filter(r => r.helloMs !== null).length,
        errors,
        relay_error_codes: codes,
    };

    let exit = 0;
    if (o.expectStatus !== null) {
        exit = results.every(r => r.status === o.expectStatus) ? 0 : 1;
    } else {
        if (!summary.welcomed) exit = 2;
        else if (o.maxP95 !== null && (summary.ping_rtt_ms.p95 ?? Infinity) > o.maxP95) exit = 1;
    }
    summary.verdict = exit === 0 ? 'ok' : exit === 2 ? 'no socket completed' : 'failed';

    if (o.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    else {
        const row = (name, s) =>
            `${name.padEnd(12)} n=${String(s.n).padEnd(5)} p50=${s.p50 ?? '-'}  p95=${s.p95 ?? '-'}  p99=${
                s.p99 ?? '-'
            }  max=${s.max ?? '-'}`;
        console.log(`relay ${summary.url} (connect ${summary.connect}), ${o.n} socket(s)`);
        console.log(`HTTP statuses: ${JSON.stringify(statuses)}  welcomed: ${summary.welcomed}/${o.n}`);
        console.log(row('handshake', summary.handshake_ms));
        console.log(row('hello->welc', summary.hello_rtt_ms));
        console.log(row('ping->pong', summary.ping_rtt_ms));
        if (Object.keys(errors).length) console.log(`errors: ${JSON.stringify(errors)}`);
        if (Object.keys(codes).length) console.log(`relay error codes: ${JSON.stringify(codes)}`);
        console.log(`verdict: ${summary.verdict}`);
    }
    return exit;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    main().then(
        code => process.exit(code),
        e => {
            console.error(`ws-latency: ${e.message}`);
            process.exit(2);
        }
    );
}
