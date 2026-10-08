import { Wallet } from 'ethers';
import {
    buildExactRequirement,
    caipNetwork,
    normalizePaymentHeader,
    decodeAbiString,
    decodeXPayment,
    DEFAULT_TESTNET_FACILITATOR,
    decodeUint8,
    domainMismatch,
    ERC20_TRANSFER_TOPIC,
    ExactChainReader,
    exactReady,
    FacilitatorClient,
    FacilitatorError,
    parseUsdc,
    readExactConfig,
    signatureMatches,
    TRANSFER_WITH_AUTHORIZATION_TYPES,
    X402_V1_NETWORK_CHAIN_IDS,
} from './x402-exact';

// Anvil's well-known dev account #0. Public test vector; it never holds real funds.
const DEV_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEV = new Wallet(DEV_KEY);
const SHELTER = '0x2222222222222222222222222222222222222222';
const SPLIT = '0x1111111111111111111111111111111111111111';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RESOURCE = 'https://api.example.test/shelter/agent/cat-card';
const NOW = 1_790_000_000;

const BASE_ENV = {
    SHELTER_X402_EXACT_ENABLED: 'true',
    SHELTER_X402_EXACT_NETWORK: 'base-sepolia',
    SHELTER_X402_EXACT_ASSET: USDC,
    SHELTER_X402_EXACT_PAYTO: SHELTER,
    SHELTER_X402_EXACT_RPC: 'https://rpc.example.test',
};

function config(extra: Record<string, string> = {}) {
    return readExactConfig({ ...BASE_ENV, ...extra } as any);
}

async function signedHeader(overrides: Record<string, string> = {}, envelope: Record<string, unknown> = {}) {
    const cfg = config();
    const authorization = {
        from: DEV.address,
        to: SHELTER,
        value: '10000',
        validAfter: String(NOW - 10),
        validBefore: String(NOW + 120),
        nonce: '0x' + '5a'.repeat(32),
        ...overrides,
    };
    const signature = await DEV.signTypedData(
        { name: 'USDC', version: '2', chainId: cfg.chainId!, verifyingContract: USDC },
        TRANSFER_WITH_AUTHORIZATION_TYPES,
        authorization
    );
    const body = {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
        payload: { signature, authorization },
        ...envelope,
    };
    return Buffer.from(JSON.stringify(body)).toString('base64');
}

function tamper(header: string, edit: (authorization: any) => void): string {
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
    edit(decoded.payload.authorization);
    return Buffer.from(JSON.stringify(decoded)).toString('base64');
}

