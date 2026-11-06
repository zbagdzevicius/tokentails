import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/*
 * Party tickets (MULTIPLAYER.md §5.2): a short-lived, single-use HMAC token that tells the relay who a socket is,
 * minted by `POST /pawlegends/party/ticket` for the caller of an authenticated (or guest) request. The ticket travels
 * inside `hello`, never in a URL. Keyed by PAWLEGENDS_PARTY_TICKET_SECRET (never logged); without it the endpoint
 * answers 503 and the relay treats every ticket as absent: rooms are unscored, nothing else is disabled (D9).
 *
 * Token: base64url(payload) + '.' + base64url(hmac). Payload: {aud:'pl-party', v:1, kid, boot, accountId, guest, exp,
 * nonce}. `boot` is this instance's boot id (a ticket from before a restart is dead after it); the nonce is kept until
 * expiry (single use).
 */

export const PARTY_TICKET_TTL_S = 60;
export const PARTY_TICKET_AUD = 'pl-party';

export interface PartyIdentity {
    accountId: string;
    guest: boolean;
}

interface Payload extends PartyIdentity {
    aud: string;
    v: number;
    kid: string;
    boot: string;
    exp: number;
    nonce: string;
}

const b64 = (b: Buffer) => b.toString('base64url');

@Injectable()
export class PartyTicketService {
    /** This process's boot id (also the room lease owner). */
    readonly boot = randomBytes(12).toString('hex');
    private readonly used = new Map<string, number>();

    /** The secret, read at call time (tests set it per case); undefined = no trusted tickets. */
    private secret(): { kid: string; key: string } | null {
        const key = process.env.PAWLEGENDS_PARTY_TICKET_SECRET;
        if (!key || key.length < 16) return null;
        return { kid: process.env.PAWLEGENDS_PARTY_TICKET_KID || 'k1', key };
    }

    get available(): boolean {
        return this.secret() !== null;
    }

    issue(identity: PartyIdentity, nowMs = Date.now()): { ticket: string; expiresIn: number } {
        const s = this.secret();
        if (!s) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'PAWLEGENDS_PARTY_TICKET_UNAVAILABLE',
                message: 'Party tickets are not configured',
            });
        }
        const payload: Payload = {
            aud: PARTY_TICKET_AUD,
            v: 1,
            kid: s.kid,
            boot: this.boot,
            accountId: identity.accountId,
            guest: identity.guest,
            exp: Math.floor(nowMs / 1000) + PARTY_TICKET_TTL_S,
            nonce: randomBytes(12).toString('hex'),
        };
        const body = b64(Buffer.from(JSON.stringify(payload)));
        const mac = b64(createHmac('sha256', s.key).update(body).digest());
        return { ticket: `${body}.${mac}`, expiresIn: PARTY_TICKET_TTL_S };
    }

    /** The identity of a valid, unused, unexpired ticket of this boot; null otherwise (never trusted unsigned). */
    verify(ticket: unknown, nowMs = Date.now()): PartyIdentity | null {
        const s = this.secret();
        if (!s || typeof ticket !== 'string' || ticket.length > 512) return null;
        const dot = ticket.indexOf('.');
        if (dot <= 0) return null;
        const body = ticket.slice(0, dot);
        const mac = Buffer.from(ticket.slice(dot + 1), 'base64url');
        const want = createHmac('sha256', s.key).update(body).digest();
        if (mac.length !== want.length || !timingSafeEqual(mac, want)) return null;
        let p: Payload;
        try {
            p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
        } catch {
            return null;
        }
        if (p.aud !== PARTY_TICKET_AUD || p.v !== 1 || p.kid !== s.kid || p.boot !== this.boot) return null;
        if (typeof p.exp !== 'number' || p.exp * 1000 < nowMs) return null;
        if (typeof p.accountId !== 'string' || !p.accountId || typeof p.guest !== 'boolean') return null;
        this.sweep(nowMs);
        if (this.used.has(p.nonce)) return null;
        this.used.set(p.nonce, p.exp * 1000);
        return { accountId: p.accountId, guest: p.guest };
    }

    private sweep(nowMs: number): void {
        if (this.used.size < 1000) return;
        for (const [n, exp] of this.used) if (exp < nowMs) this.used.delete(n);
    }
}
