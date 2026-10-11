import { BadRequestException, HttpException } from '@nestjs/common';
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import sharp = require('sharp');
import { ALLOW_GUEST_KEY } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PhotoUploadExceptionFilter } from 'src/shared/photo-upload.filter';
import { PHOTO_MAX_BYTES } from 'src/shared/utils/photo-upload';
import { ImageController, ORDER_STATUS_PROJECTION, PORTRAIT_PREVIEW_TIMEOUT_MS } from './image.controller';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai-portrait', () => ({
    generatePortraitForImage: jest.fn(),
    publishPaidPortrait: jest.fn(),
}));
jest.mock('src/shared/utils/image.utils', () => ({
    uploadFileImage: jest.fn().mockResolvedValue('https://img'),
    isHeicImage: () => false,
    convertHeicToJpg: jest.fn(),
}));
jest.mock('src/shared/utils/aws.utils', () => ({ uploadFile: jest.fn() }));
jest.mock('./order-email', () => ({ sendOrderConfirmationEmail: jest.fn().mockResolvedValue(true) }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/yourcat/portrait-delivery.service', () => ({ PortraitDeliveryService: class {} }));

const { generatePortraitForImage, publishPaidPortrait } = jest.requireMock('src/shared/utils/ai-portrait');
const { sendOrderConfirmationEmail } = jest.requireMock('./order-email');
const { uploadFile } = jest.requireMock('src/shared/utils/aws.utils');
const ORDER_ID = '64b7f0c2a1b2c3d4e5f60717';
const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const OWNER = '64b7f0c2a1b2c3d4e5f60719';
const OTHER = '64b7f0c2a1b2c3d4e5f60720';
const PROVIDER_ERROR = 'Provider quota exceeded for key sk-live-hidden (project p-123)';

const guest = { _id: OWNER, isGuest: true };
const registered = { _id: OWNER, isGuest: false, permission: 1 };
const editor = { _id: OWNER, isGuest: false, permission: 3 };
const PRIVATE_4K = 's3private://portraits/0b7c6f3e-4K.png';
const PREVIEW = 'https://cdn.test/preview-1024.webp';
const PUBLIC_4K = 'https://cdn.test/full-4K.png';
const portraitImage = (fields: Record<string, unknown> = {}) => ({
    _id: IMAGE_ID,
    url: 'https://cdn.test/photo.webp',
    source: 'portrait',
    owner: OWNER,
    aiUrl: PRIVATE_4K,
    previewUrl: PREVIEW,
    ...fields,
});
const req = { headers: {}, ip: '203.0.113.7', ips: [] };

function setup(
    image: Record<string, unknown> | null = { _id: IMAGE_ID, url: 'https://img' },
    paid = false,
    extra: { userService?: Record<string, unknown>; stripePayments?: Record<string, unknown>; catService?: any } = {}
) {
    const orderRepository = {
        // A COMPLETE-order lookup for the image answers `paid`; any other lookup (order status) finds the order.
        findOne: jest.fn(
            async (query: any): Promise<any> =>
                query?.searchObject?.image ? (paid ? { _id: ORDER_ID } : null) : { _id: ORDER_ID, status: 'COMPLETE' }
        ),
    };
    const imageRepository = {
        create: jest.fn().mockResolvedValue({ _id: IMAGE_ID }),
        findOne: jest.fn().mockResolvedValue(image),
        find: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
    };
    const userRepository = {
        findOne: jest.fn().mockResolvedValue({ _id: { toString: () => OWNER } }),
        update: jest.fn().mockResolvedValue({}),
    };
    const ticket = {
        kind: 'portrait-preview',
        day: '2026-10-11',
        reservationMicroEur: 300000,
        quotaKeys: [],
        failureKey: null,
    };
    const gate = {
        admit: jest.fn().mockResolvedValue(ticket),
        refuseBeforeAi: jest.fn(),
        release: jest.fn(),
        recordFailure: jest.fn(),
        cancel: jest.fn(),
        settle: jest.fn(),
    };
    const portraitCheckout = {
        create: jest.fn().mockResolvedValue({ url: 'https://stripe.test/cs', orderId: ORDER_ID }),
    };
    const userService = extra.userService || {};
    const catService = extra.catService || { createBlessingWithCat: jest.fn() };
    const controller = new (ImageController as any)(
        imageRepository,
        orderRepository,
        userService,
        userRepository,
        catService,
        { portraitCheckoutAmountCents: () => 1400, ...(extra.stripePayments || {}) },
        portraitCheckout,
        gate
    );
    return {
        controller: controller as ImageController,
        orderRepository,
        imageRepository,
        userRepository,
        gate,
        portraitCheckout,
        catService,
    };
}

const jpeg = () =>
    sharp({ create: { width: 32, height: 24, channels: 3, background: '#a63' } })
        .jpeg()
        .toBuffer();

async function refusal(promise: Promise<unknown>) {
    const error = await promise.then(
        () => null,
        e => e
    );
    expect(error).toBeInstanceOf(HttpException);
    return { status: (error as HttpException).getStatus(), code: ((error as HttpException).getResponse() as any).code };
}

describe('GET /image/order/status (public)', () => {
    it('returns only the fields the checkout page polls, never user, wallet, hash or discount', async () => {
        const { controller, orderRepository } = setup();

        await controller.getOrderStatus(ORDER_ID);

        const query = orderRepository.findOne.mock.calls[0][0];
        expect(query.projection).toBe(ORDER_STATUS_PROJECTION);
        for (const field of ['user', 'walletAddress', 'hash', 'discount', 'ref', 'failedHash']) {
            expect(ORDER_STATUS_PROJECTION.split(' ')).not.toContain(field);
        }
        for (const field of ['status', 'id', 'price']) {
            expect(ORDER_STATUS_PROJECTION.split(' ')).toContain(field);
        }
    });

    it('rejects an id that is not an ObjectId', async () => {
        const { controller, orderRepository } = setup();

        await expect(controller.getOrderStatus('{"$gt":""}')).rejects.toBeInstanceOf(BadRequestException);
        expect(orderRepository.findOne).not.toHaveBeenCalled();
    });
});

describe('bet #3 route metadata', () => {
    const proto = ImageController.prototype as any;
    const guardsOf = (handler: string) => Reflect.getMetadata(GUARDS_METADATA, proto[handler]) || [];

    it('POST /image/portrait: AppAuthGuard, guests, both throttlers, no global throttle, multer limits, photo filter', () => {
        expect(guardsOf('createPortrait')).toEqual([AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard]);
        expect(Reflect.getMetadata(ALLOW_GUEST_KEY, proto.createPortrait)).toEqual({ transient: false });
        expect(Reflect.getMetadata('THROTTLER:SKIPdefault', proto.createPortrait)).toBe(true);
        expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, proto.createPortrait)).toEqual([
            PhotoUploadExceptionFilter,
        ]);
        const [Interceptor] = Reflect.getMetadata(INTERCEPTORS_METADATA, proto.createPortrait);
        expect(new Interceptor().multer.limits).toEqual({
            fileSize: PHOTO_MAX_BYTES,
            files: 1,
            fields: 5,
            fieldSize: 1024,
        });
    });

    it('regenerate is guest-allowed behind the same guards', () => {
        expect(guardsOf('regeneratePortrait')).toEqual([AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard]);
        expect(Reflect.getMetadata(ALLOW_GUEST_KEY, proto.regeneratePortrait)).toEqual({ transient: false });
    });

    it('POST /image/search is editors only', () => {
        const guards = guardsOf('search');
        expect(guards[0]).toBe(AppAuthGuard);
        const permission = new guards[1]();
        const context = (level: number) => ({
            switchToHttp: () => ({ getRequest: () => ({ user: { permission: level } }) }),
        });
        expect(permission.canActivate(context(3))).toBe(true);
        expect(permission.canActivate(context(1))).toBe(false);
    });
});