describe('readExactConfig', () => {
    it('is off by default', () => {
        const cfg = readExactConfig({} as any);
        expect(exactReady(cfg)).toBe(false);
        expect(cfg.blocked).toMatch(/ENABLED is off/);
    });

    it('is ready on a testnet with the public facilitator and a 0.01 USDC default price', () => {
        const cfg = config();
        expect(exactReady(cfg)).toBe(true);
        expect(cfg).toMatchObject({
            chainId: 84532,
            testnet: true,
            facilitatorUrl: DEFAULT_TESTNET_FACILITATOR,
            assetName: 'USDC',
            assetVersion: '2',
        });
        expect(cfg.priceBase.toString()).toBe('10000');
    });

    it('reads an optional facilitator auth header, named Authorization unless overridden', () => {
        expect(config().facilitatorHeaders).toEqual({});
        expect(config({ SHELTER_X402_FACILITATOR_AUTH: ' Bearer k ' }).facilitatorHeaders).toEqual({
            Authorization: 'Bearer k',
        });
        expect(
            config({ SHELTER_X402_FACILITATOR_AUTH: 'k', SHELTER_X402_FACILITATOR_AUTH_HEADER: 'X-API-Key' })
                .facilitatorHeaders
        ).toEqual({ 'X-API-Key': 'k' });
    });

    it('is not offered on mainnet until the shelter holds its own key', () => {
        const mainnet = {
            SHELTER_X402_EXACT_NETWORK: 'base',
            SHELTER_X402_EXACT_RPC: 'https://rpc.example.test',
            SHELTER_X402_FACILITATOR_URL: 'https://facilitator.example.test/',
        };
        const before = config(mainnet);
        expect(before.testnet).toBe(false);
        expect(exactReady(before)).toBe(false);
        expect(before.blocked).toMatch(/handover/);

        const after = config({ ...mainnet, SHELTER_HANDED_OVER: 'true' });
        expect(exactReady(after)).toBe(true);
        expect(after.facilitatorUrl).toBe('https://facilitator.example.test');
    });

    it('has no default facilitator on mainnet', () => {
        expect(config({ SHELTER_X402_EXACT_NETWORK: 'base', SHELTER_HANDED_OVER: 'true' }).blocked).toMatch(
            /FACILITATOR_URL/
        );
    });

    it('treats an unknown network as mainnet (fail closed)', () => {
        const cfg = config({ SHELTER_X402_EXACT_NETWORK: 'somechain', SHELTER_X402_EXACT_CHAIN_ID: '999' });
        expect(cfg.testnet).toBe(false);
        expect(exactReady(cfg)).toBe(false);
    });

    it('refuses the ShelterSplit contract as payTo (exact pays the shelter wallet directly)', () => {
        expect(config({ SHELTER_X402_EXACT_PAYTO: SPLIT, SHELTER_SPLIT_ADDRESS: SPLIT }).blocked).toMatch(
            /shelter's own wallet, not the ShelterSplit contract/
        );
    });

    it.each([
        ['SHELTER_ROUTER_ADDRESS', /DonateRouter/],
        ['SHELTER_TREASURY_ADDRESS', /treasury/],
    ])('refuses %s as payTo', (key, reason) => {
        expect(config({ SHELTER_X402_EXACT_PAYTO: SPLIT, [key]: SPLIT.toLowerCase() }).blocked).toMatch(reason);
    });

    it('refuses a wallet Token Tails holds for the shelter as payTo (built-in list and SHELTER_HELD_WALLETS)', () => {
        expect(config({ SHELTER_X402_EXACT_PAYTO: '0xE299299b846Ba629f5A591dBF4F562bcC07A0f37' }).blocked).toMatch(
            /a wallet Token Tails holds for the shelter/
        );
        expect(
            config({ SHELTER_X402_EXACT_PAYTO: SPLIT, SHELTER_HELD_WALLETS: ` ${SPLIT.toLowerCase()} ,junk` }).blocked
        ).toMatch(/a wallet Token Tails holds for the shelter/);
    });

    it('refuses the Token Tails hot wallet as payTo (the caller passes its address, never a key)', () => {
        const cfg = readExactConfig({ ...BASE_ENV, SHELTER_X402_EXACT_PAYTO: DEV.address } as any, {
            hotWallet: DEV.address.toLowerCase(),
        });
        expect(cfg.blocked).toMatch(/hot wallet/);
        expect(exactReady(readExactConfig(BASE_ENV as any, { hotWallet: DEV.address }))).toBe(true);
    });

    it('requires an RPC, so every settlement can be read back from the chain', () => {
        expect(config({ SHELTER_X402_EXACT_RPC: '' }).blocked).toMatch(/SHELTER_X402_EXACT_RPC is required/);
    });

    it.each(['arbitrum-sepolia', 'arbitrum', 'optimism-sepolia', 'arc-testnet'])(
        'blocks %s (not an x402 v1 network) unless a custom facilitator is set',
        network => {
            const plain = config({ SHELTER_X402_EXACT_NETWORK: network, SHELTER_HANDED_OVER: 'true' });
            expect(plain.standard).toBe(false);
            expect(plain.blocked).toMatch(/not supported by x402 v1 facilitators/);
            const custom = config({
                SHELTER_X402_EXACT_NETWORK: network,
                SHELTER_HANDED_OVER: 'true',
                SHELTER_X402_FACILITATOR_URL: 'https://custom-facilitator.example.test',
            });
            expect(custom.blocked).toBeNull();
            expect(custom.standard).toBe(false);
        }
    );

    it('uses the public facilitator by default only where it settles x402 v1 exact (base-sepolia)', () => {
        expect(config({ SHELTER_X402_EXACT_NETWORK: 'avalanche-fuji' }).blocked).toMatch(
            /public facilitator settles only base-sepolia/
        );
        const fuji = config({
            SHELTER_X402_EXACT_NETWORK: 'avalanche-fuji',
            SHELTER_X402_FACILITATOR_URL: 'https://f.example.test',
        });
        expect(fuji.blocked).toBeNull();
        expect(fuji.standard).toBe(true);
    });

    it('lists exactly the EVM networks of the x402 1.2.0 NetworkSchema', () => {
        expect(Object.keys(X402_V1_NETWORK_CHAIN_IDS).sort()).toEqual(
            [
                'abstract',
                'abstract-testnet',
                'base-sepolia',
                'base',
                'avalanche-fuji',
                'avalanche',
                'iotex',
                'sei',
                'sei-testnet',
                'polygon',
                'polygon-amoy',
                'peaq',
                'story',
                'educhain',
                'skale-base-sepolia',
            ].sort()
        );
    });

    it('refuses a chain id that contradicts the network name', () => {
        expect(config({ SHELTER_X402_EXACT_CHAIN_ID: '8453' }).blocked).toMatch(/does not match/);
    });

    it.each([
        ['0.01', '10000'],
        ['1', '1000000'],
        ['0.000001', '1'],
    ])('parses %s USDC as %s base units', (value, base) => {
        expect(parseUsdc(value)!.toString()).toBe(base);
    });

    it.each(['0', '-1', '0.0000001', 'abc', ''])('rejects the price %p', value => {
        expect(parseUsdc(value)).toBeNull();
    });
});

