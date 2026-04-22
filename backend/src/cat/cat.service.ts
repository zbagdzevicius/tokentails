import { Controller } from '@nestjs/common';
import { Types } from 'mongoose';
import { ICat, Tier } from 'src/cat/cat.schema';
import { UserRepository } from 'src/user/user.repository';
import { IUser } from 'src/user/user.schema';
import { CatRepository } from './cat.repository';
import { PackType } from 'src/web3/order.schema';
import { BlessingRepository } from 'src/blessing/blessing.repository';
import { BlessingStatus } from 'src/blessing/blessing.schema';
import { ImageRepository } from 'src/image/image.repository';
import { generateCat } from 'src/shared/utils/ai.utils';
import { generateAvatarFromImage } from 'src/shared/utils/ai-avatar';
import { generateRandomNumber } from 'src/user/user.service';

const SHELTER_ID = '69a0008f83f121409ebfed1e';

@Controller('cat')
export class CatService {
    constructor(
        private repository: CatRepository,
        private userRepository: UserRepository,
        private blessingRepository: BlessingRepository,
        private imageRepository: ImageRepository
    ) {}

    private async createCatToTheOwner(catToAdopt: ICat, user: IUser, tier?: Tier, packType?: PackType): Promise<ICat> {
        const catToCreate = {
            ...catToAdopt,
            _id: new Types.ObjectId(),
            owner: user._id,
            packed: true,
            isBlueprint: false,
            tier: tier || Tier.COMMON,
            createdAt: new Date(),
            packType: packType,
        };
        const cat = await this.repository.create(catToCreate);

        return this.addCatToTheOwner(cat, user);
    }

    async addCatToTheOwner(catToAdopt: ICat, user: IUser): Promise<ICat> {
        await this.userRepository.update(user._id!, {
            $push: { cats: { $each: [catToAdopt._id], $position: 0 } },
        });
        await this.repository.update(catToAdopt._id!, {
            $set: { owner: new Types.ObjectId(user._id) },
        });

        return this.getCat(catToAdopt._id!.toString());
    }

    async getCat(id: string): Promise<ICat> {
        return await this.repository.findOne({
            searchObject: { _id: id },
            populate: [
                {
                    path: 'blessing',
                    populate: [
                        { path: 'image', select: 'url' },
                        { path: 'catAvatar', select: 'url' },
                    ],
                },
                { path: 'shelter', select: 'country name image', populate: [{ path: 'image', select: 'url' }] },
            ],
        });
    }

    async adopt(
        _id: string | Types.ObjectId,
        userId: string,
        tier?: Tier,
        packType?: PackType
    ): Promise<{ success: boolean; message: string; cat?: ICat }> {
        const catToAdopt = await this.repository.findOne({
            searchObject: { _id: new Types.ObjectId(_id) },
        });
        const user = await this.userRepository.findOne({
            searchObject: { _id: userId },
            projection: 'cats',
            populate: [{ path: 'cats', select: '_id' }],
        });
        if (!catToAdopt || !user) {
            return { success: false, message: 'Entities can not be found' };
        }
        if ((user.cats as unknown as ICat[])?.find(cat => cat.name === catToAdopt.name)) {
            return { success: false, message: 'User already owns this NFT cat' };
        }

        try {
            const cat = await this.createCatToTheOwner(catToAdopt, user, tier, packType);
            return { success: true, message: 'Congratz on your new cat!', cat };
        } catch (e) {
            console.error(e);
            return { success: false, message: 'Something went wrong, please try again later' };
        }
    }

    async createBlessingWithCat(userId: string, imgUrl: string) {
        const name = `My Pet`;
        const image = await this.imageRepository.create({
            url: imgUrl,
            name,
            createdAt: new Date(),
        });

        const generatedCatNFT = await generateCat(name, imgUrl);
        if (!generatedCatNFT) {
            throw new Error('Failed to generate cat');
        }

        const catAvatar = await generateAvatarFromImage(imgUrl, generatedCatNFT.type);
        if (!catAvatar) {
            throw new Error('Failed to generate cat avatar');
        }

        const catAvatarImage = await this.imageRepository.create({
            url: catAvatar,
            name,
            createdAt: new Date(),
        });

        const blessingId = new Types.ObjectId();
        const catId = new Types.ObjectId();
        const userObjectId = new Types.ObjectId(userId);

        const cat = await this.repository.create({
            ...generatedCatNFT,
            tier: Tier.RARE,
            blessing: blessingId,
            shelter: new Types.ObjectId(SHELTER_ID),
            _id: catId,
            owner: userObjectId,
            status: { EAT: 0 },
            isBlueprint: false,
            createdAt: new Date(),
            tokenId: generateRandomNumber(),
        });

        const user = await this.userRepository.findOne({
            searchObject: { _id: userId },
        });
        await this.addCatToTheOwner(cat, user);

        const blessing = await this.blessingRepository.create({
            name: generatedCatNFT.name,
            description: generatedCatNFT.resqueStory,
            status: BlessingStatus.ADOPTED,
            image: new Types.ObjectId(image._id),
            catAvatar: new Types.ObjectId(catAvatarImage._id),
            shelter: new Types.ObjectId(SHELTER_ID),
            cat: catId,
            creator: userObjectId,
            _id: blessingId,
            createdAt: new Date(),
        });

        return blessing;
    }
}