describe('POST /image/portrait', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        generatePortraitForImage.mockReset();
        uploadFile.mockReset();
        process.env.DO_SPACES_CDN = 'https://cdn.test';
        delete process.env.PORTRAIT_PREVIEW_ENABLED;
    });
    afterEach(() => jest.restoreAllMocks());

    it('admits through the gate as portrait-preview, stores a sanitized photo under a uuid name, sets owner and source', async () => {
        const { controller, gate, imageRepository } = setup();
        generatePortraitForImage.mockResolvedValue('https://cdn.test/ai.webp');

        await controller.createPortrait(guest, req, { style: 'monarch' as any }, { buffer: await jpeg() });

        expect(gate.admit).toHaveBeenCalledWith(req, guest, 'portrait-preview');
        const [filename, data, extension] = uploadFile.mock.calls[0];
        expect(filename).toMatch(/^[0-9a-f-]{36}\.webp$/);
        expect(extension).toBe('webp');
        expect((await sharp(data).metadata()).format).toBe('webp');
        expect(imageRepository.create.mock.calls[0][0]).toMatchObject({
            url: `https://cdn.test/${filename}`,
            source: 'portrait',
            style: 'monarch',
        });
        expect(String(imageRepository.create.mock.calls[0][0].owner)).toBe(OWNER);
        expect(gate.settle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'portrait-preview' }), 320_000);
    });

    it('an undecodable photo is refused before any AI call and the attempt is given back', async () => {
        const { controller, gate } = setup();
        expect(await refusal(controller.createPortrait(guest, req, {}, { buffer: Buffer.from('x') }))).toEqual({
            status: 400,
            code: 'YOURCAT_NOT_DECODABLE',
        });
        expect(gate.refuseBeforeAi).toHaveBeenCalled();
        expect(generatePortraitForImage).not.toHaveBeenCalled();
    });

    it('is 503 when PORTRAIT_PREVIEW_ENABLED=false', async () => {
        process.env.PORTRAIT_PREVIEW_ENABLED = 'false';
        const { controller, gate } = setup();
        expect((await refusal(controller.createPortrait(guest, req, {}, { buffer: await jpeg() }))).code).toBe(
            'YOURCAT_PORTRAIT_DISABLED'
        );
        expect(gate.admit).not.toHaveBeenCalled();
    });

    it('keeps the provider error text on the server', async () => {
        const { controller } = setup();
        generatePortraitForImage.mockRejectedValue(new Error(PROVIDER_ERROR));

        const error = await controller.createPortrait(guest, req, {}, { buffer: await jpeg() }).catch(e => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).not.toContain('sk-live');
        expect(error.message).not.toContain(PROVIDER_ERROR);
    });
});

