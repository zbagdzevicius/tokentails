import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { MmBridge, type MmHookFactory, type MmHooks, type MmRelayApi } from './mm-bridge';
import { MongoMmRoomStore, PawlegendsMmRoom, PawlegendsMmRoomSchema } from './mm-room.schema';
import { User } from '../../user/user.schema';
import { MmRatingReader, PawlegendsRating, PawlegendsRatingSchema } from './rating.schema';
import { PawlegendsBoard, PawlegendsSanction } from '../social/social.schema';
import { SanctionReader } from './sanction-reader';
import { RankedStatusService } from '../ranked/status';
import { rankedJoinSource } from '../ranked/ranked-join';
import type { RankedJoinSource } from './mm-bridge';

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
    readonly sanctions: SanctionReader;
    /** Ranked's join checks: the liquidity gate, saved matches, unsettled ranked rooms (SOCIAL-RANKED.md §7). */
    readonly ranked: RankedJoinSource;

    constructor(
        @Optional() @InjectModel(PawlegendsRating.name) private readonly ratingModel?: Model<PawlegendsRating>,
        @Optional() @InjectModel(PawlegendsMmRoom.name) mmRoomModel?: Model<PawlegendsMmRoom>,
        // the casual newbie lock and seed read the account's saved matches (server records, never the client hint)
        @Optional() @InjectModel(User.name) userModel?: Model<User>,
        // the boards `/live` writes (SOCIAL-RANKED.md §6.1) and the sanctions `/live` and `mm.join` read
        @Optional() @InjectModel(PawlegendsBoard.name) private readonly boardModel?: Model<PawlegendsBoard>,
        @Optional() @InjectModel(PawlegendsSanction.name) private readonly sanctionModel?: Model<PawlegendsSanction>,
        // the ranked liquidity gate (ranked/status.ts): `mm.join ranked` is refused while it is closed
        @Optional() rankedStatus?: RankedStatusService
    ) {
        this.rooms = new MongoMmRoomStore(mmRoomModel);
        this.reader = new MmRatingReader(ratingModel ?? null, Date.now, userModel ?? null);
        this.sanctions = new SanctionReader(sanctionModel ?? null);
        this.ranked = rankedJoinSource({
            gate: rankedStatus ?? null,
            played: acct => this.reader.played(acct),
            rooms: (mmRoomModel as never) ?? null,
            ratings: (ratingModel as never) ?? null,
        });
    }

    hooks(api: MmRelayApi): MmHooks {
        return new MmBridge(api, {
            rooms: this.rooms,
            ratings: this.reader,
            sanctions: this.sanctions,
            ranked: this.ranked,
        });
    }

    /** The `/live` side (savePawlegendsPartyMatch): the mm room records and the rating model it writes. */
    liveDeps():
        | {
              rooms: MongoMmRoomStore;
              ratings: Model<PawlegendsRating>;
              boards?: Model<PawlegendsBoard>;
              sanctions?: Model<PawlegendsSanction>;
          }
        | undefined {
        return this.ratingModel
            ? { rooms: this.rooms, ratings: this.ratingModel, boards: this.boardModel, sanctions: this.sanctionModel }
            : undefined;
    }
}
