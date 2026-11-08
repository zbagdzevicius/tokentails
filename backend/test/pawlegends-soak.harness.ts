/*
 * Multi-client PvP soak relay (pawlegends/tests/e2e/mp/soak.mjs, docs/plans/moba/V16.md "Not done"): the relay with
 * the production referee pool (worker threads), the memory room store and the memory matchmaker, plus the `/live`
 * party save path (`liveGamePipe` and `savePawlegendsPartyMatch`) over in-memory users, games and ratings, so every
 * soak room is checked end to end: referee verdict, then each seat's own result through the one score writer.
 *
 * Local only: it listens on 127.0.0.1, generates its ticket secret at start (never printed) and mints tickets for
 * accounts it creates itself. Never point it at production data.
 *
 *   PORT=3121 npx ts-node -r tsconfig-paths/register test/pawlegends-soak.harness.ts
 *
 * (Type-checked, not --transpile-only: the `/live` path loads Mongoose schemas whose decorators need type metadata.)
 *
 * Routes: GET /health (relay counters, process CPU and memory), POST /soak/tickets {n}, POST /soak/ticket
 * {accountId}, GET /soak/room?id=, POST /soak/live {userId, pawlegends}, GET /soak/events.
 */
import { randomBytes } from 'crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { Types } from 'mongoose';
import { GameType } from '../src/game/game.schema';
import { liveGamePipe, LiveGameDto } from '../src/user/dto/live-game.dto';
import { applyUpdate } from '../src/user/heist/fake-live-store.helper-spec';
import { memoryMm } from '../src/pawlegends/mm/mm-bridge';
import { MemoryMmRoomStore } from '../src/pawlegends/mm/mm-room.schema';
import { MemoryRatingSource, type MmRatingRow } from '../src/pawlegends/mm/rating.schema';
import { PartyRelay } from '../src/pawlegends/party/party-relay';
import { PartyTicketService } from '../src/pawlegends/party/party-ticket.service';
import { RefereePool } from '../src/pawlegends/party/referee-pool';
import { MemoryRoomStore } from '../src/pawlegends/party/room-store';
import { savePawlegendsPartyMatch, type PawlegendsRatingModel } from '../src/pawlegends/pawlegends-party-live';
import { PAWLEGENDS_SIM_INFO } from '../src/pawlegends/pawlegends-sim-info';

process.env.PAWLEGENDS_PARTY_TICKET_SECRET = randomBytes(24).toString('hex');
const port = Number(process.env.PORT || 3121);

type Doc = Record<string, any>;
const clone = <T>(v: T): T => (v === undefined || v instanceof Date ? v : JSON.parse(JSON.stringify(v)));

/** The user and game repositories `/live` uses, in memory (the same semantics as the spec fakes, without jest). */
class Users {
    readonly docs = new Map<string, Doc>();
    add(): string {
        const id = new Types.ObjectId().toString();
        this.docs.set(id, { _id: new Types.ObjectId(id), cat: new Types.ObjectId() });
        return id;
    }
    async findOne({ searchObject, projection }: { searchObject: Doc; projection?: string }) {
        const doc = this.docs.get(String(searchObject._id));
        if (!doc) return null;
        if (!projection) return { ...clone(doc), _id: doc._id };
        const out: Doc = { _id: doc._id };
        for (const f of projection.split(/\s+/).filter(Boolean))
            if (f in doc) out[f] = f === 'cat' ? doc[f] : clone(doc[f]);
        return out;
    }
    async update(id: string, update: Doc) {
        const doc = this.docs.get(String(id));
        if (doc) applyUpdate(doc, update);
        return doc ?? null;
    }
    async claimBelowCap(id: string, path: string, cap: number): Promise<number | null> {
        const doc = this.docs.get(String(id));
        if (!doc) return null;
        const [field, key] = path.split('.');
        const cur = key === undefined ? doc[field] : doc[field]?.[key];
        if (typeof cur === 'number' && cur >= cap) return null;
        applyUpdate(doc, { $set: { [path]: cap } });
        return typeof cur === 'number' ? Math.max(0, cur) : 0;
    }
}

class Games {
    readonly rows: Doc[] = [];
    async findOne({ searchObject }: { searchObject: Doc }) {
        return this.rows.find(r => Object.entries(searchObject).every(([k, v]) => r[k] === v)) || null;
    }
    async create(row: Doc) {
        if (row.replayDigest && this.rows.some(r => r.replayDigest === row.replayDigest))
            throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
        const stored = { ...row, _id: new Types.ObjectId() };
        this.rows.push(stored);
        return stored;
    }
}

