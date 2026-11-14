/*
 * Party play e2e relay harness (docs/plans/moba/MULTIPLAYER.md §12.4): the relay alone on a free port, with the
 * MemoryRoomStore, a ticket secret generated at start (never committed, never printed) and the allowed game origin
 * from FRONT_END_URLS. Sockets without an Origin are allowed only through this module's constructor option.
 *
 *   PORT=3105 FRONT_END_URLS=http://127.0.0.1:5400 npx ts-node --transpile-only test/party-relay.harness.ts
 */
import { randomBytes } from 'crypto';
import { createServer } from 'http';
import { memoryMm } from '../src/pawlegends/mm/mm-bridge';
import { MemoryMmRoomStore } from '../src/pawlegends/mm/mm-room.schema';
import { PartyRelay } from '../src/pawlegends/party/party-relay';
import { PartyTicketService } from '../src/pawlegends/party/party-ticket.service';
import { RefereePool } from '../src/pawlegends/party/referee-pool';
import { MemoryRoomStore } from '../src/pawlegends/party/room-store';
import { PAWLEGENDS_SIM_INFO } from '../src/pawlegends/pawlegends-sim-info';
import { CURRENT_SEASON_ID, seasonDef } from '../src/pawlegends/pawlegends-catalog';
import type { RankedJoinSource } from '../src/pawlegends/mm/mm-bridge';
import { RANKED_BOTS, RANKED_REGIONS } from '../src/pawlegends/ranked/tiers';
import { primeTime } from '../src/pawlegends/ranked/windows';

/*
 * Ranked in the e2e harness (SOCIAL-RANKED.md §7.11: always open since round 4): the harness browsers have no accounts
 * or saved matches, so the fixture lets guests queue. Production (MmService) reads the real account checks. The status
 * answer mirrors GET /pawlegends/ranked/status with fixed counts and the real Prime Time and bot rules.
 */
const RANKED_STATUS_FIXTURE = { open: true, online: 30, need: 0, searching: 2 };
const rankedFixture: RankedJoinSource = {
    check: async () => null,
    allowGuests: true,
};
const season = seasonDef(CURRENT_SEASON_ID)!;

process.env.PAWLEGENDS_PARTY_TICKET_SECRET = randomBytes(24).toString('hex');
const port = Number(process.env.PORT || 3105);
const origins = (process.env.FRONT_END_URLS || '').split(',').filter(Boolean);
const server = createServer((req, res) => {
    // a tiny health and counters route for the e2e driver
    if (req.url === '/health') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('access-control-allow-origin', '*');
        res.end(JSON.stringify({ ok: true, ...relay.counters() }));
        return;
    }
    // the game's PvP capability check (pawlegends/src/meta/pvpCapability.ts)
    if (req.url === '/pawlegends/sim') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('access-control-allow-origin', '*');
        res.end(JSON.stringify(PAWLEGENDS_SIM_INFO));
        return;
    }
    // the region ping (SOCIAL-RANKED.md §7.11)
    if (req.url === '/pawlegends/ping') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('cache-control', 'no-store');
        res.end('{"ok":true}');
        return;
    }
    // the game's Ranked tile (pawlegends/src/meta/ranked.ts): the same answer as GET /pawlegends/ranked/status
    if (req.url === '/pawlegends/ranked/status') {
        res.setHeader('content-type', 'application/json');
        res.setHeader('access-control-allow-origin', '*');
        res.end(
            JSON.stringify({
                ...RANKED_STATUS_FIXTURE,
                primeTime: primeTime(Date.now()),
                bots: { ...RANKED_BOTS },
                regions: RANKED_REGIONS.map(r => ({ ...r })),
                season: { id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt },
            })
        );
        return;
    }
    res.statusCode = 404;
    res.end();
});
const store = new MemoryRoomStore();
// every e2e browser connects from 127.0.0.1: give each socket its own address, so the per-IP caps (rooms, parties,
// failed joins; pinned by party-relay.security.spec.ts) never couple one spec to the rooms an earlier spec left behind
let sockets = 0;
const relay = new PartyRelay({
    clientIp: () => {
        sockets++;
        return `10.77.${(sockets >> 8) & 255}.${sockets & 255}`;
    },
    server,
    store,
    tickets: new PartyTicketService(),
    referee: new RefereePool({ inline: process.env.REFEREE_INLINE === '1' }),
    allowNoOrigin: true,
    // SPECTATE.md: e2e spectators run a short delay (production: SPECTATE_DELAY_MS per room kind)
    spectateDelayMs: () => Number(process.env.PAWLEGENDS_SPECTATE_DELAY_MS ?? 4000),
    // the e2e browsers have no server history: the casual newbie lock reads their hint here (never in production)
    mm: memoryMm({ rooms: new MemoryMmRoomStore(), ratings: null, trustHintMatches: true, ranked: rankedFixture }),
    originAllowed: o => origins.includes(o),
    log: (event, props) => {
        if (/desync|divergence|error|lag|verify|refused|match_/.test(event))
            console.log(`[relay] ${event} ${JSON.stringify(props)}`);
    },
});
server.listen(port, '127.0.0.1', () =>
    console.log(`[relay] listening on ${port} for ${origins.join(', ') || '(no origins)'}`)
);
const stop = async () => {
    await relay.shutdown();
    server.close();
    process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