describe('buildExactRequirement', () => {
    it('matches the x402 v1 PaymentRequirements shape of the exact EVM spec, with no outputSchema key', () => {
        const requirement = buildExactRequirement(config(), RESOURCE);
        // Field set of the spec's example (specs/x402-specification-v1.md, PaymentRequirements), minus
        // outputSchema: the x402 package's schema makes it an optional record and rejects null.
        expect('outputSchema' in requirement).toBe(false);
        expect(Object.keys(requirement).sort()).toEqual(
            [
                'scheme',
                'network',
                'maxAmountRequired',
                'asset',
                'payTo',
                'resource',
                'description',
                'mimeType',
                'maxTimeoutSeconds',
                'extra',
            ].sort()
        );
        expect(requirement).toEqual({
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '10000',
            asset: USDC,
            payTo: SHELTER,
            resource: RESOURCE,
            description: 'A Token Tails cat card; the price goes to the shelter',
            mimeType: 'application/json',
            maxTimeoutSeconds: 120,
            extra: { name: 'USDC', version: '2' },
        });
    });
});

describe('decodeXPayment', () => {
    const requirement = () => buildExactRequirement(config(), RESOURCE);

    it('decodes a signed header, and the signature recovers to the payer', async () => {
        const payment = decodeXPayment(await signedHeader(), requirement(), NOW);
        expect(typeof payment).toBe('object');
        if (typeof payment === 'string') return;
        expect(payment.payload.authorization.from).toBe(DEV.address);
        expect(signatureMatches(config(), payment)).toBe(true);
    });

    it('detects a signature for other terms', async () => {
        const header = await signedHeader();
        const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
        decoded.payload.authorization.value = '20000';
        const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64');
        const payment = decodeXPayment(tampered, requirement(), NOW);
        expect(typeof payment).toBe('object');
        expect(signatureMatches(config(), payment as any)).toBe(false);
    });

    it.each([
        ['not base64 JSON', async () => '%%%', /base64 JSON/],
        ['another version', async () => signedHeader({}, { x402Version: 2 }), /x402Version/],
        ['another scheme', async () => signedHeader({}, { scheme: 'onchain-receipt' }), /scheme/],
        ['another network', async () => signedHeader({}, { network: 'base' }), /wrong network/],
        ['a payee other than the shelter', async () => signedHeader({ to: SPLIT }), /shelter wallet/],
        ['an underpayment', async () => signedHeader({ value: '9999' }), /below 10000/],
        ['a not-yet-valid window', async () => signedHeader({ validAfter: String(NOW + 60) }), /not valid yet/],
        ['an expired window', async () => signedHeader({ validBefore: String(NOW + 3) }), /expired/],
        ['a window past maxTimeoutSeconds', async () => signedHeader({ validBefore: String(NOW + 181) }), /too long/],
        [
            'a 78-digit validBefore',
            async () => tamper(await signedHeader(), a => (a.validBefore = '9'.repeat(78))),
            /too long/,
        ],
        ['a short nonce', async () => tamper(await signedHeader(), a => (a.nonce = '0x1234')), /nonce/],
        ['a non-decimal value', async () => tamper(await signedHeader(), a => (a.value = '0x10')), /decimal/],
        ['a missing signature', async () => signedHeader({}, { payload: { authorization: {} } }), /signature/],
    ])('refuses %s', async (_label, make, reason) => {
        expect(decodeXPayment(await make(), requirement(), NOW)).toEqual(expect.stringMatching(reason));
    });
});

