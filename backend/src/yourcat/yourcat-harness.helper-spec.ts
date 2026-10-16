/*
 * Test harness for the bet #3 `/yourcat` specs: a YourcatService over in-memory models (the identity
 * MemoryModel), a real AiBudgetService and AiUploadGate over the fake budget collections, and fakes for
 * the AI calls, S3 and Stripe. Not a spec itself (no `.spec.ts`).
 *
 * The importing spec must mock the modules that create API clients at import time (see the specs).
 */
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import sharp = require('sharp');
import { AiBudgetService } from 'src/ai-budget/ai-budget.service';
import { AiUploadGate } from 'src/ai-budget/ai-upload-gate';
import { FakeCollection } from 'src/ai-budget/fake-collection.helper-spec';
import { CAT_UNIQUE_INDEXES, MemoryModel, memoryRepository } from 'src/user/guest/memory-model.helper-spec';
import { YourcatService } from './yourcat.service';

export const NOW = new Date('2026-10-11T12:00:00Z');

/** MemoryModel plus `distinct` and a `populate` that resolves refs from other models. */
export class RichMemoryModel extends MemoryModel {
    refs: Record<string, MemoryModel> = {};
    private readonly jobCollections = new Map<string, MemoryModel>();

    /** `model.db.collection(name)` with a unique `_id`, so job leases are really exclusive. */
    get db() {
        return {
            collection: (name: string) => {
                if (!this.jobCollections.has(name)) {
                    this.jobCollections.set(name, new MemoryModel([], [{ fields: ['_id'] }], this.now));
                }
                return this.jobCollections.get(name)!;
            },
        };
    }

    async distinct(field: string) {
        const seen = new Map<string, unknown>();
        for (const doc of this.docs) {
            if (doc[field] !== undefined && doc[field] !== null) seen.set(String(doc[field]), doc[field]);
        }
        return [...seen.values()];
    }

    private populated(run: () => Promise<any>, paths: { path: string }[]) {
        const resolve = async () => {
            const value = await run();
            const fill = async (doc: any) => {
                if (!doc) return doc;
                for (const { path } of paths) {
                    const model = this.refs[path];
                    if (model && doc[path]) {
                        doc[path] = (await model.findOne({ _id: doc[path] }).lean()) || doc[path];
                    }
                }
                return doc;
            };
            return Array.isArray(value) ? Promise.all(value.map(fill)) : fill(value);
        };
        const chain: any = {
            lean: () => chain,
            sort: () => chain,
            limit: () => chain,
            populate: () => chain,
            then: (ok: any, fail: any) => resolve().then(ok, fail),
        };
        return chain;
    }

    findOne(filter: Record<string, any> = {}) {
        const base = super.findOne(filter);
        const chain = Object.assign(Object.create(Object.getPrototypeOf(base)), base);
        chain.populate = (paths: { path: string }[]) => this.populated(() => base.exec(), paths);
        return chain;
    }

    find(filter: Record<string, any> = {}) {
        const base = super.find(filter);
        const chain = Object.assign(Object.create(Object.getPrototypeOf(base)), base);
        chain.populate = (paths: { path: string }[]) => this.populated(() => base.exec(), paths);
        return chain;
    }
}
export const DAY = '2026-10-11';

export async function catPhoto(): Promise<Buffer> {
    return sharp({ create: { width: 64, height: 48, channels: 3, background: '#d84' } })
        .jpeg()
        .toBuffer();
}

export function fakeStripe() {
    const sessions = new Map<string, any>();
    return {
        sessions,
        checkout: {
            sessions: {
                create: jest.fn(async (params: any) => {
                    const id = `cs_${sessions.size + 1}`;
                    const session = { id, url: `https://stripe.test/${id}`, status: 'open', metadata: params.metadata };
                    sessions.set(id, session);
                    return session;
                }),
                retrieve: jest.fn(async (id: string) => {
                    const session = sessions.get(id);
                    if (!session) throw new Error('No such checkout.session');
                    return session;
                }),
                expire: jest.fn(async (id: string) => {
                    const session = sessions.get(id);
                    if (!session || session.status !== 'open') throw new Error('session is not open');
                    session.status = 'expired';
                    return session;
                }),
            },
        },
    };
}

export interface IHarnessOptions {
    users?: Record<string, any>[];
    cats?: Record<string, any>[];
}