describe('PUT /image/portrait/:id/regenerate', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        generatePortraitForImage.mockReset();
    });
    afterEach(() => jest.restoreAllMocks());

    it("refuses another owner's image (404)", async () => {
        const { controller, gate } = setup({ _id: IMAGE_ID, url: 'https://img', owner: OTHER });
        expect((await refusal(controller.regeneratePortrait(registered, req, IMAGE_ID, {}))).status).toBe(404);
        expect(gate.admit).not.toHaveBeenCalled();
    });

    it('refuses a guest on an owner-less (legacy) image with 403 GUEST_FORBIDDEN', async () => {
        const legacy = { _id: IMAGE_ID, url: 'https://img' };
        expect(await refusal(setup(legacy).controller.regeneratePortrait(guest, req, IMAGE_ID, {}))).toEqual({
            status: 403,
            code: 'GUEST_FORBIDDEN',
        });
    });

    it('KI-14: an owner-less (legacy) image is 403 for a registered player below EDITOR; an editor may', async () => {
        const legacy = { _id: IMAGE_ID, url: 'https://img' };
        const player = setup(legacy);
        expect((await refusal(player.controller.regeneratePortrait(registered, req, IMAGE_ID, {}))).status).toBe(403);
        expect(player.gate.admit).not.toHaveBeenCalled();
        expect(generatePortraitForImage).not.toHaveBeenCalled();

        generatePortraitForImage.mockResolvedValue('https://cdn.test/ai.webp');
        await expect(setup(legacy).controller.regeneratePortrait(editor, req, IMAGE_ID, {})).resolves.toBeTruthy();
    });

    it('a guest may regenerate its own image, through the gate', async () => {
        const { controller, gate } = setup({ _id: IMAGE_ID, url: 'https://img', owner: new Types.ObjectId(OWNER) });
        generatePortraitForImage.mockResolvedValue('https://cdn.test/ai.webp');
        await controller.regeneratePortrait(guest, req, IMAGE_ID, {});
        expect(gate.admit).toHaveBeenCalledWith(req, guest, 'portrait-preview');
    });

    it("refuses source: 'yourcat' images (404) and images with a COMPLETE order (409)", async () => {
        const yourcat = setup({
            _id: IMAGE_ID,
            url: 's3private://yourcat/originals/a.webp',
            owner: OWNER,
            source: 'yourcat',
        });
        expect((await refusal(yourcat.controller.regeneratePortrait(guest, req, IMAGE_ID, {}))).status).toBe(404);

        const paid = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER }, true);
        expect(await refusal(paid.controller.regeneratePortrait(guest, req, IMAGE_ID, {}))).toEqual({
            status: 409,
            code: 'YOURCAT_PORTRAIT_EXISTS',
        });
        expect(paid.gate.admit).not.toHaveBeenCalled();
    });

    it('keeps the provider error text on the server', async () => {
        const { controller } = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER });
        generatePortraitForImage.mockRejectedValue(new Error(PROVIDER_ERROR));
        const error = await controller.regeneratePortrait(guest, req, IMAGE_ID, {}).catch(e => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).not.toContain(PROVIDER_ERROR);
    });
});

