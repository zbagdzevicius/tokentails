// Test-only preload for a THROWAWAY local backend in the donation E2E (stack.sh). Never used in
// production: stack.sh starts `node -r <this file> <scratch build>/main.js` from a scratch directory
// (so backend/.env is never loaded) against a local Mongo database and a local anvil fork.
//
// 1. Firebase stub. Real Firebase cannot verify tokens without the service-account key, which this
//    harness never reads. `firebase-admin` is replaced by a stand-in whose verifyIdToken accepts
//    `e2e.<base64url JSON payload>` tokens (send `accesstoken: fbe2e.<...>`) and nothing else.
// 2. Job triggers. The reconcile (relay, match, treats), payout indexer and impact snapshot jobs run on
//    crons (2, 5, 60 minutes). The harness keeps the app instance and serves
//    POST http://127.0.0.1:$E2E_JOBS_PORT/run/{reconcile,indexer,snapshot} so the test runs each job
//    once, on demand, through the same service methods the crons call.
//
// Safety: refuses to start unless MONGODB_URI points at localhost and every RPC URL is local.
'use strict';

const Module = require('module');
const http = require('http');
const path = require('path');

const local = (u) => /^(mongodb|https?):\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(u || '');
const refuse = (msg) => {
    console.error(`[e2e-harness] refusing to start: ${msg}`);
    process.exit(2);
};
if (process.env.NODE_ENV === 'production') refuse('NODE_ENV=production');
if (!local(process.env.MONGODB_URI)) refuse('MONGODB_URI must be a localhost database');
for (const k of ['SHELTER_ARC_RPC_URL', 'SHELTER_TRY_RPC_URL', 'SHELTER_X402_EXACT_RPC', 'SHELTER_X402_FACILITATOR_URL']) {
    if (process.env[k] && !local(process.env[k])) refuse(`${k} must be a local RPC`);
}
if (!local(process.env.SHELTER_ARC_RPC_URL)) refuse('SHELTER_ARC_RPC_URL must be set to the local fork');

// ---------------------------------------------------------------- 1. firebase-admin stand-in
const decode = (token) => {
    if (typeof token !== 'string' || !token.startsWith('e2e.')) throw new Error('e2e harness: not an e2e token');
    const p = JSON.parse(Buffer.from(token.slice(4), 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    return { iat: now, exp: now + 3600, aud: 'e2e', iss: 'e2e', sub: p.uid, ...p };
};
const fakeAuth = {
    verifyIdToken: async (t) => decode(t),
    getUser: async (uid) => ({ uid }),
    getUsers: async (ids) => ({ users: ids.map((x) => ({ uid: x.uid })), notFound: [] }),
    deleteUsers: async () => ({ successCount: 0, failureCount: 0, errors: [] }),
};
const fakeAdmin = {
    apps: [],
    initializeApp() {
        const app = { name: '[e2e]', options: {} };
        this.apps.push(app);
        return app;
    },
    credential: { cert: () => ({}) },
    auth: () => fakeAuth,
    appCheck: () => ({ verifyToken: async () => ({}) }),
};
fakeAdmin.default = fakeAdmin;
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'firebase-admin') return fakeAdmin;
    return origLoad.call(this, request, parent, isMain);
};

// ---------------------------------------------------------------- 2. app capture + job triggers
const core = require('@nestjs/core');
const origCreate = core.NestFactory.create.bind(core.NestFactory);
let app = null;
core.NestFactory.create = async (...args) => {
    app = await origCreate(...args);
    return app;
};

const dist = path.dirname(require.main ? require.main.filename : process.argv[1]);
const jobs = {
    reconcile: () => {
        const { ShelterDonateReconcileService } = require(path.join(dist, 'shelter/onchain/shelter-donate-reconcile.service'));
        return app.get(ShelterDonateReconcileService).reconcileOnce();
    },
    indexer: () => {
        const { ImpactIndexerService } = require(path.join(dist, 'impact/impact-indexer.service'));
        return app.get(ImpactIndexerService).indexOnce();
    },
    snapshot: async () => {
        const { ImpactService } = require(path.join(dist, 'impact/impact.service'));
        const s = await app.get(ImpactService).snapshotOnce();
        return { ok: true, asOf: s && s.asOf };
    },
};
const port = Number(process.env.E2E_JOBS_PORT || 0);
if (port) {
    http.createServer(async (req, res) => {
        const m = /^\/run\/(\w+)$/.exec(req.url || '');
        const job = m && jobs[m[1]];
        if (req.method !== 'POST' || !job) {
            res.writeHead(404).end();
            return;
        }
        if (!app) {
            res.writeHead(503).end('{"error":"app not up"}');
            return;
        }
        try {
            const out = await job();
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(out ?? null, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
        } catch (e) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: String((e && e.stack) || e) }));
        }
    }).listen(port, '127.0.0.1');
}