describe('FacilitatorClient', () => {
    const payment = { x402Version: 1, scheme: 'exact', network: 'base-sepolia', payload: {} } as any;
    const reqs = { scheme: 'exact' } as any;

    it('POSTs the x402 v1 body to /verify and /settle', async () => {
        const fetchFn = jest
            .fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ isValid: true, payer: '0xp' }) })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, transaction: '0xt', network: 'base-sepolia', payer: '0xp' }),
            });
        const client = new FacilitatorClient('https://f.test', fetchFn);

        await expect(client.verify(payment, reqs)).resolves.toEqual({
            isValid: true,
            invalidReason: undefined,
            payer: '0xp',
        });
        await expect(client.settle(payment, reqs)).resolves.toMatchObject({ success: true, transaction: '0xt' });
        expect(fetchFn.mock.calls.map(c => c[0])).toEqual(['https://f.test/verify', 'https://f.test/settle']);
        expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({
            x402Version: 1,
            paymentPayload: payment,
            paymentRequirements: reqs,
        });
    });

    it('keeps a 400 refusal body', async () => {
        const fetchFn = jest.fn().mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ isValid: false, invalidReason: 'insufficient_funds' }),
        });
        await expect(new FacilitatorClient('https://f.test', fetchFn).verify(payment, reqs)).resolves.toMatchObject({
            isValid: false,
            invalidReason: 'insufficient_funds',
        });
    });

    it('maps HTTP errors, network errors and timeouts to FacilitatorError', async () => {
        const http = new FacilitatorClient(
            'https://f.test',
            jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
        );
        await expect(http.verify(payment, reqs)).rejects.toMatchObject({ reason: 'http_500' });

        const down = new FacilitatorClient(
            'https://f.test',
            jest.fn().mockRejectedValue(new TypeError('fetch failed'))
        );
        await expect(down.settle(payment, reqs)).rejects.toBeInstanceOf(FacilitatorError);

        const slow = new FacilitatorClient(
            'https://f.test',
            (_url, init) =>
                new Promise((_resolve, reject) =>
                    init.signal.addEventListener('abort', () =>
                        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
                    )
                ),
            { verifyMs: 5, settleMs: 5 }
        );
        await expect(slow.verify(payment, reqs)).rejects.toMatchObject({ reason: 'timeout' });
    });
});

