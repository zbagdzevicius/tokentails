import { BadRequestException } from '@nestjs/common';
import { ImageController, ORDER_STATUS_PROJECTION } from './image.controller';

jest.mock('stripe', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('src/shared/utils/ai-portrait', () => ({ generatePortraitForImage: jest.fn() }));
jest.mock('src/shared/utils/image.utils', () => ({ uploadFileImage: jest.fn().mockResolvedValue('https://img') }));
jest.mock('src/cat/cat.service', () => ({ CatService: class {} }));
jest.mock('src/user/user.service', () => ({ UserService: class {} }));
jest.mock('src/user/user.repository', () => ({ UserRepository: class {} }));
jest.mock('src/web3/order.repository', () => ({ OrderRepository: class {} }));
jest.mock('./image.repository', () => ({ ImageRepository: class {} }));

const { generatePortraitForImage } = jest.requireMock('src/shared/utils/ai-portrait');
const ORDER_ID = '64b7f0c2a1b2c3d4e5f60717';
const PROVIDER_ERROR = 'Provider quota exceeded for key sk-live-hidden (project p-123)';

function setup() {
    const orderRepository = { findOne: jest.fn().mockResolvedValue({ _id: ORDER_ID, status: 'COMPLETE' }) };
    const imageRepository = {
        create: jest.fn().mockResolvedValue({ _id: 'img-1' }),
        findOne: jest.fn().mockResolvedValue({ _id: 'img-1', url: 'https://img' }),
    };
    const controller = new (ImageController as any)(imageRepository, orderRepository, {}, {}, {}, {});
    return { controller: controller as ImageController, orderRepository };
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

describe('portrait generation errors', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        generatePortraitForImage.mockRejectedValue(new Error(PROVIDER_ERROR));
    });
    afterEach(() => jest.restoreAllMocks());

    it('POST /image/portrait keeps the provider error text on the server', async () => {
        const { controller } = setup();

        const error = await controller.createPortrait({}, { buffer: Buffer.from('x') }).catch(e => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).not.toContain('sk-live');
        expect(error.message).not.toContain(PROVIDER_ERROR);
    });

    it('PUT /image/portrait/:id/regenerate keeps the provider error text on the server', async () => {
        const { controller } = setup();

        const error = await controller.regeneratePortrait('img-1', {}).catch(e => e);
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).not.toContain(PROVIDER_ERROR);
    });
});
