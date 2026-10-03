import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Wallet } from 'ethers';
import { Types } from 'mongoose';
import { ShelterMembersService } from 'src/shelter/shelter-members.service';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { attestationHash, attestationMessage, looksPersonal, recoverSigner, sha256Hex } from './attestation';
import { memoryModel } from './memory-model.fakes-spec';
import { ImpactPayoutService, PAYOUT_ERROR, PayoutWriteDto } from './payouts.service';

/*
 * Payout attestation (plan G4): a draft author cannot confirm, a tampered receipt is refused, a draft
 * edited after review is refused, bad signatures give 400, and only confirmed or signed payouts reach
 * the snapshot (with their tier).
 */

const RECEIPT = { buffer: Buffer.from('%PDF-1.4 receipt for 40 EUR of cat food'), mimetype: 'application/pdf' };

async function errorOf(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error: any) {
        return { status: error.getStatus?.(), body: error.getResponse?.() };
    }
    throw new Error('expected a rejection');
}

function setup() {
    const shelters = memoryModel();
    const users = memoryModel();
    const payouts = memoryModel({ unique: [['publicId']] });
    const members = new ShelterMembersService(shelters as any, users as any);
    const service = new ImpactPayoutService(payouts as any, shelters as any, members);
    const wallet = Wallet.createRandom();
    const shelter = {
        _id: new Types.ObjectId(),
        name: 'Pink Paw',
        slug: 'rozine-pedute',
        handoverStatus: 'held-by-token-tails',
        publicWallet: wallet.address.toLowerCase(),
    };
    shelters.rows.push(shelter);
    const person = (fields: Record<string, any> = {}) => {
        const doc = {
            _id: new Types.ObjectId(),
            name: 'Person',
            email: `x${users.rows.length}@example.test`,
            isGuest: false,
            emailVerifiedAt: new Date('2026-01-01'),
            permission: PERMISSION_LEVEL.USER,
            ...fields,
        };
        users.rows.push(doc);
        return doc;
    };
    const manager = person({ permission: PERMISSION_LEVEL.MANAGER });
    const member = person();
    const member2 = person();
    // Added as a member while a USER, promoted to MANAGER afterwards (see withMembers).
    const managerMember = person();
    const outsider = person();
    const draftBody = (fields: Partial<PayoutWriteDto> = {}): PayoutWriteDto => ({
        shelter: String(shelter._id),
        purpose: 'outcome',
        amount: '40.00',
        symbol: 'EUR',
        paidAt: '2026-09-28',
        method: 'bank-transfer',
        reference: 'INV-2026-0042',
        ...fields,
    });
    return {
        shelters,
        users,
        payouts,
        members,
        service,
        wallet,
        shelter,
        manager,
        member,
        member2,
        managerMember,
        outsider,
        draftBody,
    };
}

async function withMembers(t: ReturnType<typeof setup>) {
    await t.members.change(String(t.shelter._id), {
        add: [String(t.member._id), String(t.member2._id), t.managerMember.email],
    });
    t.managerMember.permission = PERMISSION_LEVEL.MANAGER;
}