describe('image reads and writes', () => {
    it("GET /image/:id excludes source: 'yourcat'", async () => {
        const { controller, imageRepository } = setup();
        await controller.findOne(IMAGE_ID);
        expect(imageRepository.findOne.mock.calls[0][0].searchObject).toEqual({
            _id: IMAGE_ID,
            source: { $ne: 'yourcat' },
        });
    });

    it('POST /image copies only name, style and isTemporary (KI-13); owner, source, aiUrl and unknown fields are dropped', async () => {
        const { controller, imageRepository } = setup();
        await controller.create(
            {
                name: 'Misty',
                style: 'monarch',
                isTemporary: 'true',
                title: 't',
                owner: OTHER,
                source: 'yourcat',
                aiUrl: 'https://x',
                previewUrl: 'https://p',
                $where: '1',
                status: 'COMPLETE',
            } as any,
            { buffer: Buffer.from('x') }
        );
        expect(imageRepository.create.mock.calls[0][0]).toEqual({
            name: 'Misty',
            style: 'monarch',
            isTemporary: true,
            url: 'https://img',
        });
    });

    it('POST /image drops a style that is not an ImageStyle', async () => {
        const { controller, imageRepository } = setup();
        await controller.create({ style: 'emperor', name: 7 } as any, { buffer: Buffer.from('x') });
        expect(imageRepository.create.mock.calls[0][0]).toEqual({ url: 'https://img' });
    });

    it('PUT /image/:id drops owner and source, keeps url and aiUrl editable', async () => {
        const { controller, imageRepository } = setup();
        await controller.update(IMAGE_ID, {
            caption: 'c',
            owner: OTHER,
            source: 'yourcat',
            url: 'https://new',
            aiUrl: 'https://ai',
        } as any);
        expect(imageRepository.update.mock.calls[0][1]).toEqual({
            caption: 'c',
            url: 'https://new',
            aiUrl: 'https://ai',
        });
    });
});

describe('legacy portrait checkout routes', () => {
    it("both refuse a source: 'yourcat' image with 404", async () => {
        const yourcatImage = {
            _id: IMAGE_ID,
            url: 's3private://yourcat/originals/a.webp',
            source: 'yourcat',
            owner: OWNER,
        };
        const unsigned = setup(yourcatImage);
        expect(
            (
                await refusal(
                    unsigned.controller.createCheckoutSession({
                        productType: 'digital' as any,
                        imageId: IMAGE_ID,
                        userId: OWNER,
                    })
                )
            ).status
        ).toBe(404);
        const signed = setup(yourcatImage);
        expect(
            (
                await refusal(
                    signed.controller.createCheckoutSessionSigned(OWNER, {
                        productType: 'digital' as any,
                        imageId: IMAGE_ID,
                    })
                )
            ).status
        ).toBe(404);
        expect(signed.portraitCheckout.create).not.toHaveBeenCalled();
    });

    it("-signed refuses another owner's image; the caller's own image goes through PortraitCheckoutService", async () => {
        const other = setup({ _id: IMAGE_ID, url: 'https://img', owner: OTHER });
        expect(
            (
                await refusal(
                    other.controller.createCheckoutSessionSigned(OWNER, {
                        productType: 'digital' as any,
                        imageId: IMAGE_ID,
                    })
                )
            ).status
        ).toBe(404);

        const own = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER });
        await expect(
            own.controller.createCheckoutSessionSigned(OWNER, { productType: 'digital' as any, imageId: IMAGE_ID })
        ).resolves.toEqual({ url: 'https://stripe.test/cs' });
        expect(own.portraitCheckout.create.mock.calls[0][0]).toMatchObject({ productType: 'digital', userId: OWNER });
    });
});

