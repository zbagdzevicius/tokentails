import { CHAT_LIMITS } from '../../shared-contracts/chat';

/*
 * Chat rate limits (CHAT-AVATARS.md §2.5, §2.6), in memory: per sender (5 in 10 s, 20 a minute, 400 text and 1,000
 * quick a day), per thread (30 a minute, both sides), duplicates (the same normalised text 3 times in 60 s) and the
 * filter strikes (5 rejections in 10 minutes give a 10-minute text cooldown, stored by the caller). Pure: the clock is
 * passed in. One instance per process; a restart forgets the windows, the daily caps and the cooldown row do not.
 */

export type ChatLimitHit = 'rate' | 'dup' | null;

interface SenderState {
    at: number[];
    day: string;
    text: number;
    quick: number;
    recent: Array<{ text: string; at: number }>;
    strikes: number[];
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class ChatLimiter {
    private readonly senders = new Map<string, SenderState>();
    private readonly threads = new Map<string, number[]>();

    constructor(private readonly max = 50_000) {}

    private sender(id: string, now: number): SenderState {
        let s = this.senders.get(id);
        const day = utcDay(now);
        if (!s) {
            if (this.senders.size >= this.max) this.prune(now);
            s = { at: [], day, text: 0, quick: 0, recent: [], strikes: [] };
            this.senders.set(id, s);
        }
        if (s.day !== day) {
            s.day = day;
            s.text = 0;
            s.quick = 0;
        }
        return s;
    }

    private prune(now: number) {
        for (const [k, s] of this.senders)
            if (!s.at.length || now - s.at[s.at.length - 1] > 60_000) this.senders.delete(k);
        for (const [k, t] of this.threads) if (!t.length || now - t[t.length - 1] > 60_000) this.threads.delete(k);
    }

    /** Checks and, when allowed, counts one message. `text` is the normalised text (k = 't'), else undefined. */
    take(sender: string, thread: string, now: number, text?: string): ChatLimitHit {
        const s = this.sender(sender, now);
        s.at = s.at.filter(t => now - t < 60_000);
        const burst = s.at.filter(t => now - t < CHAT_LIMITS.burstMs).length;
        if (burst >= CHAT_LIMITS.burst || s.at.length >= CHAT_LIMITS.perMinute) return 'rate';
        if (text !== undefined ? s.text >= CHAT_LIMITS.textPerDay : s.quick >= CHAT_LIMITS.quickPerDay) return 'rate';
        const t = (this.threads.get(thread) ?? []).filter(x => now - x < 60_000);
        if (t.length >= CHAT_LIMITS.threadPerMinute) return 'rate';
        if (text !== undefined) {
            const key = text.toLowerCase();
            s.recent = s.recent.filter(r => now - r.at < CHAT_LIMITS.dupMs);
            if (s.recent.filter(r => r.text === key).length >= CHAT_LIMITS.dupMax) return 'dup';
            s.recent.push({ text: key, at: now });
            s.text += 1;
        } else s.quick += 1;
        s.at.push(now);
        t.push(now);
        this.threads.set(thread, t);
        return null;
    }

    /** One filter rejection; true when it starts a cooldown (5 in 10 minutes). */
    strike(sender: string, now: number): boolean {
        const s = this.sender(sender, now);
        s.strikes = s.strikes.filter(t => now - t < CHAT_LIMITS.strikeWindowMs);
        s.strikes.push(now);
        if (s.strikes.length >= CHAT_LIMITS.strikes) {
            s.strikes = [];
            return true;
        }
        return false;
    }
}
