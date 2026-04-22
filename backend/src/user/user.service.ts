import { Injectable, NotFoundException } from '@nestjs/common';
import { InitDataParsed } from '@telegram-apps/init-data-node';
import { Types } from 'mongoose';
import { CatRepository } from 'src/cat/cat.repository';
import { CatAbilityType, ICat, Tier } from 'src/cat/cat.schema';
import { FirebaseUser } from './strategies/interface/firebase-sdk.interface';
import { UserRepository } from './user.repository';
import { User } from './user.schema';

import * as StellarSdk from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import { Wallet } from 'ethers';
import { EncryptionService } from 'src/shared/encryption.service';

export function generateRandomNumber() {
    const randomNumber = Math.floor(Math.random() * 100000000000) + 100;
    const randomString = randomNumber;
    return randomString;
}

@Injectable()
export class UserService {
    constructor(
        protected repository: UserRepository,
        private catRepository: CatRepository,
        private encryptionService: EncryptionService
    ) {}

    async getFirebaseUser(user: FirebaseUser): Promise<User> {
        const existingUser = await this.repository.findOne({ searchObject: { email: user.email } });
        if (!!existingUser) {
            return existingUser;
        }
        let name = user?.name;
        if (!name) {
            name = user.email?.split('@')?.[0] || 'anonyamous';
        }
        const evm = this.generateWallet();
        const stellar = this.generateStellarWallet();

        const userId = new Types.ObjectId();

        const catId = new Types.ObjectId();
        await this.generateACat(catId, userId);
        return this.repository.create({
            _id: userId,
            name,
            email: user.email,
            canRedeemLives: true,
            wallets: {
                evm,
                stellar,
            },
            cat: catId,
            cats: [catId],
        });
    }

    async getTelegramUser(initData: InitDataParsed): Promise<User> {
        const { user } = initData;
        if (!user) {
            throw new NotFoundException('No getTelegramUser');
        }
        const existingUser = await this.repository.findOne({ searchObject: { telegramId: user?.id.toString() } });
        if (!!existingUser) {
            return existingUser;
        }
        const wallets = this.generateWallets();
        const name = user?.firstName ? `${user?.firstName} ${user?.lastName}` : user?.username;

        const catId = new Types.ObjectId();
        const userId = new Types.ObjectId();
        const createdUser = await this.repository.create({
            _id: userId,
            name,
            telegramUsername: user?.username?.toString() as string,
            telegramId: user.id.toString(),
            canRedeemLives: true,
            cat: catId,
            cats: [catId],
            wallets,
        });
        await this.generateACat(catId, userId);
        return createdUser;
    }

    generateWallets() {
        const evm = this.generateWallet();
        const stellar = this.generateStellarWallet();
        return {
            evm,
            stellar,
        };
    }

    private generateWallet() {
        const id = crypto.randomBytes(32).toString('hex');
        const privateKey = '0x' + id;
        const wallet = new Wallet(privateKey);
        const walletAddress = wallet.address;
        const walletPrivateKey = this.encryptionService.encrypt(privateKey);

        return {
            walletAddress,
            walletPrivateKey,
        };
    }

    private generateStellarWallet() {
        const issuerKeypair = StellarSdk.Keypair.random();

        return {
            walletAddress: issuerKeypair.publicKey(),
            walletPrivateKey: this.encryptionService.encrypt(issuerKeypair.secret()),
        };
    }

    async generateACat(catId: Types.ObjectId = new Types.ObjectId(), userId: Types.ObjectId = new Types.ObjectId()) {
        return await this.catRepository.create({
            _id: catId,
            owner: userId,
            name: 'Cleocatra',
            resqueStory:
                'A charming cat’s tail swishes create rainbows that make everyone smile, even on the rainiest of days.',
            type: CatAbilityType.WATER,
            status: {
                EAT: 0,
            },
            tier: Tier.COMMON,
            spriteImg: 'https://tokentails.com/cats/pinkie/sprites/hearted-red.png',
            catImg: 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com/assets/PINKIE/hearted-red/GROOMING.gif',
            createdAt: new Date(),
            tokenId: generateRandomNumber(),
        });
    }

    async createCat(cat: Partial<ICat>) {
        return await this.catRepository.create({
            ...cat,
            name: cat.name,
            resqueStory: cat.resqueStory,
            type: cat.type,
            tier: Tier.COMMON,
            status: {
                EAT: 0,
            },
            spriteImg: cat.spriteImg,
            catImg: cat.catImg,
            createdAt: new Date(),
            tokenId: generateRandomNumber(),
        });
    }

    async createUser(params: Partial<User>) {
        const wallets = this.generateWallets();

        const catId = new Types.ObjectId();
        const userId = new Types.ObjectId();
        await this.generateACat(catId, userId);
        return this.repository.create({
            _id: userId,
            name: params.name || params.email,
            email: params.email,
            shelter: params.shelter ? new Types.ObjectId(params.shelter) : undefined,
            canRedeemLives: true,
            permission: params.permission,
            discount: params.discount,
            wallets,
            cat: catId,
            cats: [catId],
        });
    }
}