describe('KI-08: the 4K /portrait output stays private until its order is COMPLETE', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        generatePortraitForImage.mockReset();
        publishPaidPortrait.mockReset();
        sendOrderConfirmationEmail.mockClear();
        uploadFile.mockReset();
        process.env.DO_SPACES_CDN = 'https://cdn.test';
        delete process.env.PORTRAIT_PREVIEW_ENABLED;
    });
    afterEach(() => jest.restoreAllMocks());

    const leaks = (value: unknown) => {
        const json = JSON.stringify(value);
        return json.includes('s3private://') || json.includes('portraits/') || json.includes(PUBLIC_4K);
    };

    it('POST /image/portrait answers with the watermarked preview as aiUrl, never the private 4K key', async () => {
        const { controller } = setup(portraitImage());
        generatePortraitForImage.mockResolvedValue(PREVIEW);

        const image: any = await controller.createPortrait(guest, req, {}, { buffer: await jpeg() });

        expect(image.aiUrl).toBe(PREVIEW);
        expect(image.previewUrl).toBe(PREVIEW);
        expect(leaks(image)).toBe(false);
    });

    it('PUT regenerate answers with the preview too', async () => {
        const { controller } = setup(portraitImage({ owner: new Types.ObjectId(OWNER) }));
        generatePortraitForImage.mockResolvedValue(PREVIEW);

        const image: any = await controller.regeneratePortrait(guest, req, IMAGE_ID, {});

        expect(image.aiUrl).toBe(PREVIEW);
        expect(leaks(image)).toBe(false);
    });

    it('GET /image/:id before payment: the preview, no private key, nothing published', async () => {
        const { controller } = setup(portraitImage());
        const image: any = await controller.findOne(IMAGE_ID);
        expect(image.aiUrl).toBe(PREVIEW);
        expect(leaks(image)).toBe(false);
        expect(publishPaidPortrait).not.toHaveBeenCalled();
    });

    it('GET /image/:id after COMPLETE: the full public URL (published now if the webhook could not)', async () => {
        const published = setup(portraitImage({ aiUrl: PUBLIC_4K }), true);
        expect(((await published.controller.findOne(IMAGE_ID)) as any).aiUrl).toBe(PUBLIC_4K);
        expect(publishPaidPortrait).not.toHaveBeenCalled();

        const pending = setup(portraitImage(), true);
        publishPaidPortrait.mockResolvedValue(PUBLIC_4K);
        const image: any = await pending.controller.findOne(IMAGE_ID);
        expect(publishPaidPortrait).toHaveBeenCalledWith(
            expect.objectContaining({ aiUrl: PRIVATE_4K }),
            expect.anything(),
            expect.any(Object)
        );
        expect(image.aiUrl).toBe(PUBLIC_4K);
        expect(JSON.stringify(image)).not.toContain('s3private://');
    });

    it('GET /image/:id after COMPLETE, publishing failed: still no private key (the preview)', async () => {
        const { controller } = setup(portraitImage(), true);
        publishPaidPortrait.mockRejectedValue(new Error('spaces down'));
        const image: any = await controller.findOne(IMAGE_ID);
        expect(image.aiUrl).toBe(PREVIEW);
        expect(JSON.stringify(image)).not.toContain('s3private://');
    });

    it('legacy images keep their public aiUrl', async () => {
        const { controller } = setup({ _id: IMAGE_ID, url: 'https://img', aiUrl: 'https://cdn.test/legacy.webp' });
        expect(((await controller.findOne(IMAGE_ID)) as any).aiUrl).toBe('https://cdn.test/legacy.webp');
    });

    it('the webhook publishes the 4K copy on COMPLETE and emails and grants the public URL', async () => {
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        const session = { id: 'cs_test', amount_total: 1400, currency: 'eur', customer_details: {} };
        const catService = { createBlessingWithCat: jest.fn() };
        const { controller, orderRepository, imageRepository } = setup(portraitImage(), false, {
            catService,
            stripePayments: {
                stripe: {
                    webhooks: {
                        constructEvent: () => ({ type: 'checkout.session.completed', data: { object: session } }),
                    },
                },
                checkPaidCheckoutSession: () => null,
                completePendingOrder: jest.fn().mockResolvedValue(true),
            },
        });
        orderRepository.findOne.mockResolvedValue({
            _id: ORDER_ID,
            status: 'PENDING',
            priceUsd: 16.1,
            user: { _id: new Types.ObjectId(OWNER), email: 'buyer@example.com' },
            image: portraitImage({ _id: new Types.ObjectId(IMAGE_ID) }),
        });
        publishPaidPortrait.mockResolvedValue(PUBLIC_4K);

        await expect(
            controller.handleStripeWebhook({ rawBody: Buffer.from('{}') } as any, 'signature')
        ).resolves.toEqual({ received: true });

        expect(publishPaidPortrait).toHaveBeenCalledWith(
            expect.objectContaining({ aiUrl: PRIVATE_4K }),
            imageRepository,
            expect.any(Object)
        );
        expect(sendOrderConfirmationEmail).toHaveBeenCalledWith('buyer@example.com', PUBLIC_4K);
        expect(catService.createBlessingWithCat).toHaveBeenCalledWith(OWNER, PUBLIC_4K);
        delete process.env.STRIPE_WEBHOOK_SECRET;
    });
});

