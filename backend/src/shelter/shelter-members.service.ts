import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { User, UserDocument } from 'src/user/user.schema';
import { Shelter, ShelterDocument } from './shelter.schema';

/** Most members one shelter can have: they confirm payouts, so the list stays short and reviewed. */
export const SHELTER_MEMBERS_MAX = 20;

export interface ShelterMemberView {
    _id: string;
    name: string;
    emailVerified: boolean;
}

export interface ShelterMembersChange {
    /** User ids or email addresses. */
    add?: string[];
    /** User ids. */
    remove?: string[];
}

/** Token Tails staff: drafts payouts, so may never confirm them as a "shelter member". */
export const isStaff = (user?: { permission?: number } | null) => (user?.permission ?? 0) >= PERMISSION_LEVEL.MANAGER;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Shelter members (plan G4 "Attestation"): the people who may confirm a payout for their shelter.
 * Granted only by an ADMIN through PUT /shelter/:id/members. A member must be a registered account
 * with a verified email; guests and deleted accounts are refused, and so is Token Tails staff
 * (MANAGER and above): a confirmation has to come from the shelter, not from us. Stored as `Shelter.members`, which
 * the public projection never returns.
 */
@Injectable()
export class ShelterMembersService {
    constructor(
        @InjectModel(Shelter.name) private shelterModel: Model<ShelterDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>
    ) {}

    private async shelterOrThrow(shelterId: string) {
        if (!Types.ObjectId.isValid(shelterId)) {
            throw new NotFoundException();
        }
        const shelter: any = await this.shelterModel
            .findOne({ _id: new Types.ObjectId(shelterId) }, { members: 1 })
            .lean();
        if (!shelter) {
            throw new NotFoundException();
        }
        return shelter;
    }

    async list(shelterId: string): Promise<ShelterMemberView[]> {
        const shelter = await this.shelterOrThrow(shelterId);
        return this.views(shelter.members || []);
    }

    private async views(ids: unknown[]): Promise<ShelterMemberView[]> {
        if (!ids.length) {
            return [];
        }
        const users: any[] = await this.userModel
            .find({ _id: { $in: ids.map(id => new Types.ObjectId(String(id))) } }, { name: 1, emailVerifiedAt: 1 })
            .lean();
        const byId = new Map((users || []).map(user => [String(user._id), user]));
        return ids.map(id => {
            const user = byId.get(String(id));
            return { _id: String(id), name: user?.name || '(deleted account)', emailVerified: !!user?.emailVerifiedAt };
        });
    }

    private async resolve(entry: string): Promise<any> {
        const value = String(entry || '').trim();
        const filter =
            Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value)
                ? { _id: new Types.ObjectId(value) }
                : EMAIL.test(value)
                ? { email: value.toLowerCase() }
                : null;
        if (!filter) {
            throw new BadRequestException(`Not a user id or email: ${value.slice(0, 40)}`);
        }
        const user: any = await this.userModel
            .findOne(filter, { _id: 1, isGuest: 1, deletedAt: 1, emailVerifiedAt: 1, mergedInto: 1, permission: 1 })
            .lean();
        if (!user) {
            throw new BadRequestException('No account found for one of the members');
        }
        if (user.isGuest || user.deletedAt || user.mergedInto) {
            throw new BadRequestException('Members must be registered accounts');
        }
        if (!user.emailVerifiedAt) {
            throw new BadRequestException('Members need a verified email');
        }
        if (isStaff(user)) {
            throw new BadRequestException(
                'Token Tails staff (manager or admin) cannot be shelter members: confirmations come from the shelter'
            );
        }
        return user;
    }

    async change(shelterId: string, change: ShelterMembersChange): Promise<ShelterMemberView[]> {
        const add = Array.isArray(change?.add) ? change.add : [];
        const remove = Array.isArray(change?.remove) ? change.remove : [];
        if (!add.length && !remove.length) {
            throw new BadRequestException('Nothing to change: send add or remove');
        }
        if (add.length + remove.length > SHELTER_MEMBERS_MAX * 2) {
            throw new BadRequestException('Too many changes at once');
        }
        await this.shelterOrThrow(shelterId);
        const addIds = [];
        for (const entry of add) {
            addIds.push((await this.resolve(entry))._id);
        }
        const removeIds = remove.map(id => {
            if (!Types.ObjectId.isValid(String(id))) {
                throw new BadRequestException('remove takes user ids');
            }
            return new Types.ObjectId(String(id));
        });
        const _id = new Types.ObjectId(shelterId);
        if (removeIds.length) {
            await this.shelterModel.updateOne({ _id }, { $pull: { members: { $in: removeIds } } });
        }
        if (addIds.length) {
            await this.shelterModel.updateOne({ _id }, { $addToSet: { members: { $each: addIds } } });
        }
        const shelter = await this.shelterOrThrow(shelterId);
        if ((shelter.members || []).length > SHELTER_MEMBERS_MAX) {
            await this.shelterModel.updateOne({ _id }, { $pull: { members: { $in: addIds } } });
            throw new BadRequestException(`A shelter has at most ${SHELTER_MEMBERS_MAX} members`);
        }
        return this.views(shelter.members || []);
    }

    async isMember(shelterId: unknown, userId: unknown): Promise<boolean> {
        if (!Types.ObjectId.isValid(String(shelterId)) || !Types.ObjectId.isValid(String(userId))) {
            return false;
        }
        const found = await this.shelterModel
            .findOne(
                { _id: new Types.ObjectId(String(shelterId)), members: new Types.ObjectId(String(userId)) },
                { _id: 1 }
            )
            .lean();
        return !!found;
    }

    /** Ids of the shelters `userId` is a member of. */
    async sheltersOf(userId: unknown): Promise<Types.ObjectId[]> {
        if (!Types.ObjectId.isValid(String(userId))) {
            return [];
        }
        const rows: any[] = await this.shelterModel
            .find({ members: new Types.ObjectId(String(userId)) }, { _id: 1 })
            .lean();
        return (rows || []).map(row => row._id);
    }
}
