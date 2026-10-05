import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Wallet } from 'ethers';
import { memoryModel } from 'src/impact/memory-model.fakes-spec';
import { shelterSplitInterface } from './shelter-chain';
import { readShelterConfig, ShelterOnchainConfig } from './shelter-onchain.config';
import {
    claimChainConfigs,
    shelterClaimMessage,
    shelterClaimMessageV2,
    ShelterClaimService,
} from './shelter-claim.service';

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

    it('is always true on a testnet; SHELTER_HANDED_OVER=false closes a mainnet without reading the chain', async () => {
        const ctx = setup();
        await expect(ctx.service.publicGivingVerified(config({ chainId: 5042002 }), NOW)).resolves.toBe(true);
        await expect(ctx.service.publicGivingVerified(config({ givingKilled: true }), NOW)).resolves.toBe(false);
        expect(ctx.chain.ethCall).not.toHaveBeenCalled();
        // Without the emergency off, a mainnet is decided on chain: no rotated claim, so still closed.
        routed(ctx, [SHELTER.address]);
        await expect(ctx.service.publicGivingVerified(config({ handedOver: false }), NOW)).resolves.toBe(false);
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

    it('SEC-2: a split that keeps part of a gift for the treasury, or lists an inactive shelter, is not public giving', async () => {
        const c = config({ handedOver: true });
        const answer = (wallets: string[], amounts: number[], toTreasury: number) => (ctx: ReturnType<typeof setup>) =>
            ctx.chain.ethCall.mockImplementation(async (_c: any, _to: string, data: string) =>
                data.startsWith(shelterSplitInterface.getFunction('preview')!.selector)
                    ? shelterSplitInterface.encodeFunctionResult('preview', [wallets, amounts, toTreasury])
                    : shelterSplitInterface.encodeFunctionResult('treasury', [TREASURY.address])
            );
        // A rotated shelter at 8000 bps: 20% of every gift goes to the treasury.
        const ctx = setup();
        answer([SHELTER.address], [800000], 200000)(ctx);
        await ctx.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'rotated' });
        await expect(ctx.service.publicGivingVerified(c, NOW)).resolves.toBe(false);
        // A deactivated shelter: preview still lists it, with amount 0, and everything goes to the treasury.
        const ctx2 = setup();
        answer([SHELTER.address], [0], 1000000)(ctx2);
        await ctx2.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'rotated' });
        await expect(ctx2.service.publicGivingVerified(c, NOW)).resolves.toBe(false);
        // An inactive, unrotated entry (amount 0) next to the paid, rotated shelter does not block it.
        const ctx3 = setup();
        const old = Wallet.createRandom().address;
        answer([old, SHELTER.address], [0, 1000000], 0)(ctx3);
        await ctx3.claims.create({ chainId: 5042, wallet: SHELTER.address, status: 'rotated' });
        await expect(ctx3.service.publicGivingVerified(c, NOW)).resolves.toBe(true);
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

