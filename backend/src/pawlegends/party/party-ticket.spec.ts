import * as crypto from 'crypto';
import { PARTY_TICKET_TTL_S, PartyTicketService } from './party-ticket.service';
import { PawlegendsController } from '../pawlegends.controller';

/* Party play P2 (MULTIPLAYER.md §5.2, §12 P2): party tickets. */

const SECRET = 'spec-secret-0123456789abcdef';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (body: string, key = SECRET) => crypto.createHmac('sha256', key).update(body).digest('base64url');
const payloadOf = (ticket: string) => JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'));

describe('PartyTicketService (P2)', () => {
    const old = process.env.PAWLEGENDS_PARTY_TICKET_SECRET;
    beforeEach(() => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET;
        delete process.env.PAWLEGENDS_PARTY_TICKET_KID;
    });
    afterAll(() => {
        if (old === undefined) delete process.env.PAWLEGENDS_PARTY_TICKET_SECRET;
        else process.env.PAWLEGENDS_PARTY_TICKET_SECRET = old;
    });

    it('issues guest and signed-in tickets that verify to their identity', () => {
        const s = new PartyTicketService();
        const now = 1_700_000_000_000;
        const signed = s.issue({ accountId: 'u1', guest: false }, now);
        const guest = s.issue({ accountId: 'g1', guest: true }, now);
        expect(signed.expiresIn).toBe(60);
        expect(s.verify(signed.ticket, now)).toEqual({ accountId: 'u1', guest: false });
        expect(s.verify(guest.ticket, now)).toEqual({ accountId: 'g1', guest: true });
        expect(payloadOf(signed.ticket)).toMatchObject({ aud: 'pl-party', v: 1, kid: 'k1', boot: s.boot });
    });

    it('is single use', () => {
        const s = new PartyTicketService();
        const { ticket } = s.issue({ accountId: 'u1', guest: false });
        expect(s.verify(ticket)).not.toBeNull();
        expect(s.verify(ticket)).toBeNull();
    });

    it('expires after 60 s', () => {
        const s = new PartyTicketService();
        const now = 1_700_000_000_000;
        const { ticket } = s.issue({ accountId: 'u1', guest: false }, now);
        expect(s.verify(ticket, now + (PARTY_TICKET_TTL_S + 1) * 1000)).toBeNull();
        const t2 = s.issue({ accountId: 'u1', guest: false }, now).ticket;
        expect(s.verify(t2, now + (PARTY_TICKET_TTL_S - 1) * 1000)).not.toBeNull();
    });

    it('refuses a tampered payload, a wrong aud, another boot, another kid and a foreign key', () => {
        const s = new PartyTicketService();
        const { ticket } = s.issue({ accountId: 'u1', guest: false });
        const p = payloadOf(ticket);
        const [, mac] = ticket.split('.');
        // tampered: a different account under the old mac
        expect(s.verify(`${b64({ ...p, accountId: 'admin' })}.${mac}`)).toBeNull();
        // re-signed correctly, but wrong fields
        const forge = (o: Record<string, unknown>, key?: string) => {
            const body = b64({ ...p, nonce: crypto.randomBytes(6).toString('hex'), ...o });
            return `${body}.${sign(body, key)}`;
        };
        expect(s.verify(forge({}))).not.toBeNull();
        expect(s.verify(forge({ aud: 'other' }))).toBeNull();
        expect(s.verify(forge({ v: 2 }))).toBeNull();
        expect(s.verify(forge({ boot: 'a-previous-boot' }))).toBeNull();
        expect(s.verify(forge({ kid: 'k2' }))).toBeNull();
        expect(s.verify(forge({}, 'another-secret-0123456789'))).toBeNull();
        expect(s.verify(forge({ accountId: '' }))).toBeNull();
        expect(s.verify(forge({ guest: 'yes' }))).toBeNull();
        // garbage
        for (const bad of [undefined, 42, '', 'x', 'a.b', `${'a'.repeat(600)}.b`, `${b64('x')}.`])
            expect(s.verify(bad)).toBeNull();
    });

    it('a restart (a new boot) kills old tickets', () => {
        const a = new PartyTicketService();
        const b = new PartyTicketService();
        expect(b.verify(a.issue({ accountId: 'u1', guest: false }).ticket)).toBeNull();
    });

    it('compares macs with timingSafeEqual', () => {
        const spy = jest.spyOn(crypto, 'timingSafeEqual');
        const s = new PartyTicketService();
        s.verify(s.issue({ accountId: 'u1', guest: false }).ticket);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('without the secret: issue is 503 PAWLEGENDS_PARTY_TICKET_UNAVAILABLE and no ticket is ever trusted', () => {
        const s = new PartyTicketService();
        const { ticket } = s.issue({ accountId: 'u1', guest: false });
        delete process.env.PAWLEGENDS_PARTY_TICKET_SECRET;
        expect(s.available).toBe(false);
        expect(s.verify(ticket)).toBeNull();
        try {
            s.issue({ accountId: 'u1', guest: false });
            throw new Error('expected 503');
        } catch (e: any) {
            expect(e.getStatus()).toBe(503);
            expect(e.getResponse().code).toBe('PAWLEGENDS_PARTY_TICKET_UNAVAILABLE');
        }
        // an unsigned (or self-signed with the empty key) ticket is never trusted
        const body = b64({
            aud: 'pl-party',
            v: 1,
            kid: 'k1',
            boot: s.boot,
            accountId: 'u1',
            guest: false,
            exp: 9e9,
            nonce: 'n',
        });
        expect(s.verify(`${body}.${sign(body, '')}`)).toBeNull();
    });

    it('a short secret counts as missing', () => {
        process.env.PAWLEGENDS_PARTY_TICKET_SECRET = 'short';
        expect(new PartyTicketService().available).toBe(false);
    });
});

describe('POST /pawlegends/party/ticket (P2)', () => {
    const controller = (tickets?: PartyTicketService) => {
        const throttler = { consume: jest.fn().mockResolvedValue(undefined) };
        const c = Object.create(PawlegendsController.prototype) as PawlegendsController;
        Object.assign(c as any, { ipThrottler: throttler, partyTickets: tickets });
        return { c, throttler };
    };
    beforeEach(() => (process.env.PAWLEGENDS_PARTY_TICKET_SECRET = SECRET));

    it('mints a ticket for a signed-in account and for a guest, throttled 30 per 10 min per IP', async () => {
        const tickets = new PartyTicketService();
        const { c, throttler } = controller(tickets);
        const signed = await c.partyTicket({ user: { _id: 'u1' } }, {});
        expect(tickets.verify(signed.ticket)).toEqual({ accountId: 'u1', guest: false });
        const guest = await c.partyTicket({ user: { _id: 'g1', isGuest: true } }, {});
        expect(tickets.verify(guest.ticket)).toEqual({ accountId: 'g1', guest: true });
        expect(throttler.consume).toHaveBeenCalledWith(
            'PawlegendsController.partyTicket',
            expect.anything(),
            { limit: 30, ttl: 10 * 60 * 1000 },
            expect.anything()
        );
    });

    it('throttled: the throttler error propagates', async () => {
        const { c, throttler } = controller(new PartyTicketService());
        throttler.consume.mockRejectedValueOnce(new Error('429'));
        await expect(c.partyTicket({ user: { _id: 'u1' } }, {})).rejects.toThrow('429');
    });

    it('503 without the secret', async () => {
        delete process.env.PAWLEGENDS_PARTY_TICKET_SECRET;
        const { c } = controller(new PartyTicketService());
        await expect(c.partyTicket({ user: { _id: 'u1' } }, {})).rejects.toMatchObject({ status: 503 });
    });
});