export function harness(options: IHarnessOptions = {}) {
    const now = () => NOW;
    const yourcats = new RichMemoryModel([], [], now);
    const cats = new MemoryModel(options.cats || [], CAT_UNIQUE_INDEXES, now);
    const users = new RichMemoryModel(options.users || [], [], now);
    const images = new RichMemoryModel([], [], now);
    const orders = new RichMemoryModel([], [], now);
    orders.refs = { image: images, user: users };

    const days = new FakeCollection('day');
    const quotas = new FakeCollection('_id');
    const budget = new AiBudgetService(days as any, quotas as any);
    budget.now = now;
    budget.alert = jest.fn().mockResolvedValue(true);
    const gate = new AiUploadGate(budget);
    gate.firebase = {
        verifyAppCheck: jest.fn(),
        verifyAppCheckConsuming: jest.fn(async () => ({ alreadyConsumed: false })),
    };

    const catService = {
        addCatToTheOwner: jest.fn(async (cat: any, user: any) => {
            await users.updateOne({ _id: user._id }, { $push: { cats: { $each: [cat._id], $position: 0 } } });
            await cats.updateOne({ _id: cat._id }, { $set: { owner: new Types.ObjectId(String(user._id)) } });
            return cats.findOne({ _id: cat._id }).lean();
        }),
        createBlessingWithCat: jest.fn(),
    };
    const catNameService = {
        validName: jest.fn(async (raw: unknown) => {
            if (typeof raw !== 'string' || /[^A-Za-z ]/.test(raw)) {
                throw new BadRequestException({
                    statusCode: HttpStatus.BAD_REQUEST,
                    code: 'NAME_CHARS',
                    message: 'Use letters and spaces only',
                });
            }
            return raw.trim();
        }),
    };
    const stripe = fakeStripe();
    const checkoutService = {
        stripe,
        create: jest.fn(async (input: any) => {
            const session = await stripe.checkout.sessions.create({ metadata: input.metadata });
            const order: any = await orders.create({
                status: 'PENDING',
                entityType: 'IMAGE',
                hash: session.id,
                image: input.image ? new Types.ObjectId(String(input.image)) : undefined,
                user: new Types.ObjectId(input.userId),
                id: input.productType,
            });
            return { url: session.url, orderId: String(order._id), sessionId: session.id };
        }),
    };

    const service = new YourcatService(
        memoryRepository(yourcats) as any,
        memoryRepository(cats) as any,
        memoryRepository(users) as any,
        catService as any,
        catNameService as any,
        gate,
        budget,
        memoryRepository(images) as any,
        memoryRepository(orders) as any,
        checkoutService as any
    );
    service.now = now;
    const s3: string[] = [];
    const io = {
        generateCat: jest.fn<Promise<any>, any[]>(async () => ({
            name: 'My cat',
            resqueStory: 'x',
            type: 'FIRE',
            origin: 'YELLOW',
            spriteImg: 'https://cdn/assets/YELLOW/hat-pirate.png',
            catImg: 'https://cdn/assets/YELLOW/hat-pirate/IDLE.gif',
            screen: { isCat: true, personVisible: false },
        })),
        generatePixelAvatar: jest.fn(async (_image: Buffer, _mime: string, opts: any) => {
            opts?.onUsage?.({
                provider: 'gemini',
                model: 'gemini-3.1-flash-image-preview',
                inputTokens: 1000,
                outputTokens: 0,
                images: 1,
                imageSize: '1K',
            });
            return sharp({ create: { width: 32, height: 32, channels: 3, background: '#123' } })
                .png()
                .toBuffer();
        }),
        pixelateAvatar: jest.fn(async (buffer: Buffer) => buffer),
        uploadPrivateObject: jest.fn(async (key: string) => {
            s3.push(`put-private:${key}`);
        }),
        uploadPublicObject: jest.fn(async (params: { key: string }) => {
            s3.push(`put-public:${params.key}`);
        }),
        deleteObject: jest.fn(async (key: string) => {
            s3.push(`delete:${key}`);
        }),
    };
    service.io = io as any;

    return {
        service,
        io,
        s3,
        yourcats,
        cats,
        users,
        images,
        orders,
        days,
        quotas,
        budget,
        gate,
        catService,
        catNameService,
        stripe,
        checkoutService,
    };
}

export const uploadReq = (ip = '203.0.113.7') => ({
    ip,
    ips: [],
    headers: { 'x-firebase-appcheck': 'limited-use-token' },
});

export function guestUser(overrides: Record<string, any> = {}) {
    return {
        _id: new Types.ObjectId(),
        name: 'Guest',
        isGuest: true,
        onboarding: { state: 'pending', version: 1 },
        ...overrides,
    };
}

export function registeredUser(overrides: Record<string, any> = {}) {
    return {
        _id: new Types.ObjectId(),
        name: 'Ada',
        email: 'ada@example.test',
        isGuest: false,
        ...overrides,
    };
}
