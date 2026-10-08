/**
 * wallet.config.ts as it was before the mainnet wave: every mainnet chain has no ShelterSplit (and so no
 * router), testnets unchanged. Specs that cover the "not deployed yet" behaviour mock the module with it,
 * so they keep testing that state now that real mainnet deployments are recorded (2026-10-07):
 *
 *   jest.mock('src/shelter/onchain/wallet.config', () =>
 *       require('src/shelter/onchain/pre-mainnet.fakes-spec').preMainnetWalletConfig()
 *   );
 */
export function preMainnetWalletConfig() {
    const actual = jest.requireActual('src/shelter/onchain/wallet.config');
    const CHAINS = Object.fromEntries(
        Object.entries(actual.CHAINS as Record<string, { network: string }>).map(([key, chain]) => [
            key,
            chain.network === 'mainnet' ? { ...chain, split: null, otherSplits: [] } : chain,
        ])
    );
    return { ...actual, CHAINS };
}