describe('ExactChainReader', () => {
    const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
    const transferLog = (value: bigint, to = SHELTER, address = USDC) => ({
        address,
        topics: [ERC20_TRANSFER_TOPIC, pad(DEV.address), pad(to)],
        data: '0x' + value.toString(16).padStart(64, '0'),
    });
    const rpc = (result: unknown) =>
        jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ result }) });
    const expected = { asset: USDC, from: DEV.address, payTo: SHELTER, value: BigInt(10000) };

    it('accepts a Transfer from the payer to the shelter wallet', async () => {
        const reader = new ExactChainReader(
            'https://rpc.test',
            rpc({ status: '0x1', logs: [transferLog(BigInt(10000))] })
        );
        await expect(reader.checkTransfer('0xabc', expected)).resolves.toBe('ok');
    });

    it.each([
        ['an underpayment', { status: '0x1', logs: [transferLog(BigInt(9999))] }, /no matching/],
        ['another payee', { status: '0x1', logs: [transferLog(BigInt(10000), SPLIT)] }, /no matching/],
        ['another token', { status: '0x1', logs: [transferLog(BigInt(10000), SHELTER, SPLIT)] }, /no matching/],
        ['a revert', { status: '0x0', logs: [] }, /reverted/],
        ['no receipt yet', null, /^pending$/],
    ])('reports %s', async (_label, receipt, outcome) => {
        await expect(
            new ExactChainReader('https://rpc.test', rpc(receipt)).checkTransfer('0xabc', expected)
        ).resolves.toMatch(outcome);
    });

    it('reads the token name, version and decimals', async () => {
        const abiString = (s: string) =>
            '0x' +
            (32).toString(16).padStart(64, '0') +
            s.length.toString(16).padStart(64, '0') +
            Buffer.from(s).toString('hex').padEnd(64, '0');
        expect(decodeAbiString(abiString('USD Coin'))).toBe('USD Coin');
        const fetchFn = jest
            .fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: abiString('USDC') }) })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: abiString('2') }) })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ result: '0x' + '6'.padStart(64, '0') }),
            });
        await expect(new ExactChainReader('https://rpc.test', fetchFn).domain(USDC)).resolves.toEqual({
            name: 'USDC',
            version: '2',
            decimals: 6,
        });
        expect(decodeUint8('0x')).toBeNull();
        expect(decodeUint8('0x' + 'f'.repeat(64))).toBeNull();
    });

    it('flags a token domain or decimals that do not fit the offer', () => {
        const cfg = { assetName: 'USDC', assetVersion: '2' };
        expect(domainMismatch(cfg, { name: 'USDC', version: '2', decimals: 6 })).toBeNull();
        expect(domainMismatch(cfg, { name: 'USD Coin', version: '2', decimals: 6 })).toMatch(/signatures/);
        expect(domainMismatch(cfg, { name: null, version: null, decimals: 6 })).toMatch(/signatures/);
        expect(domainMismatch(cfg, { name: 'USDC', version: '2', decimals: 18 })).toMatch(/18 decimals/);
    });
});

describe('x402 v2 helpers', () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
    const unb64 = (s: string) => JSON.parse(Buffer.from(s, 'base64').toString());

    it('maps v1 network names to CAIP-2 and keeps eip155 names', () => {
        expect(caipNetwork('base-sepolia')).toBe('eip155:84532');
        expect(caipNetwork('eip155:5042')).toBe('eip155:5042');
        expect(caipNetwork('custom-net', 777)).toBe('eip155:777');
        expect(caipNetwork('custom-net')).toBe('custom-net');
    });

    it('turns a v2 payload into the v1 shape and leaves v1 and junk unchanged', () => {
        const payload = { signature: '0xsig', authorization: { from: '0xa' } };
        const v2 = b64({ x402Version: 2, accepted: { scheme: 'exact', network: 'eip155:84532' }, payload });
        expect(unb64(normalizePaymentHeader(v2, n => (n === 'eip155:84532' ? 'base-sepolia' : n)))).toEqual({
            x402Version: 1,
            scheme: 'exact',
            network: 'base-sepolia',
            payload,
        });
        const receipt = b64({
            x402Version: 2,
            accepted: { scheme: 'onchain-receipt', network: 'eip155:5042' },
            payload: {},
        });
        expect(unb64(normalizePaymentHeader(receipt))).toMatchObject({ x402Version: 1, network: 'eip155:5042' });
        const v1 = b64({ x402Version: 1, scheme: 'exact', network: 'base-sepolia', payload });
        expect(normalizePaymentHeader(v1)).toBe(v1);
        expect(normalizePaymentHeader('not base64 json')).toBe('not base64 json');
    });
});
