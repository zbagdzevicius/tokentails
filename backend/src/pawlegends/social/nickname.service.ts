import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PawlegendsYarn, PawlegendsYarnLog } from '../pawlegends.schema';
import { displayNames } from './display-name';
import { checkNick, NAME_CHANGE, NAME_ERRORS } from './nickname';
import { SocialService } from './social.service';
import { serverTrack } from '../analytics/analytics-sink';

/*
 * The nickname change (nickname.ts has the rules and the price). Server-authoritative and safe against double taps and
 * races without a transaction:
 *   1. a paid change claims its ledger row first (`pawlegendsyarnlog`, unique per account and `name:<n>`), so two
 *      concurrent paid changes cannot both pass;
 *   2. the Yarn is spent with one conditional update (`balance >= price`);
 *   3. the profile is written with one compare-and-set on `nameChanges`, and the unique `nickKey` index decides who
 *      gets a name two players ask for at once.
 * Any refusal after step 2 gives the Yarn back and removes the claim. The old name goes to `nameHistory` (moderators).
 */

type AnyModel = any;
const DAY = 86_400_000;

export interface NameView {
    /** The name every other player sees now. */
    name: string;
    /** The player's own nickname (null until the first change). */
    nick: string | null;
    changes: number;
    /** The next change is free (the first one, or one a moderator gave back). */
    free: boolean;
    /** What the next change costs in Yarn (0 when free). */
    price: number;
    /** The paid price (for "later changes cost …"). */
    cost: number;
    cooldownDays: number;
    /** Epoch ms when the next change is allowed, or null when it is allowed now. */
    nextAt: number | null;
    /** The Yarn balance. */
    yarn: number;
}

@Injectable()
export class NicknameService {
    constructor(
        private readonly socialSvc: SocialService,
        @InjectModel(PawlegendsYarn.name) private readonly yarn: AnyModel,
        @InjectModel(PawlegendsYarnLog.name) private readonly yarnLog: AnyModel,
        @Optional() private readonly clock?: { now(): Date }
    ) {}

    private now(): number {
        return (this.clock?.now() ?? new Date()).getTime();
    }

    private async shownName(me: string): Promise<string> {
        const names = await displayNames({ social: this.socialSvc.social, cats: this.socialSvc.cats ?? null }, [me]);
        return names.get(me) ?? '';
    }

    async view(me: string): Promise<NameView> {
        const p = (await this.socialSvc.profile(me)) as any;
        const [name, y] = await Promise.all([this.shownName(me), this.yarn.findOne({ _id: me }).lean()]);
        const changes = Number(p.nameChanges) || 0;
        const free = changes === 0 || !!p.nameFree;
        const last = p.nameChangedAt ? new Date(p.nameChangedAt).getTime() : 0;
        const next = !free && last ? last + NAME_CHANGE.cooldownDays * DAY : 0;
        return {
            name,
            nick: typeof p.nick === 'string' ? p.nick : null,
            changes,
            free,
            price: free ? 0 : NAME_CHANGE.yarn,
            cost: NAME_CHANGE.yarn,
            cooldownDays: NAME_CHANGE.cooldownDays,
            nextAt: next > this.now() ? next : null,
            yarn: Math.max(0, Number((y as any)?.balance) || 0),
        };
    }

    async change(me: string, body: { name?: unknown }): Promise<NameView & { paid: number }> {
        const c = checkNick(body?.name);
        if (!c.ok) throw NAME_ERRORS.invalid(c.code, c.message);
        const p = (await this.socialSvc.profile(me)) as any;
        if (p.nick === c.name && p.name?.kind === 'nick') throw NAME_ERRORS.same();
        const owner = await this.socialSvc.social.findOne({ nickKey: c.key }).select({ _id: 1 }).lean();
        if (owner && String(owner._id) !== me) throw NAME_ERRORS.taken();
        const changes = Number(p.nameChanges) || 0;
        const free = changes === 0 || !!p.nameFree;
        const now = this.now();
        if (!free && p.nameChangedAt) {
            const next = new Date(p.nameChangedAt).getTime() + NAME_CHANGE.cooldownDays * DAY;
            if (now < next) throw NAME_ERRORS.cooldown(next);
        }
        const price = free ? 0 : NAME_CHANGE.yarn;
        const ref = `name:${changes + 1}`;
        if (price > 0) {
            try {
                await this.yarnLog.create({ accountId: me, ref, amount: -price });
            } catch (error) {
                if ((error as { code?: unknown })?.code === 11000) throw NAME_ERRORS.busy();
                throw error;
            }
            const spent = await this.yarn
                .findOneAndUpdate({ _id: me, balance: { $gte: price } }, { $inc: { balance: -price } }, { new: true })
                .lean();
            if (!spent) {
                await this.yarnLog.deleteOne({ accountId: me, ref });
                throw NAME_ERRORS.yarn();
            }
        }
        const refund = async () => {
            if (price <= 0) return;
            await this.yarn.updateOne({ _id: me }, { $inc: { balance: price } });
            await this.yarnLog.deleteOne({ accountId: me, ref });
        };
        const old = await this.shownName(me);
        const history = [
            ...(Array.isArray(p.nameHistory) ? p.nameHistory : []),
            { name: old, kind: p.name?.kind ?? 'generated', at: new Date(now), paid: price },
        ].slice(-NAME_CHANGE.historyMax);
        let res: { matchedCount?: number; modifiedCount?: number };
        try {
            res = await this.socialSvc.social.updateOne(
                { _id: me, nameChanges: changes === 0 ? { $not: { $gt: 0 } } : changes },
                {
                    $set: {
                        nick: c.name,
                        nickKey: c.key,
                        name: { kind: 'nick' },
                        nameChanges: changes + 1,
                        nameChangedAt: new Date(now),
                        nameHistory: history,
                        nameFree: false,
                    },
                    $inc: { rev: 1 },
                }
            );
        } catch (error) {
            await refund();
            if ((error as { code?: unknown })?.code === 11000) throw NAME_ERRORS.taken();
            throw error;
        }
        if (!res?.matchedCount) {
            await refund();
            throw NAME_ERRORS.changed();
        }
        if (price > 0) {
            await this.yarnLog.updateOne({ accountId: me, ref }, { $set: { done: true } }).catch(() => null);
            serverTrack(me, 'yarn_spent', { reason: 'name_change', amount: price }, ref);
        }
        return { ...(await this.view(me)), paid: price };
    }
}

/**
 * Moderation (`name_reset`, report.service.ts): the nickname goes back to the generated name, its key is freed and the
 * next change is free with no cooldown. The old nickname stays in `nameHistory`. False when there was no nickname.
 */
export async function resetNickname(social: AnyModel, accountId: string, now: Date): Promise<boolean> {
    const p = (await social.findOne({ _id: accountId }).lean()) as any;
    if (!p?.nick) return false;
    const history = [
        ...(Array.isArray(p.nameHistory) ? p.nameHistory : []),
        { name: p.nick, kind: 'nick', at: now, paid: 0, reset: true },
    ].slice(-NAME_CHANGE.historyMax);
    await social.updateOne(
        { _id: accountId },
        {
            $set: { name: { kind: 'generated' }, nameFree: true, nameHistory: history },
            $unset: { nick: 1, nickKey: 1 },
            $inc: { rev: 1 },
        }
    );
    return true;
}
