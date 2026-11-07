// Preload for pawlegends/tests/e2e/mp/load.mjs against a production-mode relay (infra/gcp/RUNBOOK.md, load test):
// the relay refuses sockets without an Origin, and Node's built-in WebSocket sends none. This wraps it so every
// socket carries ORIGIN (default https://tokentails.com) through undici's `headers` init option.
//   ORIGIN=http://localhost:3000 RELAY=http://127.0.0.1:18080 node --import ./infra/gcp/tools/ws-origin-shim.mjs \
//     pawlegends/tests/e2e/mp/load.mjs
const Base = globalThis.WebSocket;
const origin = process.env.ORIGIN ?? 'https://tokentails.com';
globalThis.WebSocket = class extends Base {
    constructor(url, protocols) {
        super(url, { protocols: protocols === undefined ? [] : [].concat(protocols), headers: { origin } });
    }
};

// load.mjs reads the harness's `GET /health` counters; the production relay serves them under `relay` on /healthz.
const baseFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.pathname !== '/health') return baseFetch(input, init);
    url.pathname = '/healthz';
    const res = await baseFetch(url, init);
    const body = await res.json();
    return new Response(JSON.stringify(body.relay ?? body), { status: res.status, headers: { 'content-type': 'application/json' } });
};