/** The rating model the save writes, feeding the matchmaker's memory rating source (so ratings move as in production). */
function ratingModel(src: MemoryRatingSource): PawlegendsRatingModel {
    const put = (row: MmRatingRow) => {
        src.rows.set(row._id, row);
        // MemoryRatingSource reads a co-op row by the bare account id
        if (row._id.endsWith(':coop')) src.rows.set(row._id.slice(0, -5), row);
    };
    return {
        findById: (id: string) => ({ lean: async () => clone(src.rows.get(id) ?? null) }),
        async updateOne(filter: Doc, update: Doc) {
            const row = src.rows.get(filter._id);
            if (!row || (row.v ?? 0) !== filter.v) return { modifiedCount: 0 };
            put({ ...row, ...clone(update.$set ?? {}), v: (row.v ?? 0) + (update.$inc?.v ?? 0) });
            return { modifiedCount: 1 };
        },
        async create(doc: Doc) {
            if (src.rows.has(doc._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            put(clone(doc) as MmRatingRow);
            return doc;
        },
    };
}

const store = new MemoryRoomStore();
const mmRooms = new MemoryMmRoomStore();
const ratings = new MemoryRatingSource();
const tickets = new PartyTicketService();
const users = new Users();
const games = new Games();
const events = new Map<string, number>();
const problems: { at: number; event: string; props: Record<string, unknown> }[] = [];
const PROBLEM = /desync|divergence|error|verify|refused|lag|abandon|restore|lost/;

const server = createServer((req, res) => void route(req, res));
// every socket gets its own address: one host runs hundreds of clients, the per-IP caps are not under test here
let sockets = 0;
const relay = new PartyRelay({
    clientIp: () => {
        sockets++;
        return `10.${(sockets >> 16) & 255}.${(sockets >> 8) & 255}.${sockets & 255}`;
    },
    server,
    store,
    tickets,
    referee: new RefereePool({ inline: process.env.REFEREE_INLINE === '1' }),
    allowNoOrigin: true,
    // soak clients have no saved history: the casual newbie lock reads their hint (never in production)
    mm: memoryMm({ rooms: mmRooms, ratings, trustHintMatches: true }),
    originAllowed: () => false,
    ...(process.env.SOAK_MAX_ROOMS ? { maxLiveRooms: Number(process.env.SOAK_MAX_ROOMS) } : {}),
    log: (event, props) => {
        events.set(event, (events.get(event) ?? 0) + 1);
        if (PROBLEM.test(event)) {
            problems.push({ at: Date.now(), event, props });
            if (problems.length > 500) problems.shift();
            if (process.env.SOAK_QUIET !== '1') console.log(`[relay] ${event} ${JSON.stringify(props)}`);
        }
    },
});

const json = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage): Promise<Doc> =>
    new Promise((resolve, reject) => {
        let s = '';
        req.on('data', c => {
            s += c;
            if (s.length > 64 * 1024) reject(new Error('body too large'));
        });
        req.on('end', () => {
            try {
                resolve(s ? JSON.parse(s) : {});
            } catch (e) {
                reject(e);
            }
        });
    });

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    try {
        if (url.pathname === '/health') {
            const mem = process.memoryUsage();
            const cpu = process.cpuUsage();
            return json(res, 200, {
                ok: true,
                ...relay.counters(),
                rss: mem.rss,
                heapUsed: mem.heapUsed,
                cpuUserUs: cpu.user,
                cpuSystemUs: cpu.system,
                uptimeMs: Math.round(process.uptime() * 1000),
                roomsStored: store.rooms.size,
            });
        }
        if (url.pathname === '/pawlegends/sim') return json(res, 200, PAWLEGENDS_SIM_INFO);
        if (url.pathname === '/soak/events') return json(res, 200, { events: Object.fromEntries(events), problems });
        if (url.pathname === '/soak/tickets' && req.method === 'POST') {
            const n = Math.max(1, Math.min(12, Number((await readBody(req)).n) || 1));
            const out = [];
            for (let i = 0; i < n; i++) {
                const accountId = users.add();
                out.push({ accountId, ticket: tickets.issue({ accountId, guest: false }).ticket });
            }
            return json(res, 200, out);
        }
        if (url.pathname === '/soak/ticket' && req.method === 'POST') {
            // a fresh single-use ticket for an existing soak account (a reload mints a new one, as the embed host does)
            const accountId = String((await readBody(req)).accountId ?? '');
            if (!users.docs.has(accountId)) return json(res, 404, { error: 'unknown account' });
            return json(res, 200, { accountId, ticket: tickets.issue({ accountId, guest: false }).ticket });
        }
        if (url.pathname === '/soak/room') {
            const r = await store.get(url.searchParams.get('id') ?? '');
            if (!r) return json(res, 404, { error: 'no room' });
            const { chunks, ...rest } = r;
            return json(res, 200, { ...rest, logBytes: chunks.reduce((n, c) => n + c.length, 0) });
        }
        if (url.pathname === '/soak/live' && req.method === 'POST') {
            const { userId, pawlegends } = await readBody(req);
            // the body the game's host posts to `POST /user/catbassadors/live` for a party (v: 2) result
            const body = { type: GameType.PAWLEGENDS, pawlegends };
            try {
                const dto = (await liveGamePipe.transform(body, { type: 'body', metatype: LiveGameDto })) as Doc;
                const result = await savePawlegendsPartyMatch(
                    {
                        users,
                        games,
                        rooms: store,
                        mm: { rooms: mmRooms, ratings: ratingModel(ratings) },
                        logger: { warn: () => undefined, log: () => undefined },
                    },
                    String(userId),
                    dto as never
                );
                return json(res, 200, { ok: true, result });
            } catch (e) {
                const err = e as { getStatus?: () => number; getResponse?: () => unknown; message?: string };
                const status = err.getStatus?.() ?? 500;
                const r = (err.getResponse?.() ?? {}) as { code?: string; message?: unknown };
                return json(res, 200, {
                    ok: false,
                    status,
                    code: r.code ?? null,
                    message: String(r.message ?? err.message),
                });
            }
        }
        res.statusCode = 404;
        res.end();
    } catch (e) {
        json(res, 500, { error: String((e as Error)?.message ?? e) });
    }
}

server.listen(port, '127.0.0.1', () => console.log(`[soak-relay] listening on ${port}`));
const stop = async () => {
    await relay.shutdown();
    server.close();
    process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