describe('payout drafts', () => {
    it('stores the server-computed receipt SHA-256 and an attestation hash over the reviewed fields', async () => {
        const t = setup();
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        expect(draft).toEqual(
            expect.objectContaining({
                status: 'DRAFT',
                tier: null,
                amountWei: '40000000000000000000',
                amount: '40.0',
                symbol: 'EUR',
                paidAt: '2026-09-28',
                createdByMe: true,
                canConfirm: false,
            })
        );
        expect(draft.id).toMatch(/^p-[0-9a-f]{12}$/);
        expect(draft.receipt.sha256).toBe(sha256Hex(RECEIPT.buffer));
        expect(draft.attestationMessage).toContain(`Receipt SHA-256: ${sha256Hex(RECEIPT.buffer)}`);
        expect(draft.attestationMessage).toContain('Amount: 40.0 EUR');
        expect(draft.attestationHash).toBe(sha256Hex(draft.attestationMessage));
        // The receipt itself is not stored.
        expect(JSON.stringify(t.payouts.rows)).not.toContain('cat food');
    });

    it('refuses a missing receipt, personal data, and a pledge payout without a dated USD figure', async () => {
        const t = setup();
        await expect(t.service.createDraft(t.draftBody(), undefined, t.manager)).rejects.toThrow('receipt');
        await expect(
            t.service.createDraft(t.draftBody({ reference: 'paid to jane@example.org' }), RECEIPT, t.manager)
        ).rejects.toThrow('personal data');
        await expect(
            t.service.createDraft(t.draftBody({ reference: 'LT12 1000 0111 0100 1000' }), RECEIPT, t.manager)
        ).rejects.toThrow('personal data');
        await expect(
            t.service.createDraft(
                t.draftBody({ purpose: 'purchase-pledge', pledgeMonth: '2026-11' }),
                RECEIPT,
                t.manager
            )
        ).rejects.toThrow('USD equivalent');
        await expect(t.service.createDraft(t.draftBody({ method: 'onchain' }), RECEIPT, t.manager)).rejects.toThrow(
            'txHash'
        );
        await expect(
            t.service.createDraft(t.draftBody(), { buffer: Buffer.from('x'), mimetype: 'text/html' }, t.manager)
        ).rejects.toThrow('PDF or an image');
    });

    it('refuses line breaks in reference and fxSource (they could fake a line of the attestation)', async () => {
        const t = setup();
        const fake = 'INV-1\nAmount: 10 USD';
        await expect(t.service.createDraft(t.draftBody({ reference: fake }), RECEIPT, t.manager)).rejects.toThrow(
            'single line'
        );
        const dto = plainToInstance(PayoutWriteDto, { reference: fake, fxSource: 'ECB\r\nrate' });
        const errors = await validate(dto);
        expect(errors.map(e => e.property).sort()).toEqual(['fxSource', 'reference']);
        expect(await validate(plainToInstance(PayoutWriteDto, { reference: 'INV-2026-0042' }))).toEqual([]);
    });

    it('looksPersonal catches emails, phones and IBANs but not invoice numbers or dates', () => {
        expect(looksPersonal('INV-2026-0042')).toBe(false);
        expect(looksPersonal('paid 2026-10-01')).toBe(false);
        expect(looksPersonal('+370 612 34567')).toBe(true);
        expect(looksPersonal('a@b.co')).toBe(true);
        expect(looksPersonal('DE89370400440532013000')).toBe(true);
    });
});

describe('payout confirmation (SHELTER-CONFIRMED)', () => {
    it('the draft author cannot confirm, even as a shelter member', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.member2);
        const error = await errorOf(
            t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, t.member2)
        );
        expect(error).toEqual({
            status: 403,
            body: expect.objectContaining({ code: PAYOUT_ERROR.AUTHOR_CANNOT_CONFIRM }),
        });
        expect(t.payouts.rows[0].status).toBe('DRAFT');
    });

    it('only a member of the shelter can confirm (a manager who is not a member cannot)', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.managerMember);
        for (const user of [t.outsider, t.manager]) {
            const error = await errorOf(
                t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, user)
            );
            expect(error).toEqual({ status: 403, body: expect.objectContaining({ code: PAYOUT_ERROR.NOT_A_MEMBER }) });
        }
    });

    it('anyone who edited the draft cannot confirm it either (four eyes, not two)', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.member2);
        const edited = await t.service.updateDraft(draft.id, { amount: '400' }, undefined, t.member);
        expect(edited.canConfirm).toBe(false);
        expect((await t.service.get(draft.id, t.member)).canConfirm).toBe(false);
        expect(
            await errorOf(t.service.confirm(draft.id, { attestationHash: edited.attestationHash }, RECEIPT, t.member))
        ).toEqual({ status: 403, body: expect.objectContaining({ code: PAYOUT_ERROR.AUTHOR_CANNOT_CONFIRM }) });
        expect(t.payouts.rows[0].status).toBe('DRAFT');
        expect(t.payouts.rows[0].editors.map(String)).toEqual([String(t.member._id)]);
    });

    it('Token Tails staff can never be, or confirm as, a shelter member', async () => {
        const t = setup();
        await withMembers(t);
        await expect(t.members.change(String(t.shelter._id), { add: [String(t.manager._id)] })).rejects.toThrow(
            'staff'
        );
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        // managerMember joined as a USER and was promoted later: still refused.
        expect((await t.service.get(draft.id, t.managerMember)).canConfirm).toBe(false);
        expect(
            await errorOf(
                t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, t.managerMember)
            )
        ).toEqual({ status: 403, body: expect.objectContaining({ code: PAYOUT_ERROR.STAFF_CANNOT_CONFIRM }) });
    });

    it('confirm checks only size and hash of the re-uploaded receipt, not the browser-reported type', async () => {
        const t = setup();
        await withMembers(t);
        const heic = { buffer: Buffer.from('heic bytes of a receipt'), mimetype: 'image/heic' };
        const draft = await t.service.createDraft(t.draftBody(), heic, t.manager);
        const confirmed = await t.service.confirm(
            draft.id,
            { attestationHash: draft.attestationHash },
            { buffer: heic.buffer, mimetype: '' },
            t.member
        );
        expect(confirmed.status).toBe('SHELTER_CONFIRMED');
    });

    it('refuses a tampered receipt and a draft edited after review', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        const tampered = { ...RECEIPT, buffer: Buffer.from('%PDF-1.4 receipt for 400 EUR of cat food') };
        expect(
            await errorOf(t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, tampered, t.member))
        ).toEqual({
            status: 400,
            body: expect.objectContaining({ code: PAYOUT_ERROR.RECEIPT_MISMATCH }),
        });

        const edited = await t.service.updateDraft(draft.id, { amount: '400' }, undefined, t.manager);
        expect(edited.attestationHash).not.toBe(draft.attestationHash);
        expect(
            await errorOf(t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, t.member))
        ).toEqual({
            status: 409,
            body: expect.objectContaining({ code: PAYOUT_ERROR.STALE_ATTESTATION }),
        });
        expect(t.payouts.rows[0].status).toBe('DRAFT');
    });

    it('a member who did not write the draft confirms it with the same receipt; it is then frozen', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        const asMember = await t.service.get(draft.id, t.member);
        expect(asMember.canConfirm).toBe(true);

        const confirmed = await t.service.confirm(
            draft.id,
            { attestationHash: asMember.attestationHash },
            RECEIPT,
            t.member
        );
        expect(confirmed).toEqual(expect.objectContaining({ status: 'SHELTER_CONFIRMED', tier: 'shelter-confirmed' }));
        expect(String(t.payouts.rows[0].confirmedBy)).toBe(String(t.member._id));
        await expect(t.service.updateDraft(draft.id, { amount: '1' }, undefined, t.manager)).rejects.toThrow('draft');
        expect(
            (await errorOf(t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, t.member)))
                .status
        ).toBe(409);
    });

    it('lists every payout for a manager, only their shelters for a member, and refuses anyone else', async () => {
        const t = setup();
        await withMembers(t);
        const other = { _id: new Types.ObjectId(), name: 'Other', slug: 'other' };
        t.shelters.rows.push(other);
        await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        await t.service.createDraft(t.draftBody({ shelter: String(other._id) }), RECEIPT, t.manager);
        expect(await t.service.list(t.manager)).toHaveLength(2);
        expect((await t.service.list(t.member)).map(p => p.shelter.slug)).toEqual(['rozine-pedute']);
        expect((await errorOf(t.service.list(t.outsider))).status).toBe(403);
    });
});

