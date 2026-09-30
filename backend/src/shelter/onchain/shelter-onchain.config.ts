import { getAddress, getBigInt, isAddress } from 'ethers';

/** Arc mainnet and testnet. Native USDC has 18 decimals there and pays for gas. */
export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_TESTNET_CHAIN_ID = 5042002;

const DEFAULT_RPC: Record<number, string> = {
    [ARC_MAINNET_CHAIN_ID]: 'https://rpc.mainnet.arc.io',
    [ARC_TESTNET_CHAIN_ID]: 'https://rpc.testnet.arc.io',
};

/** 0.01 USDC in wei (18 decimals). */
const DEFAULT_AMOUNT_WEI = '10000000000000000';
/** 1 USDC in wei: 100 gifts a day at the default amount. */
const DEFAULT_DAILY_BUDGET_WEI = '1000000000000000000';
/** 0.01 USDC in wei per x402 cat card. */
const DEFAULT_X402_PRICE_WEI = '10000000000000000';

export interface ShelterOnchainConfig {
    donateEnabled: boolean;
    x402Enabled: boolean;
    chainId: number;
    rpcUrl: string | null;
    splitAddress: string | null;
    /** Server hot wallet key. Never logged or returned. */
    privateKey: string | null;
    amountWei: bigint;
    dailyBudgetWei: bigint;
    x402PriceWei: bigint;
}

function flag(value: string | undefined): boolean {
    return (value || '').trim().toLowerCase() === 'true';
}

function wei(value: string | undefined, fallback: string): bigint {
    const trimmed = (value || '').trim();
    return getBigInt(/^\d+$/.test(trimmed) ? trimmed : fallback);
}

function address(value: string | undefined): string | null {
    const trimmed = (value || '').trim();
    return trimmed && isAddress(trimmed) ? getAddress(trimmed) : null;
}

/** Reads the SHELTER_* variables. Missing or malformed values fall back to safe defaults (features off). */
export function readShelterConfig(env: NodeJS.ProcessEnv = process.env): ShelterOnchainConfig {
    const chainId = Number((env.SHELTER_CHAIN_ID || '').trim() || ARC_MAINNET_CHAIN_ID);
    const safeChainId = Number.isInteger(chainId) && chainId > 0 ? chainId : ARC_MAINNET_CHAIN_ID;
    const rpcUrl = (env.SHELTER_ARC_RPC_URL || '').trim() || DEFAULT_RPC[safeChainId] || null;
    const privateKey = (env.SHELTER_DONATE_PRIVATE_KEY || '').trim() || null;
    return {
        donateEnabled: flag(env.SHELTER_DONATE_ENABLED),
        x402Enabled: flag(env.SHELTER_X402_ENABLED),
        chainId: safeChainId,
        rpcUrl,
        splitAddress: address(env.SHELTER_SPLIT_ADDRESS),
        privateKey,
        amountWei: wei(env.SHELTER_DONATE_AMOUNT_WEI, DEFAULT_AMOUNT_WEI),
        dailyBudgetWei: wei(env.SHELTER_DONATE_DAILY_BUDGET_WEI, DEFAULT_DAILY_BUDGET_WEI),
        x402PriceWei: wei(env.SHELTER_X402_PRICE_WEI, DEFAULT_X402_PRICE_WEI),
    };
}

const ZERO = getBigInt(0);

/** Server-paid gifts need the flag, an RPC, the split contract, the hot wallet key and a positive amount. */
export function donateReady(config: ShelterOnchainConfig): boolean {
    return !!(
        config.donateEnabled &&
        config.rpcUrl &&
        config.splitAddress &&
        config.privateKey &&
        config.amountWei > ZERO
    );
}

/** Agent payments need the flag, an RPC, the split contract and a positive price. No server key is used. */
export function x402Ready(config: ShelterOnchainConfig): boolean {
    return !!(config.x402Enabled && config.rpcUrl && config.splitAddress && config.x402PriceWei > ZERO);
}

export function explorerTxUrl(txHash: string): string {
    return `https://explorer.arc.io/tx/${txHash}`;
}
