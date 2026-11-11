/*
 * The relay side of in-match bot chatter (docs/plans/moba/MATCH-CHAT.md §5): one `BotChat` per room that has fill
 * bots and is not ranked, holding the vendored engine (backend/src/vendor/pawlegends-chat). The referee feeds it
 * read-only cues; the relay feeds it human lines and the team tiers; `tick(now)` hands back the lines that are due,
 * which the relay sends through the same `deliverMatchChat` path, filter and per-seat limits as a human's (§5.7).
 *
 * Not checkpointed: a room restored after a live deploy gets no BotChat (its bots stay quiet for the rest of it).
 * `BotSeenStore` keeps each recipient's memory of bot lines (§5.8) in `pawlegendssocial.botSeen` (registered) or in
 * memory for 24 h (guests and accounts without a social row).
 *
 * Relative imports only: the relay role loads it without the `src/` alias.
 */
import { createHash } from 'crypto';
import {
    BotChatter,
    mergeSeen,
    pushSeen,
    type BotSeen,
    type ChatTier,
    type ChatterSetup,
    type Planned,
} from '../../vendor/pawlegends-chat/botChatter';
import { hash32 } from '../../vendor/pawlegends-chat/rng';
import type { BotState, ChatCue } from '../../vendor/pawlegends-chat/cues';
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import { filterChatText, normalizeChatText } from '../../shared-contracts/chat-filter';

export type { Planned as BotLinePlan, BotSeen };

/** A bot seat's own send bucket: the human socket's limits (5 in 10 s, the duplicate rule). */
export class SeatLimiter {
    private at: number[] = [];
    private dups: { text: string; at: number }[] = [];

    allow(now: number, text?: string): boolean {
        this.at = this.at.filter(t => now - t < CHAT_LIMITS.burstMs);
        if (this.at.length >= CHAT_LIMITS.burst) return false;
        if (text !== undefined) {
            const norm = normalizeChatText(text).toLowerCase();
            this.dups = this.dups.filter(d => now - d.at < CHAT_LIMITS.dupMs);
            if (this.dups.filter(d => d.text === norm).length >= CHAT_LIMITS.dupMax) return false;
            this.dups.push({ text: norm, at: now });
        }
        this.at.push(now);
        return true;
    }
}

export interface BotChatOptions {
    room: string;
    /** A per-process secret: the room's chatter seed is hash(room ⊕ salt), never guessable from the room id. */
    salt: string;
    slots: number;
    teamSize: number;
    map?: string;
    humans: readonly number[];
    sides?: readonly ['cat' | 'dog', 'cat' | 'dog'];
    tiers: readonly [ChatTier, ChatTier];
    names?: readonly (string | null)[];
    /** Each team's recipients' memories. */
    seen?: readonly [readonly BotSeen[], readonly BotSeen[]];
    /** Ranked or competitive, an account's first match: no chatter at all. */
    silent?: boolean;
    startMs: number;
}

/** The seed of a room's chatter (§5.1): hash(room id ⊕ server salt). */
export const botChatSeed = (room: string, salt: string): number =>
    hash32(createHash('sha256').update(`${room}\u0000${salt}`).digest('hex'));

export class BotChat {
    readonly chatter: BotChatter;
    private readonly limiters = new Map<number, SeatLimiter>();
    /** Lines the runtime filter refused (an alert, §9). */
    filterRejects = 0;
    endAt = -1;

    constructor(readonly opts: BotChatOptions) {
        const setup: ChatterSetup = {
            seed: botChatSeed(opts.room, opts.salt),
            slots: opts.slots,
            teamSize: opts.teamSize,
            ...(opts.map ? { map: opts.map } : {}),
            humans: opts.humans,
            ...(opts.sides ? { sides: opts.sides } : {}),
            silent: !!opts.silent,
            tiers: opts.tiers,
            ...(opts.names ? { names: opts.names } : {}),
            seen: opts.seen ? [mergeSeen(opts.seen[0]), mergeSeen(opts.seen[1])] : [null, null],
            filter: text => {
                const ok = filterChatText(text).ok;
                if (!ok) this.filterRejects++;
                return ok;
            },
            startMs: opts.startMs,
        };
        this.chatter = new BotChatter(setup);
    }

    cues(cues: readonly ChatCue[], states: readonly BotState[] | undefined, now: number): void {
        if (states?.length) this.chatter.sample(states, now);
        for (const c of cues) this.chatter.observe(c, now);
    }

    human(m: { slot: number; ch: 'team' | 'all'; k: 't' | 'q'; text?: string; id?: number }, now: number): void {
        this.chatter.human(m, now);
    }

