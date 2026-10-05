import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { Wallet } from 'ethers';
import { defaultShelterChainId, isProductionEnv, isTestnetChain } from './shelter-onchain.config';

/** The Foundry keystore of the dev hot wallet when SHELTER_DEV_KEYSTORE is unset. */
export const DEFAULT_DEV_KEYSTORE = 'donatehot';

export interface DevShelterKeyOptions {
    env?: NodeJS.ProcessEnv;
    /** Holds `.foundry/keystores/<name>`; the user's home by default. */
    home?: string;
    /** Where the search for the repo root (the folder with `funding/`) starts; the process cwd by default. */
    cwd?: string;
    log?: (line: string) => void;
    warn?: (line: string) => void;
}

/** The repo root: `cwd` or the nearest parent that has a `funding/` folder (the backend runs in backend/). */
function repoRoot(cwd: string): string | null {
    let dir = resolve(cwd);
    for (;;) {
        if (existsSync(join(dir, 'funding'))) {
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

/**
 * Dev only: when SHELTER_DONATE_PRIVATE_KEY is unset, unlock the local Foundry keystore of the hot wallet
 * (`~/.foundry/keystores/<SHELTER_DEV_KEYSTORE or donatehot>`, password in
 * `<repo>/funding/.secrets/<name>-password.txt`) and set SHELTER_DONATE_PRIVATE_KEY for this process
 * only. Never under NODE_ENV=production, and never when the main chain is a mainnet (the dev key must
 * not sign real money). Logs only the derived address; any failure is one warning line, and treats then
 * report the usual missing-key reason. Nothing is written to disk. Returns the address, or null.
 */
export async function loadDevShelterKey(options: DevShelterKeyOptions = {}): Promise<string | null> {
    const env = options.env || process.env;
    const log = options.log || ((line: string) => console.log(line));
    const warn = options.warn || ((line: string) => console.warn(line));
    if ((env.SHELTER_DONATE_PRIVATE_KEY || '').trim() || isProductionEnv(env)) {
        return null;
    }
    const chainId = Number((env.SHELTER_CHAIN_ID || '').trim() || defaultShelterChainId(env));
    if (!isTestnetChain(chainId)) {
        return null;
    }
    const name = (env.SHELTER_DEV_KEYSTORE || '').trim() || DEFAULT_DEV_KEYSTORE;
    try {
        if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.')) {
            throw new Error(`bad keystore name "${name}"`);
        }
        const keystorePath = join(options.home || homedir(), '.foundry', 'keystores', name);
        const root = repoRoot(options.cwd || process.cwd());
        if (!root) {
            throw new Error('no repo root with funding/ above the working directory');
        }
        const passwordPath = join(root, 'funding', '.secrets', `${name}-password.txt`);
        if (!existsSync(keystorePath)) {
            throw new Error(`no keystore at ~/.foundry/keystores/${name}`);
        }
        if (!existsSync(passwordPath)) {
            throw new Error(`no password file funding/.secrets/${name}-password.txt`);
        }
        const json = readFileSync(keystorePath, 'utf8');
        const password = readFileSync(passwordPath, 'utf8').replace(/[\r\n]+$/, '');
        const wallet = await Wallet.fromEncryptedJson(json, password);
        env.SHELTER_DONATE_PRIVATE_KEY = wallet.privateKey;
        log(`shelter dev key: unlocked keystore "${name}", hot wallet ${wallet.address} (this process only)`);
        return wallet.address;
    } catch (error) {
        // The message never carries the password or key: only our own text or the decrypt error class.
        const reason =
            error instanceof Error && /^(bad keystore|no )/.test(error.message) ? error.message : 'unlock failed';
        warn(`shelter dev key: keystore "${name}" not unlocked (${reason}); treats report the missing key`);
        return null;
    }
}
