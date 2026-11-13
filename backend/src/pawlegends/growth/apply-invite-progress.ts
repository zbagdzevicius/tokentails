import { Logger } from '@nestjs/common';
import type { InviteMatch } from './growth.rules';

/*
 * The `/live` save's one invite line (docs/plans/moba/GROWTH.md): called after the save's Game row exists, so a
 * duplicate save never counts twice (the invite also keeps the save's ref). Never fails the save.
 */

export interface InviteProgressDep {
    progress(userId: string, match: InviteMatch, now?: Date): Promise<unknown>;
}

const logger = new Logger('PawlegendsInvites');

export async function applyInviteProgress(
    growth: InviteProgressDep | null | undefined,
    userId: string,
    match: InviteMatch,
    now?: Date
): Promise<void> {
    if (!growth) return;
    try {
        await growth.progress(String(userId), match, now);
    } catch (error) {
        logger.warn(`invite progress not counted: ${(error as Error)?.message ?? error}`);
    }
}
