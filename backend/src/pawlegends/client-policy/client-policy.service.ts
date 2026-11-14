import { Inject, Injectable, Optional } from '@nestjs/common';
import { constants, verify } from 'crypto';
import {
    CLIENT_POLICY_RETRY_SEC,
    CLIENT_POLICY_SCHEMA,
    CLIENT_POLICY_STORE_URLS,
    CLIENT_POLICY_WEB_URL,
    ClientPolicyAnswer,
    ClientPolicyQuery,
    PolicyChannelEntry,
    PolicyFile,
    canonicalPolicy,
    decidePolicy,
    effectiveMinSim,
    maintenanceOn,
    parsePolicyFile,
} from 'src/shared-contracts/client-policy';
import { PAWLEGENDS_SIM_INFO } from '../pawlegends-sim-info';
import { PAWLEGENDS_OTA_PUBLIC_KEY_PEM } from './ota-public-key';

/**
 * `GET /pawlegends/client-policy` (docs/plans/moba/FORCE-UPDATE.md §3.2): may this client build start, or must it
 * update? The backend only decides WHETHER: the signed OTA manifest still decides what the app installs.
 *
 * Sources, both public static files, so the backend needs no redeploy per OTA release:
 * - the app: the signed `policy.json` on tokentails.com for the client's platform and compat (written by
 *   pawlegends-app/scripts/ota-publish.mjs). Its signature is checked with the OTA public key; a bad one counts as
 *   a failed fetch;
 * - the web: the game build's `version.json` on pawlegends.app (sha and sim of the live build).
 * Each is cached 60 s; when a fetch fails the last good copy is served for up to 24 h; with nothing at all the answer
 * rests on the sims alone. The backend's own `SIM_VERSIONS` always apply: a sim it does not replay must update.
 * No database, no auth: a pure function over cached data.
 */

export const CLIENT_POLICY_DEPS = 'PAWLEGENDS_CLIENT_POLICY_DEPS';

export interface ClientPolicyDeps {
    fetchJson(url: string, timeoutMs: number): Promise<unknown>;
    now(): number;
    updatesUrl: string;
    webVersionUrl: string;
    publicKeyPem: string;
    acceptedSims(): readonly number[];
    liveSim(): number;
}

export const CLIENT_POLICY_CACHE_MS = 60_000;
export const CLIENT_POLICY_STALE_MS = 24 * 3_600_000;
const FETCH_TIMEOUT_MS = 3000;

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(timer);
    }
}

const DEFAULT_DEPS: ClientPolicyDeps = {
    fetchJson,
    now: () => Date.now(),
    updatesUrl: 'https://tokentails.com/pawlegends-app/updates',
    webVersionUrl: 'https://pawlegends.app/pawlegends-game/version.json',
    publicKeyPem: PAWLEGENDS_OTA_PUBLIC_KEY_PEM,
    acceptedSims: () => PAWLEGENDS_SIM_INFO.simVersions,
    liveSim: () => PAWLEGENDS_SIM_INFO.simVersion,
};

/** A signed policy file (null when malformed or the signature does not verify with the OTA key). */
export function verifiedPolicy(raw: unknown, publicKeyPem: string): PolicyFile | null {
    const file = parsePolicyFile(raw);
    if (!file) return null;
    try {
        const ok = verify(
            'sha256',
            Buffer.from(canonicalPolicy(raw as object)),
            { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
            Buffer.from(file.signature, 'base64')
        );
        return ok ? file : null;
    } catch {
        return null;
    }
}

/** The web build's `version.json` ({sha, simVersion}) as a channel entry: required at once, compared by sha. */
export function webEntry(raw: unknown): PolicyChannelEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>;
    if (typeof v.sha !== 'string' || !/^[0-9a-z]{4,40}$/.test(v.sha)) return null;
    if (typeof v.simVersion !== 'number' || !Number.isSafeInteger(v.simVersion)) return null;
    return {
        version: v.sha,
        seq: 0,
        simVersion: v.simVersion,
        minNative: '0',
        rollback: false,
        requiredFrom: new Date(0).toISOString(),
    };
}

