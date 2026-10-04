import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { STOREFRONT_PER_SHELTER_LIMIT } from 'src/cat/storefront';
import { GALLERY_CACHE_TTL_MS, ShelterGalleryService } from './shelter-gallery.service';

const SHELTER = new Types.ObjectId();

const row = (n: number, status: string) => ({
    _id: new Types.ObjectId(n.toString(16).padStart(24, '0')),
    name: `nft${n}`,
    owner: undefined,
    blessing: {
        _id: new Types.ObjectId(),
        name: `cat ${n}`,
        status,
        creator: 'never-shown',
        image: { _id: new Types.ObjectId(), url: `https://cdn.example/${n}-photo.webp` },
        catAvatar: { _id: new Types.ObjectId(), url: `https://cdn.example/${n}-art.webp` },
    },
});

function setup(rows: unknown[], shelter: unknown = { _id: SHELTER }) {
    const find = jest.fn();
    const chain: Record<string, jest.Mock> = {
        sort: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        populate: jest.fn(() => chain),
        lean: jest.fn(() => chain),
        exec: jest.fn(async () => rows),
    };
    find.mockReturnValue(chain);
    const cats = { model: { find } };
    const shelters = { model: { findOne: jest.fn(() => ({ lean: async () => shelter })) } };
    return { svc: new ShelterGalleryService(cats as never, shelters as never), find, shelters, chain };
}

describe('ShelterGalleryService (GET /shelter/:slug/gallery)', () => {
    it('returns every showable cat, past the storefront cap of 200', async () => {
        const rows = [
            ...Array.from({ length: 240 }, (_, i) => row(i + 1, i % 2 ? 'WAITING' : 'ADOPTED')),
            row(900, 'HEAVEN'),
            row(901, 'RECOVERING'),
        ];
        const { svc, find } = setup(rows);
        const g = await svc.gallery('rozine-pedute');
        expect(g.atShelter.length + g.adopted.length).toBe(241);
        expect(g.atShelter.length + g.adopted.length).toBeGreaterThan(STOREFRONT_PER_SHELTER_LIMIT);
        expect(g.adopted).toHaveLength(120);
        expect(g.truncated).toBe(false);
        // Unowned catalogue cats of this shelter only.
        expect(find.mock.calls[0][0]).toEqual({
            shelter: SHELTER,
            blessing: { $exists: true },
            owner: { $exists: false },
        });
    });

    it('sends only the id, name, status and the two https image URLs', async () => {
        const { svc } = setup([row(1, 'RECOVERING')]);
        const g = await svc.gallery('rozine-pedute');
        expect(g.atShelter).toEqual([
            {
                id: (1).toString(16).padStart(24, '0'),
                name: 'Cat 1',
                status: 'RECOVERING',
                art: 'https://cdn.example/1-art.webp',
                photo: 'https://cdn.example/1-photo.webp',
            },
        ]);
        expect(JSON.stringify(g)).not.toMatch(/never-shown|owner/);
    });

    it('is 404 for any shelter without a public gallery, or an unknown slug', async () => {
        const { svc, shelters } = setup([]);
        await expect(svc.gallery('token-tails')).rejects.toBeInstanceOf(NotFoundException);
        expect(shelters.model.findOne).not.toHaveBeenCalled();
        const missing = setup([], null);
        await expect(missing.svc.gallery('rozine-pedute')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('caches a built gallery for a short while, never a failed one', async () => {
        const { svc, chain } = setup([row(1, 'WAITING')]);
        let t = 0;
        await svc.gallery('rozine-pedute', () => t);
        await svc.gallery('rozine-pedute', () => t + 1000);
        expect(chain.exec).toHaveBeenCalledTimes(1);
        t = GALLERY_CACHE_TTL_MS + 1;
        await svc.gallery('rozine-pedute', () => t);
        expect(chain.exec).toHaveBeenCalledTimes(2);
        chain.exec.mockRejectedValueOnce(new Error('db down'));
        t += GALLERY_CACHE_TTL_MS + 1;
        await expect(svc.gallery('rozine-pedute', () => t)).rejects.toThrow('db down');
        await new Promise(r => setImmediate(r));
        await svc.gallery('rozine-pedute', () => t);
        expect(chain.exec).toHaveBeenCalledTimes(4);
    });
});
