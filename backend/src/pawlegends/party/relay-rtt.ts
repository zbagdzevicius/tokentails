/*
 * Server-measured round-trip times of relay sockets (LATENCY-PLAN M2): the time from a WebSocket ping to its pong,
 * grouped by the visitor's continent. Feeds `rtt_ms_p50`, `rtt_ms_p95` and `rtt_ms_p95_<region>` in the relay's
 * counters (the one-a-minute `relay_stats` log line and its log-based metrics).
 *
 * Privacy: only a continent code and a number are kept. No IP, no country, no socket or member id.
 * The continent comes from Cloudflare's `cf-ipcountry` header; a direct caller can send any value, which only moves a
 * sample between regions (it is a statistic, never an access decision).
 */

/** Samples kept per region and in total (the newest win). */
export const RTT_PER_REGION = 512;
export const RTT_TOTAL = 2048;
/** A pong later than this is a stall, not a round trip (kept out of the percentiles). */
export const RTT_MAX_MS = 10_000;

export type RttRegion = 'eu' | 'na' | 'sa' | 'as' | 'af' | 'oc' | 'me' | 'unknown';

const R: Record<Exclude<RttRegion, 'unknown'>, string> = {
    eu: 'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
    na: 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
    sa: 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
    as: 'AF AM AZ BD BN BT CN GE HK ID IN JP KG KH KP KR KZ LA LK MM MN MO MV MY NP PH PK SG TH TJ TL TM TW UZ VN',
    me: 'AE BH IL IQ IR JO KW LB OM PS QA SA SY TR YE',
    af: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
    oc: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS',
};

const BY_COUNTRY = new Map<string, RttRegion>();
for (const [region, list] of Object.entries(R)) for (const c of list.split(' ')) BY_COUNTRY.set(c, region as RttRegion);

/** The continent of an ISO country code (`cf-ipcountry`); `unknown` for anything else (XX, T1 Tor, junk, absent). */
export function regionOfCountry(raw: unknown): RttRegion {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string' || v.length !== 2) return 'unknown';
    return BY_COUNTRY.get(v.toUpperCase()) ?? 'unknown';
}

/** The nearest-rank percentile of an ascending array (0 when empty). */
export function pct(sorted: readonly number[], q: number): number {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

/** A bounded ring of RTT samples, total and per region. */
export class RelayRtt {
    private readonly all: number[] = [];
    private readonly byRegion = new Map<RttRegion, number[]>();

    add(region: RttRegion, ms: number): void {
        if (!(ms >= 0 && ms <= RTT_MAX_MS)) return;
        const v = Math.round(ms);
        this.all.push(v);
        if (this.all.length > RTT_TOTAL) this.all.shift();
        let r = this.byRegion.get(region);
        if (!r) this.byRegion.set(region, (r = []));
        r.push(v);
        if (r.length > RTT_PER_REGION) r.shift();
    }

    get size(): number {
        return this.all.length;
    }

    /**
     * The counters' RTT keys: the p50 and p95 of every kept sample, and `rtt_ms_p95_<region>` for each region with
     * samples. Flat numbers, so a log-based metric reads each one as `jsonPayload.rtt_ms_p95_eu`.
     */
    counters(): { rtt_ms_p50: number; rtt_ms_p95: number; rtt_n: number } & Record<string, number> {
        const s = [...this.all].sort((a, b) => a - b);
        const out: { rtt_ms_p50: number; rtt_ms_p95: number; rtt_n: number } & Record<string, number> = {
            rtt_ms_p50: pct(s, 0.5),
            rtt_ms_p95: pct(s, 0.95),
            rtt_n: s.length,
        };
        for (const [region, xs] of this.byRegion)
            if (xs.length)
                out[`rtt_ms_p95_${region}`] = pct(
                    [...xs].sort((a, b) => a - b),
                    0.95
                );
        return out;
    }
}
