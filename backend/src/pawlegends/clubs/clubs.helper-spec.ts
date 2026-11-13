import { ChatBus } from '../social/chat-bus';
import { ChatService } from '../social/chat.service';
import { SocialMemoryModel, TestClock } from '../social/social-model.helper-spec';
import { ClubsService } from './clubs.service';
import { KudosService } from '../kudos/kudos.service';
import { MemoryRoomStore } from '../party/room-store';

/* The clubs and kudos harness: in-memory models, a fixed clock, a real ChatService. Not a spec. */

export interface Account {
    id: string;
    band?: '18+' | '16-17' | 'under16' | null;
    guest?: boolean;
}

export function clubHarness(accounts: Account[]) {
    const clock = new TestClock(Date.UTC(2026, 10, 11, 12, 0, 0)); // Wednesday
    const now = clock.now;
    const m = () => new SocialMemoryModel([], [{ fields: ['_id'] }], now);
    const models = {
        threads: m(),
        messages: m(),
        social: new SocialMemoryModel(
            accounts.map(a => ({ _id: a.id, code: a.id.padEnd(8, '0').slice(0, 8), rev: 0, dmPolicy: 'friends' })),
            [{ fields: ['_id'] }],
            now
        ),
        friends: m(),
        blocks: m(),
        buyers: new SocialMemoryModel(
            accounts.filter(a => a.band).map(a => ({ key: `account:${a.id}`, ageBand: a.band })),
            [{ fields: ['key'] }],
            now
        ),
        users: new SocialMemoryModel(
            accounts.map(a => ({ _id: a.id, isGuest: !!a.guest })),
            [],
            now
        ),
        reports: m(),
        sanctions: m(),
        clubs: new SocialMemoryModel([], [{ fields: ['_id'] }, { fields: ['code'] }], now),
        members: m(),
        weeks: m(),
        wins: m(),
        claims: m(),
        kudos: m(),
        months: m(),
        owned: new SocialMemoryModel([], [{ fields: ['accountId', 'item'] }], now),
        yarn: m(),
    };
    const bus = new ChatBus();
    const chat = new ChatService(
        models.threads,
        models.messages,
        models.social,
        models.friends,
        models.blocks,
        models.buyers,
        models.users,
        models.reports,
        models.sanctions,
        bus,
        undefined,
        clock
    );
    const social = { social: models.social, cats: undefined, avatarsOf: async () => new Map() };
    const store = { owned: models.owned, yarn: models.yarn };
    const clubs = new ClubsService(
        models.clubs,
        models.members,
        models.weeks,
        models.wins,
        models.claims,
        social as any,
        chat,
        store as any,
        clock
    );
    const rooms = new MemoryRoomStore();
    const kudos = new KudosService(models.kudos, models.months, chat, store as any, rooms as any, clock);
    return { clock, models, chat, clubs, kudos, rooms };
}

/** The error code (and `why`) a promise rejects with, or 'ok'. */
export async function codeOf(p: Promise<unknown>): Promise<string> {
    try {
        await p;
        return 'ok';
    } catch (e: any) {
        const r = e?.getResponse?.() ?? e?.response ?? {};
        return r.why ? `${r.code}:${r.why}` : r.code ?? String(e);
    }
}
