import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { shelterSplitInterface } from './shelter-chain';
import { readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
import { shelterClaimMessage, ShelterClaimService } from './shelter-claim.service';

const NOW = new Date('2026-10-04T10:00:00Z');
const SPLIT = '0x1111111111111111111111111111111111111111';
// Throwaway keys made for this spec; they never hold anything.
const HOT = Wallet.createRandom();
const SHELTER = Wallet.createRandom();
const TREASURY = Wallet.createRandom();

function config(over: Partial<ShelterOnchainConfig> = {}): ShelterOnchainConfig {
    return {
        ...readShelterConfig({
            SHELTER_CHAIN_ID: '5042',
            SHELTER_SPLIT_ADDRESS: SPLIT,
            SHELTER_DONATE_PRIVATE_KEY: HOT.privateKey,
            SHELTER_ARC_RPC_URL: 'http://127.0.0.1:1',
            // The hot wallet and treasury are listed only to show the custody refusal still applies.
            SHELTER_CLAIM_ALLOWED_WALLETS: [SHELTER.address, HOT.address, TREASURY.address].join(','),
        } as NodeJS.ProcessEnv),
        ...over,
    };
}

function setup() {
    const claims = memoryModel({ now: () => NOW, unique: [['chainId', 'wallet']] });
    const chain = {
        ethCall: jest.fn<Promise<string>, any[]>(async () =>
            shelterSplitInterface.encodeFunctionResult('treasury', [TREASURY.address])
        ),
    };
    return { claims, chain, service: new ShelterClaimService(claims as any, chain as any) };
}

describe('shelterClaimMessage', () => {
    it('is the fixed five-line text with a checksummed wallet and a UTC date', () => {
        expect(shelterClaimMessage(SHELTER.address.toLowerCase(), 5042, NOW)).toBe(
            [
                'Token Tails shelter payout wallet',
                'Shelter: Pink Paw (Rozine pedute)',
                `Wallet: ${SHELTER.address}`,
                'Chain: 5042',
                'Issued: 2026-10-04',
            ].join('\n')
        );
    });
});

describe('ShelterClaimService', () => {
    it('stores a claim signed by the wallet as pending-rotation', async () => {
        const ctx = setup();
        const signature = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042, NOW));
        await expect(
            ctx.service.claim({ chainId: 5042, wallet: SHELTER.address, signature }, NOW, config())
        ).resolves.toEqual({ status: 'pending-rotation' });
        expect(ctx.claims.rows[0]).toMatchObject({
            wallet: SHELTER.address,
            chainId: 5042,
            status: 'pending-rotation',
        });
        // A pending claim is never shown publicly: anyone could have filed one.
        await expect(ctx.service.latest(config())).resolves.toBeNull();
        // The same claim again adds no row.
        await ctx.service.claim({ chainId: 5042, wallet: SHELTER.address, signature }, NOW, config());
        expect(ctx.claims.rows).toHaveLength(1);
    });

    it("accepts yesterday's message just after midnight", async () => {
        const ctx = setup();
        const signature = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042, '2026-10-03'));
        await expect(
            ctx.service.claim({ chainId: 5042, wallet: SHELTER.address, signature }, NOW, config())
        ).resolves.toEqual({ status: 'pending-rotation' });
    });

    it('refuses a signature by another wallet, or for another chain or day', async () => {
        const ctx = setup();
        const other = Wallet.createRandom();
        const wrongSigner = await other.signMessage(shelterClaimMessage(SHELTER.address, 5042, NOW));
        const wrongChain = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042002, NOW));
        const oldDay = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042, '2026-10-01'));
        for (const signature of [wrongSigner, wrongChain, oldDay, '0x' + '00'.repeat(65)]) {
            await expect(
                ctx.service.claim({ chainId: 5042, wallet: SHELTER.address, signature }, NOW, config())
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('refuses the hot wallet and the treasury, even with a valid signature', async () => {
        const ctx = setup();
        for (const wallet of [HOT, TREASURY]) {
            const signature = await wallet.signMessage(shelterClaimMessage(wallet.address, 5042, NOW));
            await expect(
                ctx.service.claim({ chainId: 5042, wallet: wallet.address, signature }, NOW, config())
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('refuses a wallet Token Tails holds for the shelter, even when it is allowed and signed', async () => {
        // Token Tails holds that key, so it could sign: a held wallet must never become a "shelter" claim.
        const held = Wallet.createRandom();
        const ctx = setup();
        const signature = await held.signMessage(shelterClaimMessage(held.address, 5042, NOW));
        const cfg = config({
            claimAllowedWallets: [SHELTER.address, held.address].map(a => a.toLowerCase()),
            heldWallets: [held.address.toLowerCase()],
        });
        await expect(
            ctx.service.claim({ chainId: 5042, wallet: held.address, signature }, NOW, cfg)
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('returns null when there is no claim', async () => {
        await expect(setup().service.latest(config())).resolves.toBeNull();
    });

    it('refuses a wallet not on SHELTER_CLAIM_ALLOWED_WALLETS, even with a valid signature', async () => {
        const ctx = setup();
        const stranger = Wallet.createRandom();
        const signature = await stranger.signMessage(shelterClaimMessage(stranger.address, 5042, NOW));
        await expect(
            ctx.service.claim({ chainId: 5042, wallet: stranger.address, signature }, NOW, config())
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            ctx.service.claim(
                { chainId: 5042, wallet: stranger.address, signature },
                NOW,
                config({ claimAllowedWallets: [] })
            )
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('refuses a claim for a chain other than the configured one', async () => {
        const ctx = setup();
        const signature = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042002, NOW));
        await expect(
            ctx.service.claim({ chainId: 5042002, wallet: SHELTER.address, signature }, NOW, config())
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('shows only approved or rotated claims for the configured chain', async () => {
        const ctx = setup();
        await ctx.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'pending-rotation' });
        await ctx.claims.create({ chainId: 5042002, wallet: TREASURY.address, status: 'rotated' });
        await expect(ctx.service.latest(config())).resolves.toBeNull();
        ctx.claims.rows[0].status = 'approved';
        await expect(ctx.service.latest(config())).resolves.toEqual({
            wallet: SHELTER.address,
            chainId: 5042,
            status: 'approved',
        });
    });
});

describe('ShelterClaimService.publicGivingVerified', () => {
    const preview = (wallets: string[]) =>
        shelterSplitInterface.encodeFunctionResult('preview', [wallets, wallets.map(() => 1000000), 0]);

    function routed(ctx: ReturnType<typeof setup>, wallets: string[]) {
        ctx.chain.ethCall.mockImplementation(async (_c: any, _to: string, data: string) =>
            data.startsWith(shelterSplitInterface.getFunction('preview')!.selector)
                ? preview(wallets)
                : shelterSplitInterface.encodeFunctionResult('treasury', [TREASURY.address])
        );
    }

    it('is always true on a testnet and false on a mainnet before SHELTER_HANDED_OVER', async () => {
        const ctx = setup();
        await expect(ctx.service.publicGivingVerified(config({ chainId: 5042002 }), NOW)).resolves.toBe(true);
        await expect(ctx.service.publicGivingVerified(config({ handedOver: false }), NOW)).resolves.toBe(false);
        expect(ctx.chain.ethCall).not.toHaveBeenCalled();
    });

    it('needs every split recipient to be a rotated claim that Token Tails does not hold', async () => {
        const ctx = setup();
        const c = config({ handedOver: true });
        routed(ctx, [SHELTER.address]);
        // Handed over by flag, but the split still pays a wallet nobody rotated to.
        await expect(ctx.service.publicGivingVerified(c, NOW)).resolves.toBe(false);

        const ctx2 = setup();
        routed(ctx2, [SHELTER.address]);
        await ctx2.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'rotated' });
        await expect(ctx2.service.publicGivingVerified(c, NOW)).resolves.toBe(true);

        const ctx3 = setup();
        routed(ctx3, [HOT.address]);
        await ctx3.claims.create({ chainId: 5042, wallet: HOT.address, status: 'rotated' });
        await expect(ctx3.service.publicGivingVerified(c, NOW)).resolves.toBe(false);

        const ctx4 = setup();
        const team = Wallet.createRandom().address;
        routed(ctx4, [team]);
        await ctx4.claims.create({ chainId: 5042, wallet: team, status: 'rotated' });
        await expect(
            ctx4.service.publicGivingVerified(config({ handedOver: true, notPublicWallets: [team.toLowerCase()] }), NOW)
        ).resolves.toBe(false);
    });

    it('caches a verdict for 10 minutes and does not cache a failed read', async () => {
        const ctx = setup();
        const c = config({ handedOver: true });
        ctx.chain.ethCall.mockRejectedValueOnce(new Error('down'));
        await expect(ctx.service.publicGivingVerified(c, NOW)).resolves.toBe(false);
        routed(ctx, [SHELTER.address]);
        await ctx.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'rotated' });
        await expect(ctx.service.publicGivingVerified(c, NOW)).resolves.toBe(true);
        const calls = ctx.chain.ethCall.mock.calls.length;
        await expect(ctx.service.publicGivingVerified(c, new Date(NOW.getTime() + 9 * 60 * 1000))).resolves.toBe(true);
        expect(ctx.chain.ethCall.mock.calls.length).toBe(calls);
        ctx.claims.rows[0].status = 'rejected';
        await expect(ctx.service.publicGivingVerified(c, new Date(NOW.getTime() + 11 * 60 * 1000))).resolves.toBe(
            false
        );
    });
});
