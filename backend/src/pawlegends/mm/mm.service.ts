import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MmBridge, type MmHookFactory, type MmHooks, type MmRelayApi } from './mm-bridge';
import { MongoMmRoomStore, PawlegendsMmRoom, PawlegendsMmRoomSchema } from './mm-room.schema';
import { User } from '../../user/user.schema';
import { MmRatingReader, PawlegendsRating, PawlegendsRatingSchema } from './rating.schema';

/*
 * Nest wiring of Quick Play (docs/plans/moba/M1A-IMPL.md §5.3): the mm room store and the rating reader for the relay
 * glue, and the `/live` dependencies for the one rating writer (pawlegends-party-live.ts). No env var, no flag: the
 * queue is always on; without PAWLEGENDS_PARTY_TICKET_SECRET its rooms are unscored like any party room.
 */
export const PAWLEGENDS_MM_SCHEMAS = [
    { name: PawlegendsRating.name, schema: PawlegendsRatingSchema },
    { name: PawlegendsMmRoom.name, schema: PawlegendsMmRoomSchema },
];

@Injectable()
export class MmService implements MmHookFactory {
    readonly rooms: MongoMmRoomStore;
    readonly reader: MmRatingReader;

    constructor(
        @Optional() @InjectModel(PawlegendsRating.name) private readonly ratingModel?: Model<PawlegendsRating>,
        @Optional() @InjectModel(PawlegendsMmRoom.name) mmRoomModel?: Model<PawlegendsMmRoom>,
        // the casual newbie lock and seed read the account's saved matches (server records, never the client hint)
        @Optional() @InjectModel(User.name) userModel?: Model<User>
    ) {
        this.rooms = new MongoMmRoomStore(mmRoomModel);
        this.reader = new MmRatingReader(ratingModel ?? null, Date.now, userModel ?? null);
    }

    hooks(api: MmRelayApi): MmHooks {
        return new MmBridge(api, { rooms: this.rooms, ratings: this.reader });
    }

    /** The `/live` side (savePawlegendsPartyMatch): the mm room records and the rating model it writes. */
    liveDeps(): { rooms: MongoMmRoomStore; ratings: Model<PawlegendsRating> } | undefined {
        return this.ratingModel ? { rooms: this.rooms, ratings: this.ratingModel } : undefined;
    }
}
