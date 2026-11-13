import { createHash } from 'crypto';
import { pairId } from './social.contracts';

/*
 * Chat thread ids (CHAT-AVATARS.md §3.1): opaque and stable, never an account id, so a client that sees a thread id
 * learns nothing about who is in it. Pure: the API (chat.service.ts) and the relay (party.service.ts) share them.
 */

const hash = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 22);

/** The DM thread of a pair of accounts. */
export const dmThreadId = (a: string, b: string): string => `d${hash(`dm|${pairId(a, b)}`)}`;

/** The party thread of one party lifetime (its relay id is random per party, so a new party is a new thread). */
export const partyThreadId = (partyId: string): string => `p${hash(`party|${partyId}`)}`;

/** A club's chat thread (CLUBS-KUDOS.md): one per club lifetime, members kept in sync on join and leave. */
export const clubThreadId = (clubId: string): string => `c${hash(`club|${clubId}`)}`;

export const THREAD_ID_RE = /^[dpc][A-Za-z0-9_-]{22}$/;
export const MESSAGE_ID_RE = /^[a-f0-9]{24}$/;