    setTiers(tiers: readonly [ChatTier, ChatTier]): void {
        this.chatter.setTier(0, tiers[0]);
        this.chatter.setTier(1, tiers[1]);
    }

    end(winner: 0 | 1, now: number): void {
        if (this.endAt >= 0) return;
        this.endAt = now;
        this.chatter.observe({ k: 'end', winner }, now);
    }

    /** The lines due now, each through its seat's own limiter (a refused one is dropped, never queued). */
    due(now: number): Planned[] {
        const out: Planned[] = [];
        for (const p of this.chatter.due(now)) {
            let lim = this.limiters.get(p.slot);
            if (!lim) this.limiters.set(p.slot, (lim = new SeatLimiter()));
            if (!lim.allow(now, p.k === 't' ? p.text : undefined)) continue;
            out.push(p);
        }
        return out;
    }

    /** The memory update of one team's humans (§5.8). */
    seenBy(team: 0 | 1): { lid: string; surface: string; tok?: string }[] {
        return this.chatter.seenBy(team);
    }

    /** Analytics for `mp_chat_bot` (§9): per team. */
    metrics(): Record<string, string | number | boolean> {
        const s = this.chatter.stats;
        const cats = Object.entries(s.byCat)
            .map(([k, v]) => `${k}:${v}`)
            .join(',');
        const drops = Object.entries(s.drops)
            .map(([k, v]) => `${k}:${v}`)
            .join(',');
        return {
            budget0: s.budget[0],
            budget1: s.budget[1],
            sent0: s.sent[0],
            sent1: s.sent[1],
            cats,
            drops,
            reactions: s.reactions,
            probe: s.probe,
            personas: s.personas.join(','),
            filter_rejects: this.filterRejects,
        };
    }
}

/** A Mongo-ish collection for the `botSeen` rings (pawlegendssocial). */
type SocialModel = {
    find(f: Record<string, unknown>): any;
    updateOne(f: Record<string, unknown>, u: Record<string, unknown>, o?: Record<string, unknown>): any;
};

const MEMORY_MS = 24 * 3600_000;
const MEMORY_MAX = 20_000;

/**
 * Recipients' memories of bot lines (§5.8): registered accounts in `pawlegendssocial.botSeen` (written once per human
 * at match end), guests (and accounts with no social row) in memory for 24 h. Every error answers "no memory".
 */
export class BotSeenStore {
    private readonly mem = new Map<string, { ring: BotSeen; atMs: number }>();

    constructor(private readonly social: SocialModel | null, private readonly now: () => number = () => Date.now()) {}

    private memGet(key: string): BotSeen | null {
        const e = this.mem.get(key);
        if (!e) return null;
        if (this.now() - e.atMs > MEMORY_MS) {
            this.mem.delete(key);
            return null;
        }
        return e.ring;
    }

    private memSet(key: string, ring: BotSeen): void {
        this.mem.delete(key);
        this.mem.set(key, { ring, atMs: this.now() });
        if (this.mem.size > MEMORY_MAX) this.mem.delete(this.mem.keys().next().value as string);
    }

    /** Rings by key: `a:<accountId>` or `g:<guest key hash>`. */
    async load(keys: readonly string[]): Promise<Map<string, BotSeen>> {
        const out = new Map<string, BotSeen>();
        const accounts = keys.filter(k => k.startsWith('a:')).map(k => k.slice(2));
        if (this.social && accounts.length) {
            try {
                const rows = (await this.social
                    .find({ _id: { $in: accounts } })
                    .select({ botSeen: 1 })
                    .lean()) as Array<{ _id: string; botSeen?: BotSeen }>;
                for (const r of rows ?? []) if (r.botSeen) out.set(`a:${r._id}`, r.botSeen);
            } catch {
                /* no memory this match */
            }
        }
        for (const k of keys)
            if (!out.has(k)) {
                const m = this.memGet(k);
                if (m) out.set(k, m);
            }
        return out;
    }

    /** One write per human per match (§5.8). */
    async save(
        key: string,
        prev: BotSeen | null,
        lines: readonly { lid: string; surface: string; tok?: string }[]
    ): Promise<void> {
        if (!lines.length) return;
        const ring = pushSeen(prev, lines);
        this.memSet(key, ring);
        if (!key.startsWith('a:') || !this.social) return;
        try {
            await this.social.updateOne({ _id: key.slice(2) }, { $set: { botSeen: ring } });
        } catch {
            /* memory still has it */
        }
    }
}