describe('v2 claims: one signature, a row per chain', () => {
    const BASE_SPLIT = '0x' + '22'.repeat(20);
    const ARB_SPLIT = '0x' + '33'.repeat(20);
    // Main chain Arc (mainnet) plus Base and Arbitrum mainnet; Base Sepolia is a testnet and never claimable here.
    const env = {
        SHELTER_CHAIN_ID: '5042',
        SHELTER_SPLIT_ADDRESS: SPLIT,
        SHELTER_RELAY_CHAINS: '8453,42161,84532',
        SHELTER_CHAIN_8453_SPLIT_ADDRESS: BASE_SPLIT,
        SHELTER_CHAIN_42161_SPLIT_ADDRESS: ARB_SPLIT,
        SHELTER_CHAIN_84532_SPLIT_ADDRESS: BASE_SPLIT,
    } as NodeJS.ProcessEnv;

    it('pins the v2 text: sorted chain ids, or every chain where Pink Paw is listed', () => {
        expect(shelterClaimMessageV2(SHELTER.address.toLowerCase(), [42161, 5042, 8453, 5042], NOW)).toBe(
            [
                'Token Tails shelter payout wallet (v2)',
                'Shelter: Pink Paw (Rozine pedute)',
                `Wallet: ${SHELTER.address}`,
                'Chains: 5042, 8453, 42161',
                'Issued: 2026-10-04',
            ].join('\n')
        );
        expect(shelterClaimMessageV2(SHELTER.address, 'all', '2026-10-04T23:59:59Z')).toContain(
            '\nChains: all chains where Pink Paw is listed\nIssued: 2026-10-04'
        );
        // Never the v1 bytes: a v1 signature cannot be replayed as a multi-chain claim, nor the reverse.
        expect(shelterClaimMessageV2(SHELTER.address, [5042], NOW)).not.toBe(
            shelterClaimMessage(SHELTER.address, 5042, NOW)
        );
    });

    it('claimable chains: the main one and the configured chains of its network class', () => {
        expect(claimChainConfigs(env).map(c => c.chainId)).toEqual([5042, 8453, 42161]);
    });

    it('records one pending row per named chain from one signature', async () => {
        const ctx = setup();
        const signature = await SHELTER.signMessage(shelterClaimMessageV2(SHELTER.address, [5042, 42161], NOW));
        await expect(
            ctx.service.claim({ wallet: SHELTER.address, chains: [42161, 5042], signature }, NOW, config(), env)
        ).resolves.toEqual({
            status: 'pending-rotation',
            chains: [
                { chainId: 5042, status: 'pending-rotation' },
                { chainId: 42161, status: 'pending-rotation' },
            ],
        });
        expect(ctx.claims.rows.map(r => [r.chainId, r.status])).toEqual([
            [5042, 'pending-rotation'],
            [42161, 'pending-rotation'],
        ]);
        // Pending rows stay private per chain.
        const view = await ctx.service.chainsView(env);
        expect(view.map(v => [v.chainId, v.main, v.claim])).toEqual([
            [5042, true, null],
            [8453, false, null],
            [42161, false, null],
        ]);
        ctx.claims.rows[1].status = 'rotated';
        expect((await ctx.service.chainsView(env))[2].claim).toEqual({
            wallet: SHELTER.address,
            chainId: 42161,
            status: 'rotated',
        });
    });

    it('"all chains" covers every claimable chain', async () => {
        const ctx = setup();
        const signature = await SHELTER.signMessage(shelterClaimMessageV2(SHELTER.address, 'all', NOW));
        const res = await ctx.service.claim(
            { wallet: SHELTER.address, allChains: true, signature },
            NOW,
            config(),
            env
        );
        expect(res.chains!.map(c => c.chainId)).toEqual([5042, 8453, 42161]);
        expect(ctx.claims.rows).toHaveLength(3);
    });

    it('refuses an unserved chain, a mismatched chain list, a v1 signature and an unconfirmed wallet', async () => {
        const ctx = setup();
        const sign = (chains: number[] | 'all') =>
            SHELTER.signMessage(shelterClaimMessageV2(SHELTER.address, chains, NOW));
        await expect(
            ctx.service.claim(
                { wallet: SHELTER.address, chains: [5042, 84532], signature: await sign([5042, 84532]) },
                NOW,
                config(),
                env
            )
        ).rejects.toThrow(BadRequestException);
        await expect(
            ctx.service.claim(
                { wallet: SHELTER.address, chains: [5042, 8453], signature: await sign([5042]) },
                NOW,
                config(),
                env
            )
        ).rejects.toThrow(BadRequestException);
        const v1 = await SHELTER.signMessage(shelterClaimMessage(SHELTER.address, 5042, NOW));
        await expect(
            ctx.service.claim({ wallet: SHELTER.address, chains: [5042], signature: v1 }, NOW, config(), env)
        ).rejects.toThrow(BadRequestException);
        const stranger = Wallet.createRandom();
        const signed = await stranger.signMessage(shelterClaimMessageV2(stranger.address, [5042], NOW));
        await expect(
            ctx.service.claim({ wallet: stranger.address, chains: [5042], signature: signed }, NOW, config(), env)
        ).rejects.toThrow(ForbiddenException);
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('refuses the whole claim when the wallet is the rail on any named chain', async () => {
        const ctx = setup();
        const sneaky = { ...env, SHELTER_CHAIN_8453_TREASURY_ADDRESS: SHELTER.address };
        const signature = await SHELTER.signMessage(shelterClaimMessageV2(SHELTER.address, [5042, 8453], NOW));
        await expect(
            ctx.service.claim({ wallet: SHELTER.address, chains: [5042, 8453], signature }, NOW, config(), sneaky)
        ).rejects.toThrow(/chain 8453/);
        expect(ctx.claims.rows).toHaveLength(0);
    });

    it('publicGivingVerified takes a chain id; an unserved chain is closed', async () => {
        const ctx = setup();
        await expect(ctx.service.publicGivingVerified(999999, NOW)).resolves.toBe(false);
    });
});
