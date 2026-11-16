import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { countryOf, shownFlag, type FlagRow } from './flags';
import { PawlegendsFlag } from './flags.schema';

type AnyModel = any;

/** Reads at most this many rows per call (friends, a board page). */
const MAX_IDS = 200;

/** A relay-side reader (no Nest): the stored row of an account, or null. A read error answers null (no flag). */
export function relayFlagOf(model: AnyModel | null | undefined) {
    return async (accountId: string): Promise<FlagRow | null> => {
        if (!model) return null;
        try {
            return ((await model.findById(accountId).select({ cc: 1, off: 1 }).lean()) as FlagRow | null) ?? null;
        } catch {
            return null;
        }
    };
}

/** The flags others may see for these accounts (hidden and unknown ones are absent). Never fails a caller. */
export async function visibleFlags(
    model: AnyModel | null | undefined,
    ids: readonly string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const want = [...new Set(ids.filter(Boolean))].slice(0, MAX_IDS);
    if (!model || !want.length) return out;
    try {
        const rows = (await model
            .find({ _id: { $in: want } })
            .select({ cc: 1, off: 1 })
            .lean()) as Array<FlagRow & { _id: string }>;
        for (const r of rows) {
            const cc = shownFlag(r);
            if (cc) out.set(String(r._id), cc);
        }
    } catch {
        /* no flags rather than no board */
    }
    return out;
}

/**
 * Country flags (docs/plans/moba/FLAGS.md): `GET /pawlegends/flag` records the country of the request (only the ISO
 * code, from Cloudflare's `cf-ipcountry`) and answers it with the hide choice; `POST /pawlegends/flag {hideFlag}` sets
 * the choice. Guests too.
 */
@Injectable()
export class FlagsService {
    constructor(@Optional() @InjectModel(PawlegendsFlag.name) private readonly flags?: AnyModel) {}

    /** The caller's flag: records a new country (no write when unchanged); `account` null = no row (answer only). */
    async mine(account: string | null, header: unknown): Promise<{ cc: string | null; hideFlag: boolean }> {
        const cc = countryOf(header);
        if (!account || !this.flags) return { cc, hideFlag: false };
        const row = ((await this.flags.findById(account).lean()) as FlagRow | null) ?? null;
        if (cc && row?.cc !== cc)
            await this.flags.updateOne({ _id: account }, { $set: { cc, at: new Date() } }, { upsert: true });
        return { cc: cc ?? countryOf(row?.cc), hideFlag: !!row?.off };
    }

    async setHidden(
        account: string,
        hide: boolean,
        header: unknown
    ): Promise<{ cc: string | null; hideFlag: boolean }> {
        const cc = countryOf(header);
        if (!this.flags) return { cc, hideFlag: hide };
        await this.flags.updateOne(
            { _id: account },
            { $set: { off: hide, at: new Date(), ...(cc ? { cc } : {}) } },
            { upsert: true }
        );
        return { cc, hideFlag: hide };
    }

    visible(ids: readonly string[]): Promise<Map<string, string>> {
        return visibleFlags(this.flags, ids);
    }
}
