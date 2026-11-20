import { createHash } from 'crypto';
import { CAT_NAME_MAX_LENGTH, foldCatName, normalizeCatName } from '../../shared-contracts/name';
import { memberName } from '../party/party-names';
import { NICK_RESERVED } from './nickname';

/*
 * Every registered account has a nickname (founder, Nov 20: "nicknames must be unique and represent the actual
 * username"; SOCIAL-RANKED.md §2.3). A player who never picked one gets one assigned: the name they already showed (a
 * cat name or the generated name) when nobody holds it, else that name with a number ("Scout2"). The assignment is a
 * compare-and-set on "no nickname yet" and the unique `nickKey` index decides between two accounts that want the same
 * name, so it is safe to run on any instance at any time. An assigned name is a real nickname: friends add it, boards
 * show it, and the player's first own change stays free (`nameChanges` is untouched).
 *
 * `nickNotice` tells the player once, in game, that the name they had was not kept and that they can pick their own:
 *   - `taken`: another (older) account already had that name;
 *   - `invalid`: the old name cannot be a nickname (too long, a reserved word, symbols);
 *   - `reset`: a moderator reset the nickname.
 * New accounts get no notice (they never had another name).
 */

type AnyModel = any;

export type NickNoticeKind = 'taken' | 'invalid' | 'reset';
export interface NickNotice {
    kind: NickNoticeKind;
    /** The name the player had (absent for a moderator reset: the old name may be the reason). */
    from?: string;
}

const tidy = (s: string) => s.replace(/[\s'’-]+$/u, '').trim();

/** A valid nickname from `shown`, or null. Tries the name as is, then cut to the nickname length. Pure. */
export function nickFrom(shown: string): string | null {
    for (const raw of [shown, tidy(String(shown ?? '').slice(0, CAT_NAME_MAX_LENGTH))]) {
        const r = normalizeCatName(raw, { reserved: NICK_RESERVED });
        if (r.ok && foldCatName(r.name).length >= 2) return r.name;
    }
    return null;
}

/** The base an assigned nickname starts from: the shown name, else the generated name, else "Paw Pal". Pure. */
export function autoNickBase(shown: string, id: string): string {
    return nickFrom(shown) ?? nickFrom(memberName(id)) ?? 'Paw Pal';
}

const withSuffix = (base: string, suffix: string) =>
    `${tidy(base.slice(0, CAT_NAME_MAX_LENGTH - suffix.length))}${suffix}`;

/**
 * The names tried in order (deterministic): the base, base2 … base99, then 30 four-digit suffixes from a hash of the
 * account id. Every candidate is a valid nickname. Pure.
 */
export function autoNickCandidates(base: string, id: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (c: string) => {
        const ok = normalizeCatName(c, { reserved: NICK_RESERVED });
        if (!ok.ok || ok.name !== c) return;
        const key = foldCatName(c);
        if (key.length < 2 || seen.has(key)) return;
        seen.add(key);
        out.push(c);
    };
    push(base);
    for (let n = 2; n <= 99; n++) push(withSuffix(base, String(n)));
    for (let i = 0; i < 30; i++) {
        const h = createHash('sha256').update(`${id}:${i}`).digest();
        push(withSuffix(base, String(1000 + (h.readUInt32BE(0) % 9000))));
    }
    return out;
}

export interface AssignResult {
    nick: string;
    notice: NickNotice | null;
}

/**
 * Gives `id` a nickname when it has none: the first free candidate from `shown`. `notice: true` records a one-time
 * notice when the name the player showed was not kept. Null when the row already has a nickname (or is gone).
 */
export async function assignAutoNick(
    social: AnyModel,
    id: string,
    shown: string,
    opts: { notice?: boolean | NickNotice } = {}
): Promise<AssignResult | null> {
    const base = autoNickBase(shown, id);
    for (const nick of autoNickCandidates(base, id)) {
        const key = foldCatName(nick);
        const holder = await social.findOne({ nickKey: key }).select({ _id: 1 }).lean();
        if (holder) {
            if (String(holder._id) === id) return null;
            continue;
        }
        let notice: NickNotice | null = null;
        if (opts.notice && typeof opts.notice === 'object') notice = opts.notice;
        else if (opts.notice && nick !== shown) notice = { kind: nickFrom(shown) ? 'taken' : 'invalid', from: shown };
        try {
            const res = await social.updateOne(
                { _id: id, nickKey: { $exists: false } },
                {
                    $set: {
                        nick,
                        nickKey: key,
                        name: { kind: 'nick' },
                        nickAuto: true,
                        ...(notice ? { nickNotice: notice } : {}),
                    },
                    $inc: { rev: 1 },
                }
            );
            if (!res?.matchedCount) return null;
            return { nick, notice };
        } catch (error) {
            // another account took this name between the read and the write: the next candidate
            if ((error as { code?: unknown })?.code === 11000) continue;
            throw error;
        }
    }
    return null;
}
