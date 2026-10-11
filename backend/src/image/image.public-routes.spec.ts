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
import { ImageController, ORDER_STATUS_PROJECTION } from './image.controller';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/image.utils', () => ({
    uploadFileImage: jest.fn().mockResolvedValue('https://img'),
    isHeicImage: () => false,
    convertHeicToJpg: jest.fn(),
}));
jest.mock('src/shared/utils/aws.utils', () => ({ uploadFile: jest.fn() }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));
jest.mock('src/yourcat/portrait-delivery.service', () => ({ PortraitDeliveryService: class {} }));

const { generatePortraitForImage } = jest.requireMock('src/shared/utils/ai-portrait');
const { uploadFile } = jest.requireMock('src/shared/utils/aws.utils');
const ORDER_ID = '64b7f0c2a1b2c3d4e5f60717';
const IMAGE_ID = '64b7f0c2a1b2c3d4e5f60718';
const OWNER = '64b7f0c2a1b2c3d4e5f60719';
const OTHER = '64b7f0c2a1b2c3d4e5f60720';
const PROVIDER_ERROR = 'Provider quota exceeded for key sk-live-hidden (project p-123)';

const guest = { _id: OWNER, isGuest: true };
const registered = { _id: OWNER, isGuest: false };
const req = { headers: {}, ip: '203.0.113.7', ips: [] };

function setup(image: Record<string, unknown> | null = { _id: IMAGE_ID, url: 'https://img' }, paid = false) {
    const orderRepository = {
        findOne: jest.fn().mockResolvedValue({ _id: ORDER_ID, status: 'COMPLETE' }),
        model: { exists: jest.fn().mockResolvedValue(paid ? { _id: ORDER_ID } : null) },
    };
    const imageRepository = {
        create: jest.fn().mockResolvedValue({ _id: IMAGE_ID }),
        findOne: jest.fn().mockResolvedValue(image),
        find: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
    };
    const userRepository = { findOne: jest.fn().mockResolvedValue({ _id: { toString: () => OWNER } }) };
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
        cancel: jest.fn(),
        settle: jest.fn(),
    };
    const portraitCheckout = {
        create: jest.fn().mockResolvedValue({ url: 'https://stripe.test/cs', orderId: ORDER_ID }),
    };
    const controller = new (ImageController as any)(
        imageRepository,
        orderRepository,
        {},
        userRepository,
        {},
        { portraitCheckoutAmountCents: () => 1400 },
        portraitCheckout,
        gate
    );
    return { controller: controller as ImageController, orderRepository, imageRepository, gate, portraitCheckout };
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

    it('refuses a guest on an owner-less (legacy) image with 403 GUEST_FORBIDDEN; a registered user may', async () => {
        const legacy = { _id: IMAGE_ID, url: 'https://img' };
        expect(await refusal(setup(legacy).controller.regeneratePortrait(guest, req, IMAGE_ID, {}))).toEqual({
            status: 403,
            code: 'GUEST_FORBIDDEN',
        });
        generatePortraitForImage.mockResolvedValue('https://cdn.test/ai.webp');
        await expect(setup(legacy).controller.regeneratePortrait(registered, req, IMAGE_ID, {})).resolves.toBeTruthy();
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

    it('POST /image drops owner, source and aiUrl from the body', async () => {
        const { controller, imageRepository } = setup();
        await controller.create({ title: 't', owner: OTHER, source: 'yourcat', aiUrl: 'https://x' } as any, {
            buffer: Buffer.from('x'),
        });
        expect(imageRepository.create.mock.calls[0][0]).toEqual({ title: 't', url: 'https://img' });
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