describe('YC-02 / YC-03: a failed or timed-out preview', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        generatePortraitForImage.mockReset();
        uploadFile.mockReset();
        process.env.DO_SPACES_CDN = 'https://cdn.test';
        delete process.env.PORTRAIT_PREVIEW_ENABLED;
    });
    afterEach(() => jest.restoreAllMocks());

    it('gives the daily attempt back, counts a failure, then settles the 4K fallback cost', async () => {
        const { controller, gate } = setup();
        generatePortraitForImage.mockRejectedValue(new Error(PROVIDER_ERROR));

        await expect(controller.createPortrait(guest, req, {}, { buffer: await jpeg() })).rejects.toBeInstanceOf(
            BadRequestException
        );

        expect(gate.release).toHaveBeenCalledTimes(1);
        expect(gate.recordFailure).toHaveBeenCalledTimes(1);
        expect(gate.settle).toHaveBeenCalledWith(expect.objectContaining({ kind: 'portrait-preview' }), 320_000);
        const order = (fn: jest.Mock) => fn.mock.invocationCallOrder[0];
        expect(order(gate.release)).toBeLessThan(order(gate.settle));
        expect(order(gate.recordFailure)).toBeLessThan(order(gate.settle));
    });

    it('a failed regenerate gives the attempt back too', async () => {
        const { controller, gate } = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER });
        generatePortraitForImage.mockRejectedValue(new Error('boom'));
        await controller.regeneratePortrait(guest, req, IMAGE_ID, {}).catch(() => undefined);
        expect(gate.release).toHaveBeenCalled();
        expect(gate.recordFailure).toHaveBeenCalled();
    });

    it('passes an AbortSignal and aborts after 90 s; the fallback is settled and the timer cleared', async () => {
        const { controller, gate } = setup();
        const timers: { fire: () => void; ms?: number }[] = [];
        const realSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
            if (ms === PORTRAIT_PREVIEW_TIMEOUT_MS) {
                timers.push({ fire: fn, ms });
                return 4242 as any;
            }
            return realSetTimeout(fn, ms);
        }) as any);
        const cleared = jest.spyOn(global, 'clearTimeout');
        let signal: AbortSignal | undefined;
        generatePortraitForImage.mockImplementation(
            (_id: string, _repo: unknown, _style: unknown, options: { signal?: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    signal = options.signal;
                    options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
                    // The timeout is due: fire it.
                    expect(options.signal?.aborted).toBe(false);
                    timers[0].fire();
                })
        );

        const error = await controller.createPortrait(guest, req, {}, { buffer: await jpeg() }).catch(e => e);

        expect(timers).toHaveLength(1);
        expect(signal?.aborted).toBe(true);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(gate.release).toHaveBeenCalled();
        expect(gate.recordFailure).toHaveBeenCalled();
        expect(gate.settle).toHaveBeenCalledWith(expect.anything(), 320_000);
        expect(cleared).toHaveBeenCalledWith(4242);
    });

    it('a successful preview clears its timer', async () => {
        const { controller } = setup();
        const cleared = jest.spyOn(global, 'clearTimeout');
        let signal: AbortSignal | undefined;
        generatePortraitForImage.mockImplementation(
            async (_id: string, _repo: unknown, _style: unknown, options: { signal?: AbortSignal }) => {
                signal = options.signal;
                return PREVIEW;
            }
        );
        await controller.createPortrait(guest, req, {}, { buffer: await jpeg() });
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal?.aborted).toBe(false);
        expect(cleared).toHaveBeenCalled();
    });
});

