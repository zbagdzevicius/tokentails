/*
 * Party play e2e relay harness (docs/plans/moba/MULTIPLAYER.md §12.4): the relay alone on a free port, with the
 * MemoryRoomStore, a ticket secret generated at start (never committed, never printed) and the allowed game origin
 * from FRONT_END_URLS. Sockets without an Origin are allowed only through this module's constructor option.
 *
 *   PORT=3105 FRONT_END_URLS=http://127.0.0.1:5400 npx ts-node --transpile-only test/party-relay.harness.ts
 */
import { randomBytes } from 'crypto';
import { createServer } from 'http';
import { PartyRelay } from '../src/pawlegends/party/party-relay';
import { PartyTicketService } from '../src/pawlegends/party/party-ticket.service';
import { RefereePool } from '../src/pawlegends/party/referee-pool';
import { MemoryRoomStore } from '../src/pawlegends/party/room-store';

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
    res.statusCode = 404;
    res.end();
});
const store = new MemoryRoomStore();
const relay = new PartyRelay({
    server,
    store,
    tickets: new PartyTicketService(),
    referee: new RefereePool({ inline: process.env.REFEREE_INLINE === '1' }),
    allowNoOrigin: true,
    originAllowed: (o) => origins.includes(o),
    log: (event, props) => {
        if (/desync|divergence|error|lag|verify|refused|match_/.test(event)) console.log(`[relay] ${event} ${JSON.stringify(props)}`);
    },
});
server.listen(port, '127.0.0.1', () => console.log(`[relay] listening on ${port} for ${origins.join(', ') || '(no origins)'}`));
const stop = async () => {
    await relay.shutdown();
    server.close();
    process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
