// Loads shared/fixtures/shelter-logs.json for the backend specs (the client and Heist parity tests read
// the same file). Not a spec itself: jest runs `*.spec.ts` only, and the build leaves `-spec.ts` out.
import { readFileSync } from 'fs';
import { join } from 'path';
import { RpcLog } from './shelter-logs';

export interface ShelterLogsFixture {
    chainId: number;
    contract: string;
    shelter: string;
    logs: RpcLog[];
    attribution: {
        donations: { txHash: string; source: string }[];
        x402UsedTxs: string[];
        /** Addresses allowed to settle paws (the hot wallet, IMPACT_PAWS_SENDERS). */
        pawSenders: string[];
        /** Sender of each `tt:paws:` transaction. */
        txFrom: Record<string, string>;
    };
    expected: {
        payoutCount: number;
        total18BySymbol: Record<string, string>;
        total18ByKind: Record<string, string>;
        rawAmounts: string[];
        memos: string[];
        pawMemo: string;
        pawMemoBytes: number;
        buckets: Record<string, string>;
        total18ByBucket: Record<string, string>;
        fromBlock: number;
        toBlock: number;
    };
}

export const SHELTER_LOGS_FIXTURE_PATH = join(__dirname, '..', '..', '..', 'shared', 'fixtures', 'shelter-logs.json');

export function loadShelterLogsFixture(): ShelterLogsFixture {
    return JSON.parse(readFileSync(SHELTER_LOGS_FIXTURE_PATH, 'utf8'));
}
