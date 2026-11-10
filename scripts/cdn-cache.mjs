#!/usr/bin/env node
/*
 * Cloudflare cache steps for the Paw Legends game and its OTA files (LATENCY-PLAN C5, infra/gcp/RUNBOOK.md
 * "Latency: Cloudflare cache"). No dependencies.
 *
 *   node scripts/cdn-cache.mjs ota  --file manifest-beta.json [--compat 1] [--platform ios]
 *     Waits until the origin serves the committed manifest (its `version`), then purges that manifest URL from
 *     Cloudflare, so apps see a new bundle at once instead of after the edge TTL.
 *   node scripts/cdn-cache.mjs game --since <git sha>
 *     Waits until the origin serves the committed /pawlegends-game/index.html, purges it, then fetches every
 *     build/ file added since <sha> once, so the first player after a deploy is not the one who fills the edge.
 *
 * Env: CF_API_TOKEN (Zone.Cache Purge), CF_ZONE_ID. Without both, the purge is skipped with a notice; the warm-up and
 * the wait still run. SITE (default https://tokentails.com). Never prints the token.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE ?? 'https://tokentails.com').replace(/\/+$/, '');

export const otaPath = (file, platform = 'ios', compat = '1') => `/pawlegends-app/updates/${platform}/${compat}/${file}`;
export const GAME_INDEX = '/pawlegends-game/index.html';

/** Files under client/public/pawlegends-game/build/ added between `since` and HEAD, as site paths. */
export function addedBuildPaths(diffNameStatus) {
    const out = [];
    for (const line of diffNameStatus.split('\n')) {
        const [status, file] = line.split('\t');
        if (status !== 'A' || !file) continue;
        const m = /^client\/public(\/pawlegends-game\/build\/[^/]+)$/.exec(file);
        if (m) out.push(m[1]);
    }
    return out;
}

/** Cloudflare purge-by-URL body: at most 30 URLs a call (the API limit). */
export function purgeBatches(urls, size = 30) {
    const out = [];
    for (let i = 0; i < urls.length; i += size) out.push({ files: urls.slice(i, i + size) });
    return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Poll `url` (cache-busted) until `ok(body)`; true when it matched within `timeoutMs`. */
export async function waitForOrigin(url, ok, { timeoutMs = 600_000, everyMs = 15_000, fetchImpl = fetch } = {}) {
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            const r = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`, { cache: 'no-store' });
            if (r.ok && ok(await r.text())) return true;
        } catch {
            /* retry */
        }
        if (Date.now() > end) return false;
        await sleep(everyMs);
    }
}

async function purge(urls, fetchImpl = fetch) {
    const token = process.env.CF_API_TOKEN;
    const zone = process.env.CF_ZONE_ID;
    if (!token || !zone) {
        console.log('::notice::CF_API_TOKEN / CF_ZONE_ID not set: no Cloudflare purge (the edge TTL expires it).');
        return;
    }
    for (const body of purgeBatches(urls)) {
        const r = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j.success !== true) throw new Error(`purge failed: HTTP ${r.status}`);
        console.log(`purged ${body.files.length} URL(s)`);
    }
}

async function warm(urls, fetchImpl = fetch) {
    let ok = 0;
    for (const u of urls) {
        try {
            const r = await fetchImpl(u);
            await r.arrayBuffer();
            if (r.ok) ok++;
            console.log(`${r.status} ${r.headers.get('cf-cache-status') ?? '-'} ${u}`);
        } catch (e) {
            console.log(`fail ${u}: ${e.message}`);
        }
    }
    return ok;
}

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
}

async function main() {
    const mode = process.argv[2];
    if (mode === 'ota') {
        const file = arg('file', 'manifest-beta.json');
        const platform = arg('platform', 'ios');
        const compat = arg('compat', '1');
        const path = otaPath(file, platform, compat);
        const local = JSON.parse(readFileSync(join(REPO, 'client/public', path), 'utf8')).version;
        console.log(`waiting for ${SITE}${path} to serve ${local}`);
        const live = await waitForOrigin(`${SITE}${path}`, body => {
            try {
                return JSON.parse(body).version === local;
            } catch {
                return false;
            }
        });
        if (!live) throw new Error(`origin never served ${local}`);
        await purge([`${SITE}${path}`]);
        return;
    }
    if (mode === 'game') {
        const since = arg('since', 'HEAD~1');
        const local = readFileSync(join(REPO, 'client/public', GAME_INDEX), 'utf8');
        const entry = /build\/index-[A-Za-z0-9_-]+\.js/.exec(local)?.[0];
        if (!entry) throw new Error('no build/index-*.js in the committed index.html');
        console.log(`waiting for ${SITE}${GAME_INDEX} to load ${entry}`);
        if (!(await waitForOrigin(`${SITE}${GAME_INDEX}`, body => body.includes(entry))))
            throw new Error(`origin never served ${entry}`);
        await purge([`${SITE}${GAME_INDEX}`]);
        const diff = execFileSync('git', ['diff', '--name-status', `${since}`, 'HEAD', '--', 'client/public/pawlegends-game/build'], {
            cwd: REPO,
            encoding: 'utf8',
        });
        const paths = addedBuildPaths(diff);
        const ok = await warm(paths.map(p => `${SITE}${p}`));
        console.log(`warmed ${ok}/${paths.length} new build file(s)`);
        return;
    }
    console.error('usage: cdn-cache.mjs ota --file manifest-beta.json | game --since <sha>');
    process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch(e => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}
