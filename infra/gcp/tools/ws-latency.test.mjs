// node --test infra/gcp/tools/ (run by infra/gcp/scripts/preflight.sh)
import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptFor, decodeFrames, encodeFrame, parseArgs, percentile, summarize, target } from './ws-latency.mjs';

test('target adds the relay path and keeps the host for SNI', () => {
    assert.deepEqual(target('https://gcp-api.tokentails.com'), {
        secure: true,
        host: 'gcp-api.tokentails.com',
        port: 443,
        path: '/pawlegends/ws',
        hostHeader: 'gcp-api.tokentails.com',
    });
    assert.equal(target('ws://127.0.0.1:18080/pawlegends/ws').path, '/pawlegends/ws');
    assert.equal(target('http://127.0.0.1:18080').port, 18080);
    assert.throws(() => target('ftp://x'), /unsupported/);
});

test('client frames are masked and round-trip through the decoder', () => {
    for (const len of [0, 5, 125, 126, 300, 70000]) {
        const payload = Buffer.alloc(len, 7);
        const f = encodeFrame(0x9, payload);
        assert.equal(f[0], 0x89);
        assert.ok(f[1] & 0x80, 'masked');
        const { frames, rest } = decodeFrames(Buffer.concat([f, Buffer.from([0x81])]));
        assert.equal(frames.length, 1);
        assert.equal(frames[0].opcode, 0x9);
        assert.deepEqual(frames[0].payload, payload);
        assert.equal(rest.length, 1, 'a partial frame stays buffered');
    }
});

test('Sec-WebSocket-Accept matches RFC 6455 section 1.3', () => {
    assert.equal(acceptFor('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('percentiles and summary', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.equal(percentile(v, 50), 50);
    assert.equal(percentile(v, 95), 95);
    assert.equal(percentile([], 50), null);
    assert.deepEqual(summarize([3, 1, 2]), { n: 3, p50: 2, p95: 3, p99: 3, max: 3 });
});

test('arguments', () => {
    const o = parseArgs(['https://x.example', '--n', '3', '--header', 'cf-connecting-ip: 1.2.3.4', '--expect-status', '403'], {});
    assert.equal(o.n, 3);
    assert.equal(o.headers['cf-connecting-ip'], '1.2.3.4');
    assert.equal(o.expectStatus, 403);
    assert.throws(() => parseArgs([], {}), /base URL/);
    assert.throws(() => parseArgs(['https://x', '--n', '0'], {}), /--n/);
});