interface CacheEntry<T> {
    at: number;
    value: T | null;
    /** When `value` was last fetched successfully. */
    goodAt: number;
}

@Injectable()
export class PawlegendsClientPolicyService {
    private readonly d: ClientPolicyDeps;
    private readonly cache = new Map<string, CacheEntry<unknown>>();
    private readonly inflight = new Map<string, Promise<unknown>>();

    constructor(@Optional() @Inject(CLIENT_POLICY_DEPS) deps?: Partial<ClientPolicyDeps>) {
        this.d = { ...DEFAULT_DEPS, ...(deps ?? {}) };
    }

    /** One cached source: fresh for 60 s; on a failed fetch the last good value for up to 24 h; else null. */
    private async cached<T>(url: string, parse: (raw: unknown) => T | null): Promise<T | null> {
        const now = this.d.now();
        const hit = this.cache.get(url) as CacheEntry<T> | undefined;
        if (hit && now - hit.at < CLIENT_POLICY_CACHE_MS) return hit.value;
        const running = this.inflight.get(url) as Promise<T | null> | undefined;
        if (running) return running;
        const p = (async (): Promise<T | null> => {
            let value: T | null = null;
            try {
                value = parse(await this.d.fetchJson(url, FETCH_TIMEOUT_MS));
            } catch {
                value = null;
            }
            const at = this.d.now();
            if (value !== null) {
                this.cache.set(url, { at, value, goodAt: at });
                return value;
            }
            const stale = hit && hit.value !== null && at - hit.goodAt <= CLIENT_POLICY_STALE_MS ? hit.value : null;
            this.cache.set(url, { at, value: stale, goodAt: hit?.goodAt ?? 0 });
            return stale;
        })();
        this.inflight.set(url, p);
        try {
            return await p;
        } finally {
            this.inflight.delete(url);
        }
    }

    policyFile(platform: 'ios' | 'android', compat: number): Promise<PolicyFile | null> {
        const url = `${this.d.updatesUrl}/${platform}/${compat}/policy.json`;
        return this.cached(url, raw => {
            const f = verifiedPolicy(raw, this.d.publicKeyPem);
            return f && f.platform === platform && f.compat === compat ? f : null;
        });
    }

    webLatest(): Promise<PolicyChannelEntry | null> {
        return this.cached(this.d.webVersionUrl, webEntry);
    }

    async answer(q: ClientPolicyQuery): Promise<ClientPolicyAnswer> {
        const accepted = [...this.d.acceptedSims()];
        const now = this.d.now();
        let policy: PolicyFile | null = null;
        let latest: PolicyChannelEntry | null | undefined;
        if ((q.platform === 'ios' || q.platform === 'android') && q.compat !== undefined) {
            policy = await this.policyFile(q.platform, q.compat);
        } else if (q.platform === 'web') {
            latest = await this.webLatest();
        }
        const decision = decidePolicy({ policy, latest, acceptedSims: accepted, client: q, now });
        const store =
            policy?.store ??
            (q.platform === 'ios' || q.platform === 'android' || q.platform === 'mac'
                ? CLIENT_POLICY_STORE_URLS[q.platform]
                : null);
        return {
            schema: CLIENT_POLICY_SCHEMA,
            ...decision,
            minSim: effectiveMinSim(policy ? policy.minSim : null, accepted),
            acceptedSims: accepted,
            liveSim: this.d.liveSim(),
            store,
            web: policy?.web ?? CLIENT_POLICY_WEB_URL,
            maintenance: policy && maintenanceOn(policy.maintenance, now) ? policy.maintenance : null,
            retryAfterSec: CLIENT_POLICY_RETRY_SEC,
            checkedAt: new Date(now).toISOString(),
        };
    }
}
