import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { encryptKeystoreJson, Wallet } from 'ethers';
import { loadDevShelterKey } from './shelter-dev-key';
import {
    ARC_MAINNET_CHAIN_ID,
    ARC_TESTNET_CHAIN_ID,
    defaultShelterChainId,
    readShelterConfig,
    shelterNetwork,
} from './shelter-onchain.config';

const env = (values: Record<string, string>) => values as NodeJS.ProcessEnv;

describe('default main chain (SHELTER_CHAIN_ID unset)', () => {
    it('is Arc mainnet under NODE_ENV=production and Arc testnet everywhere else', () => {
        expect(readShelterConfig(env({ NODE_ENV: 'production' })).chainId).toBe(ARC_MAINNET_CHAIN_ID);
        expect(readShelterConfig(env({ NODE_ENV: ' Production ' })).chainId).toBe(ARC_MAINNET_CHAIN_ID);
        expect(readShelterConfig(env({})).chainId).toBe(ARC_TESTNET_CHAIN_ID);
        expect(readShelterConfig(env({ NODE_ENV: 'development' })).chainId).toBe(ARC_TESTNET_CHAIN_ID);
        expect(readShelterConfig(env({ NODE_ENV: 'test' })).chainId).toBe(ARC_TESTNET_CHAIN_ID);
    });

    it('SHELTER_NETWORK=mainnet|testnet overrides the NODE_ENV default; anything else is ignored', () => {
        expect(shelterNetwork(env({ SHELTER_NETWORK: 'mainnet' }))).toBe('mainnet');
        expect(shelterNetwork(env({ NODE_ENV: 'production', SHELTER_NETWORK: 'testnet' }))).toBe('testnet');
        expect(shelterNetwork(env({ NODE_ENV: 'production', SHELTER_NETWORK: 'moon' }))).toBe('mainnet');
        expect(defaultShelterChainId(env({ SHELTER_NETWORK: 'MAINNET' }))).toBe(ARC_MAINNET_CHAIN_ID);
    });

    it('SHELTER_CHAIN_ID still wins; a malformed one falls back to the network default', () => {
        expect(readShelterConfig(env({ SHELTER_CHAIN_ID: '84532', NODE_ENV: 'production' })).chainId).toBe(84532);
        expect(readShelterConfig(env({ SHELTER_CHAIN_ID: '5042' })).chainId).toBe(ARC_MAINNET_CHAIN_ID);
        expect(readShelterConfig(env({ SHELTER_CHAIN_ID: 'abc', NODE_ENV: 'production' })).chainId).toBe(
            ARC_MAINNET_CHAIN_ID
        );
        expect(readShelterConfig(env({ SHELTER_CHAIN_ID: '-1' })).chainId).toBe(ARC_TESTNET_CHAIN_ID);
    });
});

describe('loadDevShelterKey (local Foundry keystore)', () => {
    const PASSWORD = 'throwaway-test-password';
    let dir: string;
    let home: string;
    let repo: string;
    let wallet: Wallet;
    let lines: string[];
    const log = (line: string) => lines.push(line);

    beforeAll(async () => {
        wallet = Wallet.createRandom() as unknown as Wallet;
        dir = mkdtempSync(join(tmpdir(), 'shelter-dev-key-'));
        home = join(dir, 'home');
        repo = join(dir, 'repo');
        mkdirSync(join(home, '.foundry', 'keystores'), { recursive: true });
        mkdirSync(join(repo, 'funding', '.secrets'), { recursive: true });
        mkdirSync(join(repo, 'backend'), { recursive: true });
        const json = await encryptKeystoreJson(wallet, PASSWORD, { scrypt: { N: 1 << 10 } });
        writeFileSync(join(home, '.foundry', 'keystores', 'donatehot'), json);
        writeFileSync(join(home, '.foundry', 'keystores', 'other'), json);
        writeFileSync(join(repo, 'funding', '.secrets', 'donatehot-password.txt'), PASSWORD + '\n');
        writeFileSync(join(repo, 'funding', '.secrets', 'other-password.txt'), 'wrong');
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    beforeEach(() => {
        lines = [];
    });

    const run = (values: Record<string, string>) => {
        const e = env(values);
        return { e, result: loadDevShelterKey({ env: e, home, cwd: join(repo, 'backend'), log, warn: log }) };
    };

    it('unlocks the default "donatehot" keystore from the backend folder, sets the key, logs only the address', async () => {
        const { e, result } = run({});
        await expect(result).resolves.toBe(wallet.address);
        expect(e.SHELTER_DONATE_PRIVATE_KEY).toBe(wallet.privateKey);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain(wallet.address);
        expect(lines[0]).not.toContain(wallet.privateKey.slice(2));
        expect(lines[0]).not.toContain(PASSWORD);
        // Nothing written: the temp tree still holds only what the spec made.
        expect(readdirSync(join(repo, 'funding', '.secrets')).sort()).toEqual([
            'donatehot-password.txt',
            'other-password.txt',
        ]);
    });

    it('a wrong password, a missing keystore or a bad name is one warning and no key', async () => {
        for (const name of ['other', 'missing', '../escape']) {
            lines = [];
            const { e, result } = run({ SHELTER_DEV_KEYSTORE: name });
            await expect(result).resolves.toBeNull();
            expect(e.SHELTER_DONATE_PRIVATE_KEY).toBeUndefined();
            expect(lines).toHaveLength(1);
            expect(lines[0]).toMatch(/not unlocked/);
            expect(lines[0]).not.toContain(PASSWORD);
            expect(lines[0]).not.toContain('wrong');
        }
    });

    it('fails soft without a repo root (no funding/ folder above the cwd)', async () => {
        const e = env({});
        await expect(loadDevShelterKey({ env: e, home, cwd: home, log, warn: log })).resolves.toBeNull();
        expect(e.SHELTER_DONATE_PRIVATE_KEY).toBeUndefined();
        expect(lines[0]).toMatch(/no repo root/);
    });

    it('never unlocks under NODE_ENV=production, even with SHELTER_NETWORK=testnet', async () => {
        for (const values of [
            { NODE_ENV: 'production' },
            { NODE_ENV: 'production', SHELTER_NETWORK: 'testnet' },
        ] as Record<string, string>[]) {
            const { e, result } = run(values);
            await expect(result).resolves.toBeNull();
            expect(e.SHELTER_DONATE_PRIVATE_KEY).toBeUndefined();
        }
        expect(lines).toEqual([]);
    });

    it('never unlocks for a mainnet main chain, and leaves a set key alone', async () => {
        for (const values of [{ SHELTER_NETWORK: 'mainnet' }, { SHELTER_CHAIN_ID: '5042' }] as Record<
            string,
            string
        >[]) {
            const { e, result } = run(values);
            await expect(result).resolves.toBeNull();
            expect(e.SHELTER_DONATE_PRIVATE_KEY).toBeUndefined();
        }
        const set = '0x' + '11'.repeat(32);
        const { e, result } = run({ SHELTER_DONATE_PRIVATE_KEY: set });
        await expect(result).resolves.toBeNull();
        expect(e.SHELTER_DONATE_PRIVATE_KEY).toBe(set);
        expect(lines).toEqual([]);
    });
});
