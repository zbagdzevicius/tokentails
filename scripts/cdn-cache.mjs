#!/usr/bin/env node
/*
 * Cloudflare cache steps for the Paw Legends game and its OTA files (LATENCY-PLAN C5, infra/gcp/RUNBOOK.md
 * "Latency: Cloudflare cache"). No dependencies.
 *
 *   node scripts/cdn-cache.mjs ota  --file manifest-beta.json|manifest.json|policy.json [--compat <n>] [--platform ios]
 *     Waits until the origin serves the committed file (its `signature`), then purges that URL from Cloudflare, so
 *     apps see a new bundle or update policy (docs/plans/moba/FORCE-UPDATE.md) at once instead of after the edge TTL.
 *     --compat defaults to NATIVE_COMPAT (pawlegends-app/scripts/lib/app-config.mjs).
 *   node scripts/cdn-cache.mjs game --since <git sha> [--root client/public] [--no-purge]
 *     Purges /pawlegends-game/index.html (bare and `?embed=1`, the URL the game iframe loads) and fetches it until it
 *     serves the committed build, purges once more, then fetches the page and every build/ file added since <sha>
 *     once, so the first player after a deploy is not the one who fills the edge. The purge runs before each poll
 *     because the Cloudflare rule ignores the query string for that page (RUNBOOK rule 1): a `?cb=` alone would read
 *     the edge copy. `--root` is the folder that holds the committed pawlegends-game build (default pawlegends-web/public,
 *     served on pawlegends.app by its own Vercel project, docs/plans/moba/PAWLEGENDS-WEB.md; tokentails.com only
 *     redirects there). `--no-purge` skips Cloudflare (a site outside the CF_ZONE_ID zone); the wait and the warm-up
 *     still run.
 *
 * Env: CF_API_TOKEN (Zone.Cache Purge), CF_ZONE_ID. Without both, the purge is skipped with a notice; the warm-up and
 * the wait still run. SITE: the origin (default https://tokentails.com for `ota`, where the app's OTA files stay, and
 * https://pawlegends.app for `game`). Never prints the token.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.SITE ?? 'https://tokentails.com').replace(/\/+$/, '');
/** Where the game is served (pawlegends-web's own Vercel project). */
const GAME_SITE = (process.env.SITE ?? 'https://pawlegends.app').replace(/\/+$/, '');

export const otaPath = (file, platform = 'ios', compat = '1') => `/pawlegends-app/updates/${platform}/${compat}/${file}`;
export const GAME_INDEX = '/pawlegends-game/index.html';

/** The app's native compat level, the folder the live manifests are in (pawlegends-app/scripts/lib/app-config.mjs). */
export function nativeCompat(src = readFileSync(join(REPO, 'pawlegends-app/scripts/lib/app-config.mjs'), 'utf8')) {
    const n = Number(/NATIVE_COMPAT = (\d+)/.exec(src)?.[1]);
    if (!Number.isInteger(n)) throw new Error('cdn-cache: NATIVE_COMPAT not found in app-config.mjs');
    return n;
}

/** The folder that holds the committed game build (pawlegends-web, served on pawlegends.app). */
export const DEFAULT_GAME_ROOT = 'pawlegends-web/public';

/** Files under <root>/pawlegends-game/build/ added between `since` and HEAD, as site paths. */
export function addedBuildPaths(diffNameStatus, root = DEFAULT_GAME_ROOT) {
    const prefix = `${root.replace(/\/+$/, '')}/`;
    const out = [];
    for (const line of diffNameStatus.split('\n')) {
        const [status, file] = line.split('\t');
        if (status !== 'A' || !file) continue;
        if (!file.startsWith(prefix)) continue;
        const m = /^(\/pawlegends-game\/build\/[^/]+)$/.exec(file.slice(prefix.length - 1));
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

/** The game page URLs a purge and the warm-up cover: the bare page and the one the embed iframe loads. */
export const gameIndexUrls = site => [`${site}${GAME_INDEX}`, `${site}${GAME_INDEX}?embed=1`];

/**
 * Poll `url` (cache-busted) until `ok(body)`; true when it matched within `timeoutMs`. `before` (optional) runs
 * before each poll, e.g. a purge when the edge ignores the query string.
 */
export async function waitForOrigin(url, ok, { timeoutMs = 600_000, everyMs = 15_000, fetchImpl = fetch, before } = {}) {
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            if (before) await before();
            const r = await fetchImpl(`${url}${url.includes('?') ? '&' : '?'}cb=${Date.now()}`, { cache: 'no-store' });
            if (r.ok && ok(await r.text())) return true;
        } catch {
            /* retry */
        }
        if (Date.now() > end) return false;
        await sleep(everyMs);
    }
}

let purgeNoticed = false;
let noPurge = false;
async function purge(urls, fetchImpl = fetch, quiet = false) {
    if (noPurge) return;
    const token = process.env.CF_API_TOKEN;
    const zone = process.env.CF_ZONE_ID;
    if (!token || !zone) {
        if (!purgeNoticed) console.log('::notice::CF_API_TOKEN / CF_ZONE_ID not set: no Cloudflare purge (the edge TTL expires it).');
        purgeNoticed = true;
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
        if (!quiet) console.log(`purged ${body.files.length} URL(s)`);
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
        const compat = arg('compat', String(nativeCompat()));
        const path = otaPath(file, platform, compat);
        const committed = JSON.parse(readFileSync(join(REPO, 'client/public', path), 'utf8'));
        // manifests and policy.json are both signed: the signature names the exact committed content
        const local = committed.signature ?? committed.version;
        console.log(`waiting for ${SITE}${path} to serve ${committed.version ?? committed.issuedAt ?? 'the committed file'}`);
        const live = await waitForOrigin(`${SITE}${path}`, body => {
            try {
                const j = JSON.parse(body);
                return (j.signature ?? j.version) === local;
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
        const root = arg('root', DEFAULT_GAME_ROOT).replace(/\/+$/, '');
        noPurge = process.argv.includes('--no-purge');
        if (noPurge) console.log('--no-purge: no Cloudflare purge for ' + GAME_SITE);
        const local = readFileSync(join(REPO, root, GAME_INDEX), 'utf8');
        const entry = /build\/index-[A-Za-z0-9_-]+\.js/.exec(local)?.[0];
        if (!entry) throw new Error('no build/index-*.js in the committed index.html');
        const pages = gameIndexUrls(GAME_SITE);
        console.log(`waiting for ${pages[1]} to load ${entry}`);
        if (!(await waitForOrigin(pages[1], body => body.includes(entry), { before: () => purge(pages, fetch, true) })))
            throw new Error(`origin never served ${entry}`);
        await purge(pages);
        await warm(pages);
        const diff = execFileSync('git', ['diff', '--name-status', `${since}`, 'HEAD', '--', `${root}/pawlegends-game/build`], {
            cwd: REPO,
            encoding: 'utf8',
        });
        const paths = addedBuildPaths(diff, root);
        const ok = await warm(paths.map(p => `${GAME_SITE}${p}`));
        console.log(`warmed ${ok}/${paths.length} new build file(s)`);
        return;
    }
    console.error('usage: cdn-cache.mjs ota --file manifest-beta.json | game --since <sha> [--root <dir>] [--no-purge]');
    process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch(e => {
        console.error(`::error::${e.message}`);
        process.exit(1);
    });
}
