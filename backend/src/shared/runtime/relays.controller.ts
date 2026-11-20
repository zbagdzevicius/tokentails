import { Controller, Get } from '@nestjs/common';
import { PARTY_LIMITS } from '../../pawlegends/party/party-limits';
import { MongoRoomStore, type RelayRow } from '../../pawlegends/party/room-store';

/** A shard's load as a coarse bucket (never exact counts: they would show traffic to anyone). */
export function loadBucket(r: Pick<RelayRow, 'rooms' | 'cap'>): 'low' | 'mid' | 'high' {
    const share = r.cap ? (r.rooms ?? 0) / r.cap : 0;
    return share >= PARTY_LIMITS.redirectLoad ? 'high' : share >= 0.5 ? 'mid' : 'low';
}

/** The public view of the relay shards (no boot ids, no deploy ids, no exact counts). */
export function relaysView(rows: readonly RelayRow[], leaderOwner: string | null, nowMs: number) {
    const shards = rows
        .filter(r => r.shard && r.path && nowMs - new Date(r.heartbeatAt).getTime() <= PARTY_LIMITS.relayDeadMs)
        .map(r => ({
            shard: r.shard as string,
            path: r.path as string,
            state: r.state,
            load: loadBucket(r),
            leader: !!leaderOwner && r._id === leaderOwner,
        }))
        .sort((a, b) => a.shard.localeCompare(b.shard) || Number(b.leader) - Number(a.leader));
    return { shards, leader: shards.find(s => s.leader)?.shard ?? null };
}

/*
 * `GET /pawlegends/relays` (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15): the relay shards that serve now, their paths,
 * state and a load bucket, and which one takes new sessions and the Quick Play queue (the `mm` lease holder). For
 * operations (one curl shows the fleet) and for clients that want to dial a shard directly. No party code lookup on
 * purpose: answering "this code lives on shard b" would let anyone test codes without the relay's join-failure limits;
 * a join that lands on the wrong shard costs one `relay_redirect` instead. Throttled like any API route.
 */
@Controller('pawlegends')
export class RelaysController {
    constructor(private readonly store: MongoRoomStore) {}

    @Get('relays')
    async relays() {
        const nowMs = Date.now();
        const [rows, lease] = await Promise.all([
            this.store.relays(new Date(nowMs - PARTY_LIMITS.relayStaleMs)),
            this.store.leaseOf('mm'),
        ]);
        const live = lease && new Date(lease.expiresAt).getTime() > nowMs ? lease.owner : null;
        return relaysView(rows, live, nowMs);
    }
}
