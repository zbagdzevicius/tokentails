import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/*
 * Party tickets (MULTIPLAYER.md §5.2): a short-lived, single-use HMAC token that tells the relay who a socket is,
 * minted by `POST /pawlegends/party/ticket` for the caller of an authenticated (or guest) request. The ticket travels
 * inside `hello`, never in a URL. Keyed by PAWLEGENDS_PARTY_TICKET_SECRET (never logged); without it the endpoint
 * answers 503 and the relay treats every ticket as absent: rooms are unscored, nothing else is disabled (D9).
 *
 * Token: base64url(payload) + '.' + base64url(hmac). Payload: {aud:'pl-party', v:1, kid, boot, accountId, guest, iat,
 * exp, nonce}. The minting process and the verifying one differ when the API and the relay run apart (Google Cloud:
 * tt-api mints, the relay VM verifies; DigitalOcean: either of two instances), so a ticket is not bound to the
 * verifier's boot id. Instead a ticket issued before the verifier started (`iat` older than its start, minus
 * `PARTY_TICKET_CLOCK_SKEW_S`) is refused: the nonce memory (single use, kept until expiry) is per process, so a
 * ticket spent before a restart must not verify again after it. `boot` stays in the payload for logs only.
 */

export const PARTY_TICKET_TTL_S = 60;
export const PARTY_TICKET_AUD = 'pl-party';
/** Clock skew allowed between the minting and the verifying host (both NTP-synced). */
export const PARTY_TICKET_CLOCK_SKEW_S = 2;

export interface PartyIdentity {
    accountId: string;
    guest: boolean;
}

interface Payload extends PartyIdentity {
    aud: string;
    v: number;
    kid: string;
    boot: string;
    iat: number;
    exp: number;
    nonce: string;
}

const b64 = (b: Buffer) => b.toString('base64url');

@Injectable()
export class PartyTicketService {
    /** This process's boot id (also the room lease owner). */
    readonly boot = randomBytes(12).toString('hex');
    /** When this process started: tickets issued earlier may already be spent here, so they are refused. */
    readonly startedAtMs = Date.now();
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
            iat: Math.floor(nowMs / 1000),
            exp: Math.floor(nowMs / 1000) + PARTY_TICKET_TTL_S,
            nonce: randomBytes(12).toString('hex'),
        };
        const body = b64(Buffer.from(JSON.stringify(payload)));
        const mac = b64(createHmac('sha256', s.key).update(body).digest());
        return { ticket: `${body}.${mac}`, expiresIn: PARTY_TICKET_TTL_S };
    }

    /** The identity of a valid, unused, unexpired ticket issued since this process started; null otherwise. */
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
        if (p.aud !== PARTY_TICKET_AUD || p.v !== 1 || p.kid !== s.kid) return null;
        if (typeof p.exp !== 'number' || p.exp * 1000 < nowMs) return null;
        if (typeof p.iat !== 'number' || (p.iat + PARTY_TICKET_CLOCK_SKEW_S) * 1000 < this.startedAtMs) return null;
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