describe('KI-12: the unsigned checkout believes body.userId only when the image vouches for it', () => {
    const userService = () => ({
        findByEmail: jest.fn().mockResolvedValue({ _id: { toString: () => OTHER } }),
        createUser: jest.fn(),
    });

    it("ignores a foreign userId (not the image's owner) and attributes the buyer by email", async () => {
        const users = userService();
        const { controller, portraitCheckout, userRepository } = setup(
            { _id: IMAGE_ID, url: 'https://img', owner: OWNER },
            false,
            { userService: users }
        );
        await controller.createCheckoutSession({
            productType: 'digital' as any,
            imageId: IMAGE_ID,
            userId: OTHER,
            email: 'buyer@example.com',
        });
        expect(userRepository.findOne).not.toHaveBeenCalled();
        expect(users.findByEmail).toHaveBeenCalledWith('buyer@example.com');
        expect(portraitCheckout.create.mock.calls[0][0].userId).toBe(OTHER);
    });

    it('a foreign userId with no email is refused (400) and no session is created', async () => {
        const { controller, portraitCheckout } = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER });
        expect(
            (
                await refusal(
                    controller.createCheckoutSession({
                        productType: 'digital' as any,
                        imageId: IMAGE_ID,
                        userId: OTHER,
                    })
                )
            ).status
        ).toBe(400);
        expect(portraitCheckout.create).not.toHaveBeenCalled();
    });

    it("accepts the owner's own userId, and on an ownerless image only while it was never bought", async () => {
        const own = setup({ _id: IMAGE_ID, url: 'https://img', owner: OWNER });
        await own.controller.createCheckoutSession({ productType: 'digital' as any, imageId: IMAGE_ID, userId: OWNER });
        expect(own.portraitCheckout.create.mock.calls[0][0].userId).toBe(OWNER);

        const fresh = setup({ _id: IMAGE_ID, url: 'https://img' });
        await fresh.controller.createCheckoutSession({
            productType: 'digital' as any,
            imageId: IMAGE_ID,
            userId: OWNER,
        });
        expect(fresh.portraitCheckout.create.mock.calls[0][0].userId).toBe(OWNER);

        const bought = setup({ _id: IMAGE_ID, url: 'https://img' }, true);
        expect(
            (
                await refusal(
                    bought.controller.createCheckoutSession({
                        productType: 'digital' as any,
                        imageId: IMAGE_ID,
                        userId: OWNER,
                    })
                )
            ).status
        ).toBe(400);
        expect(bought.portraitCheckout.create).not.toHaveBeenCalled();
    });

    it('without an imageId a userId is ignored', async () => {
        const { controller, portraitCheckout } = setup();
        expect(
            (await refusal(controller.createCheckoutSession({ productType: 'digital' as any, userId: OWNER }))).status
        ).toBe(400);
        expect(portraitCheckout.create).not.toHaveBeenCalled();
    });
});