describe('payout signatures (SHELTER-SIGNED)', () => {
    it('waits for the key handover, then accepts only the shelter wallet signature of this payout', async () => {
        const t = setup();
        await withMembers(t);
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        const good = await t.wallet.signMessage(draft.attestationMessage);

        expect(await errorOf(t.service.sign(draft.id, { signature: good }, t.manager))).toEqual({
            status: 409,
            body: expect.objectContaining({ code: PAYOUT_ERROR.HANDOVER_PENDING }),
        });

        t.shelters.rows[0].handoverStatus = 'handed-over';
        const stranger = await Wallet.createRandom().signMessage(draft.attestationMessage);
        const otherText = await t.wallet.signMessage(draft.attestationMessage + '\nAmount: 4000 EUR');
        for (const signature of [stranger, otherText, '0x' + '00'.repeat(65)]) {
            expect(await errorOf(t.service.sign(draft.id, { signature }, t.manager))).toEqual({
                status: 400,
                body: expect.objectContaining({ code: PAYOUT_ERROR.BAD_SIGNATURE }),
            });
        }
        expect(t.payouts.rows[0].status).toBe('DRAFT');

        const signed = await t.service.sign(draft.id, { signature: good }, t.member);
        expect(signed).toEqual(
            expect.objectContaining({
                status: 'SHELTER_SIGNED',
                tier: 'shelter-signed',
                signature: expect.objectContaining({ signer: t.wallet.address.toLowerCase() }),
            })
        );
        expect(recoverSigner(signed.attestationMessage, good)).toBe(t.wallet.address.toLowerCase());
    });

    it('a non-member who is not a manager cannot submit a signature', async () => {
        const t = setup();
        const draft = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        expect(
            (await errorOf(t.service.sign(draft.id, { signature: '0x' + '11'.repeat(65) }, t.outsider))).status
        ).toBe(404);
    });
});

describe('payouts in the snapshot', () => {
    it('only confirmed and signed payouts, per tier and symbol, named by slug and public id', async () => {
        const t = setup();
        await withMembers(t);
        const a = await t.service.createDraft(t.draftBody(), RECEIPT, t.manager);
        await t.service.confirm(a.id, { attestationHash: a.attestationHash }, RECEIPT, t.member);
        await t.service.createDraft(t.draftBody({ amount: '999' }), RECEIPT, t.manager); // stays a draft
        const v = await t.service.createDraft(t.draftBody({ amount: '5' }), RECEIPT, t.manager);
        await t.service.voidPayout(v.id, t.manager);

        expect(await t.service.totalsByTier()).toEqual({
            'shelter-confirmed': { EUR: '40000000000000000000' },
            'shelter-signed': {},
        });
        const items = await t.service.publicPayouts();
        expect(items).toEqual([
            expect.objectContaining({
                id: a.id,
                shelter: 'rozine-pedute',
                tier: 'shelter-confirmed',
                amountWei: '40000000000000000000',
            }),
        ]);
        const json = JSON.stringify(items);
        expect(json).not.toMatch(/"[0-9a-f]{24}"/);
        expect(json).not.toContain(String(t.member._id));
    });

    it('sums pledge payments in USD cents by month, from USD amounts or dated USD equivalents', async () => {
        const t = setup();
        await withMembers(t);
        const usd = await t.service.createDraft(
            t.draftBody({ purpose: 'purchase-pledge', pledgeMonth: '2026-11', symbol: 'USD', amount: '12.34' }),
            RECEIPT,
            t.manager
        );
        const eur = await t.service.createDraft(
            t.draftBody({
                purpose: 'purchase-pledge',
                pledgeMonth: '2026-11',
                usdCents: 1100,
                fxDate: '2026-11-30',
                fxSource: 'ECB reference rate',
            }),
            RECEIPT,
            t.manager
        );
        for (const draft of [usd, eur]) {
            await t.service.confirm(draft.id, { attestationHash: draft.attestationHash }, RECEIPT, t.member);
        }
        expect([...(await t.service.pledgePaidCents())]).toEqual([['2026-11', 2334]]);
    });

    it('attestationHash covers every reviewed field', () => {
        const base = {
            publicId: 'p-000000000001',
            shelterSlug: 'rozine-pedute',
            amount: '1000000000000000000',
            symbol: 'EUR',
            paidAt: '2026-09-28',
            method: 'cash',
            purpose: 'general',
            receiptSha256: 'ab'.repeat(32),
        };
        const hash = attestationHash(base);
        for (const change of [
            { amount: '2000000000000000000' },
            { symbol: 'USD' },
            { paidAt: '2026-09-27' },
            { receiptSha256: 'cd'.repeat(32) },
            { shelterSlug: 'x' },
        ]) {
            expect(attestationHash({ ...base, ...change })).not.toBe(hash);
        }
        expect(attestationMessage(base).split('\n')[0]).toBe('Token Tails payout attestation');
    });
});

describe('shelter members (PUT /shelter/:id/members)', () => {
    it('adds verified registered accounts by id or email and removes by id', async () => {
        const t = setup();
        const list = await t.members.change(String(t.shelter._id), { add: [String(t.member._id), t.outsider.email] });
        expect(list.map(m => m._id).sort()).toEqual([String(t.member._id), String(t.outsider._id)].sort());
        expect(JSON.stringify(list)).not.toContain('@example.test');
        const after = await t.members.change(String(t.shelter._id), { remove: [String(t.outsider._id)] });
        expect(after.map(m => m._id)).toEqual([String(t.member._id)]);
        expect(await t.members.isMember(t.shelter._id, t.member._id)).toBe(true);
        expect(await t.members.isMember(t.shelter._id, t.outsider._id)).toBe(false);
    });

    it('refuses guests, unverified and deleted accounts, and unknown people', async () => {
        const t = setup();
        const guest = { _id: new Types.ObjectId(), isGuest: true, emailVerifiedAt: new Date() };
        const unverified = { _id: new Types.ObjectId(), isGuest: false };
        const deleted = {
            _id: new Types.ObjectId(),
            isGuest: false,
            emailVerifiedAt: new Date(),
            deletedAt: new Date(),
        };
        t.users.rows.push(guest, unverified, deleted);
        const id = String(t.shelter._id);
        await expect(t.members.change(id, { add: [String(guest._id)] })).rejects.toThrow('registered');
        await expect(t.members.change(id, { add: [String(unverified._id)] })).rejects.toThrow('verified email');
        await expect(t.members.change(id, { add: [String(deleted._id)] })).rejects.toThrow('registered');
        await expect(t.members.change(id, { add: ['nobody@example.test'] })).rejects.toThrow('No account');
        await expect(t.members.change(id, {})).rejects.toThrow('Nothing to change');
        expect(t.shelters.rows[0].members).toBeUndefined();
    });
});
